"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ProfilePoint } from "@/lib/gpx";
import { DEM_TILES, MAP_STYLE, SATELLITE_TILES } from "@/lib/map-sources";
import type { RouteSummary } from "@/lib/routes";

// Los nombres de los caches y la llave de las teselas vectoriales los comparte public/sw.js
const MAP_CACHE = "brecha-mapas";
const STYLE_CACHE = "brecha-estilo";
const ROUTES_CACHE = "brecha-rutas";
const ROUTE_KEY = "/__descargas/";
// portada de cada ruta, en el mismo cache pero fuera de las llaves que lee el service worker
const COVER_KEY = "/__portadas/";

type LineCoords = [number, number][];

export type OfflineRouteInfo = Pick<RouteSummary, "slug" | "name" | "place_label" | "difficulty" | "distance_km" | "elevation_gain_m" | "duration_min" | "cover_url">;

export type OfflineRoute = OfflineRouteInfo & {
  line: LineCoords;
  profile: ProfilePoint[] | null;
  /** Llaves de las teselas en el cache: al borrar se quitan las que ninguna otra ruta usa */
  tiles: string[];
  bytes: number;
  savedAt: string;
  /** false mientras baja o si se cortó; los registros viejos no lo traen y cuentan como completos */
  complete?: boolean;
};

/** El visor sin conexión no deja alejarse ni acercarse más allá de lo descargado. */
export const OFFLINE_ZOOM = { min: 10, max: 16 };

const RAD = Math.PI / 180;
const EARTH_M = 40075016.686;
// alrededor del sendero, más angosto entre más detalle: en 3D lo lejano se ve con zooms bajos
const OUTER_M = 15000;
const CORRIDOR: { upTo: number; meters: number }[] = [
  { upTo: 12, meters: OUTER_M },
  { upTo: 14, meters: 3000 },
  { upTo: 15, meters: 1200 },
  { upTo: 17, meters: 500 },
];
// teselas de 256 px: con el mapa en zoom 16 se piden de zoom 17
const SATELLITE_ZOOMS: [number, number] = [8, 17];
const DEM_ZOOMS: [number, number] = [8, 14];
const VECTOR_MAX_ZOOM = 14;
const MAX_TILES = 4000;
// para estimar antes de bajar; lo real se mide al descargar
const KB_PER_TILE = { satellite: 22, dem: 60, vector: 30 };
const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];
const CONCURRENCY = 6;

export function offlineSupported() {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

function metersToDegrees(meters: number, lat: number) {
  return { lat: meters / 110540, lng: meters / (111320 * Math.cos(lat * RAD)) };
}

/** Caja del trazo más el margen exterior descargado. */
export function offlineBounds(line: LineCoords): [[number, number], [number, number]] {
  const lngs = line.map((p) => p[0]);
  const lats = line.map((p) => p[1]);
  const pad = metersToDegrees(OUTER_M, (Math.min(...lats) + Math.max(...lats)) / 2);
  return [
    [Math.min(...lngs) - pad.lng, Math.min(...lats) - pad.lat],
    [Math.max(...lngs) + pad.lng, Math.max(...lats) + pad.lat],
  ];
}

function tileX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function tileY(lat: number, z: number) {
  const sin = Math.sin(lat * RAD);
  return Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** z);
}

/** Puntos del trazo con a lo más `step` metros entre ellos. */
function densify(line: LineCoords, step: number) {
  const out: LineCoords = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [lng0, lat0] = line[i - 1];
    const [lng1, lat1] = line[i];
    const dx = (lng1 - lng0) * 111320 * Math.cos(lat0 * RAD);
    const dy = (lat1 - lat0) * 110540;
    const n = Math.ceil(Math.hypot(dx, dy) / step);
    for (let k = 1; k <= n; k++) out.push([lng0 + ((lng1 - lng0) * k) / n, lat0 + ((lat1 - lat0) * k) / n]);
  }
  return out;
}

/** Teselas `z/x/y` que tocan el corredor alrededor del trazo. */
function corridorTiles(line: LineCoords, [minZoom, maxZoom]: [number, number]) {
  const tiles: [number, number, number][] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const buffer = (CORRIDOR.find((c) => z <= c.upTo) ?? CORRIDOR[CORRIDOR.length - 1]).meters;
    const tileM = (EARTH_M * Math.cos(line[0][1] * RAD)) / 2 ** z;
    const last = 2 ** z - 1;
    const seen = new Set<number>();
    for (const [lng, lat] of densify(line, Math.min(buffer, tileM) / 2)) {
      const d = metersToDegrees(buffer, lat);
      const x0 = Math.max(tileX(lng - d.lng, z), 0);
      const x1 = Math.min(tileX(lng + d.lng, z), last);
      const y0 = Math.max(tileY(lat + d.lat, z), 0);
      const y1 = Math.min(tileY(lat - d.lat, z), last);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = x * 2 ** z + y;
          if (seen.has(key)) continue;
          seen.add(key);
          tiles.push([z, x, y]);
        }
      }
    }
  }
  return tiles;
}

function tileUrl(template: string, [z, x, y]: [number, number, number]) {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** OpenFreeMap versiona sus teselas cada semana: se guardan sin la versión para que sirvan con el TileJSON que haya. */
export function tileCacheKey(url: string) {
  return url.replace(/(tiles\.openfreemap\.org\/planet)\/[^/]+(\/\d+\/\d+\/\d+\.pbf)$/, "$1$2");
}

/** Cuántas teselas y megas ocuparía la ruta, sin pedir nada a la red. */
export function estimateDownload(line: LineCoords) {
  const satellite = corridorTiles(line, SATELLITE_ZOOMS).length;
  const dem = corridorTiles(line, DEM_ZOOMS).length;
  const vector = corridorTiles(line, [SATELLITE_ZOOMS[0], VECTOR_MAX_ZOOM]).length;
  const kb = satellite * KB_PER_TILE.satellite + dem * KB_PER_TILE.dem + vector * KB_PER_TILE.vector;
  return { tiles: satellite + dem + vector, mb: kb / 1024 };
}

type StyleJson = {
  glyphs?: string;
  sprite?: string | { id: string; url: string }[];
  sources: Record<string, { type: string; url?: string; tiles?: string[]; minzoom?: number; maxzoom?: number }>;
  layers: { layout?: Record<string, unknown> }[];
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Estilo, TileJSON, fuentes y sprites del mapa base, y la plantilla de teselas de cada fuente. */
async function styleResources(signal: AbortSignal) {
  const style = await getJson<StyleJson>(MAP_STYLE, signal);
  const urls = [MAP_STYLE];
  const sources: { template: string; zooms: [number, number] }[] = [];
  for (const source of Object.values(style.sources)) {
    let { tiles, maxzoom = VECTOR_MAX_ZOOM } = source;
    if (source.url) {
      urls.push(source.url);
      const tileJson = await getJson<{ tiles: string[]; maxzoom?: number }>(source.url, signal);
      tiles = tileJson.tiles;
      maxzoom = tileJson.maxzoom ?? maxzoom;
    }
    const top = Math.min(maxzoom, VECTOR_MAX_ZOOM);
    if (tiles?.[0]) sources.push({ template: tiles[0], zooms: [Math.min(SATELLITE_ZOOMS[0], top), top] });
  }
  const fonts = new Set<string>();
  for (const layer of style.layers) {
    const font = layer.layout?.["text-font"];
    if (Array.isArray(font) && font.every((f) => typeof f === "string")) fonts.add(font.join(","));
  }
  if (style.glyphs) {
    for (const font of fonts) for (const range of GLYPH_RANGES) urls.push(style.glyphs.replace("{fontstack}", font).replace("{range}", range));
  }
  const sprites = typeof style.sprite === "string" ? [style.sprite] : (style.sprite ?? []).map((s) => s.url);
  for (const sprite of sprites) for (const suffix of [".json", ".png", "@2x.json", "@2x.png"]) urls.push(sprite + suffix);
  return { urls, sources };
}

async function fetchInto(cache: Cache, url: string, signal: AbortSignal, key = url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal });
      // teselas que no existen (mar, sin imagen): no hay nada que guardar
      if (res.status === 404 || res.status === 204) return 0;
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const body = await res.blob();
      await cache.put(key, new Response(body, { headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" } }));
      return body.size;
    } catch (e) {
      if (signal.aborted || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function routesCache() {
  return caches.open(ROUTES_CACHE);
}

export async function listOfflineRoutes(): Promise<OfflineRoute[]> {
  const cache = await routesCache();
  const keys = (await cache.keys()).filter((req) => new URL(req.url).pathname.startsWith(ROUTE_KEY));
  const routes = await Promise.all(keys.map(async (req) => (await cache.match(req))!.json() as Promise<OfflineRoute>));
  return routes.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getOfflineRoute(slug: string): Promise<OfflineRoute | null> {
  const res = await (await routesCache()).match(ROUTE_KEY + encodeURIComponent(slug));
  return res ? res.json() : null;
}

/** Baja estilo, satélite, relieve y mapa base del corredor de la ruta, y guarda la ruta para el visor sin conexión. */
export async function downloadRoute(
  route: OfflineRouteInfo,
  line: LineCoords,
  profile: ProfilePoint[] | null,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<OfflineRoute> {
  // sin esto el navegador puede borrar el cache cuando le falta espacio
  await navigator.storage?.persist?.().catch(() => false);
  const style = await styleResources(signal);
  const tileTemplates = [
    { template: SATELLITE_TILES, zooms: SATELLITE_ZOOMS },
    { template: DEM_TILES, zooms: DEM_ZOOMS },
    ...style.sources,
  ];
  const tiles = [...new Set(tileTemplates.flatMap(({ template, zooms }) => corridorTiles(line, zooms).map((t) => tileUrl(template, t))))];
  if (tiles.length > MAX_TILES) throw new Error("La ruta es demasiado extensa para guardarla sin conexión.");

  // el registro va antes de bajar: si se corta, la ruta queda incompleta y sus teselas se pueden borrar
  const saveRecord = async (record: OfflineRoute) =>
    (await routesCache()).put(ROUTE_KEY + encodeURIComponent(route.slug), new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json" } }));
  // al reanudar se parte de lo ya bajado: las teselas en cache se saltan
  const prev = await getOfflineRoute(route.slug);
  let bytes = prev?.complete === false ? prev.bytes : 0;
  const record: OfflineRoute = { ...route, line, profile, tiles: tiles.map(tileCacheKey), bytes, savedAt: new Date().toISOString(), complete: false };
  await saveRecord(record);
  const storage = await navigator.storage?.estimate?.().catch(() => undefined);
  if (storage?.quota !== undefined && storage.usage !== undefined && storage.quota - storage.usage < estimateDownload(line).mb * 1024 * 1024) {
    throw new Error("No hay espacio suficiente en el dispositivo");
  }

  const [mapCache, styleCache] = await Promise.all([caches.open(MAP_CACHE), caches.open(STYLE_CACHE)]);
  const jobs = [...style.urls.map((url) => ({ url, cache: styleCache, key: url })), ...tiles.map((url) => ({ url, cache: mapCache, key: tileCacheKey(url) }))];
  let done = 0;
  let next = 0;
  let failed = false;
  onProgress(0, jobs.length);
  try {
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        // al primer fallo los demás dejan de bajar
        while (!failed && next < jobs.length) {
          const job = jobs[next++];
          try {
            // compartida con otra ruta ya descargada
            if (job.cache !== mapCache || !(await mapCache.match(job.key))) bytes += await fetchInto(job.cache, job.url, signal, job.key);
          } catch (e) {
            failed = true;
            throw e;
          }
          onProgress(++done, jobs.length);
        }
      }),
    );
    // sin portada si falla: no vale perder la descarga por una foto
    if (route.cover_url) await fetchInto(await routesCache(), route.cover_url, signal, COVER_KEY + encodeURIComponent(route.slug)).catch(() => 0);
    signal.throwIfAborted();
  } catch (e) {
    // cortada o con error: se guarda lo bajado para que Reanudar sume
    await saveRecord({ ...record, bytes });
    throw e;
  }
  const saved: OfflineRoute = { ...record, bytes, complete: true };
  await saveRecord(saved);
  await cacheOfflineShell();
  return saved;
}

export async function deleteOfflineRoute(slug: string) {
  const routes = await listOfflineRoutes();
  const target = routes.find((r) => r.slug === slug);
  if (!target) return;
  const kept = new Set(routes.filter((r) => r.slug !== slug).flatMap((r) => r.tiles));
  const mapCache = await caches.open(MAP_CACHE);
  await Promise.all(target.tiles.filter((t) => !kept.has(t)).map((t) => mapCache.delete(t)));
  const cache = await routesCache();
  await Promise.all([cache.delete(ROUTE_KEY + encodeURIComponent(slug)), cache.delete(COVER_KEY + encodeURIComponent(slug))]);
  setDownload(slug, null);
}

export async function getOfflineCover(slug: string) {
  const res = await (await routesCache()).match(COVER_KEY + encodeURIComponent(slug));
  return res ? res.blob() : null;
}

/** Uso y cuota del almacenamiento, y si el navegador promete no borrarlo; null sin la API. */
export async function storageStatus() {
  const [estimate, persisted] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]);
  return estimate ? { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted: !!persisted } : null;
}

export type DownloadState =
  | { status: "en-cola" | "incompleta"; error?: string }
  | { status: "bajando"; done: number; total: number }
  | { status: "lista"; bytes: number };

type Job = { route: OfflineRouteInfo; line: LineCoords; profile: ProfilePoint[] | null; prev?: DownloadState };
type Downloads = { routes: Readonly<Record<string, DownloadState>> | null; done: number; total: number };

// cola de una ruta a la vez: vive mientras la app está abierta y sobrevive la navegación del cliente
let downloads: Downloads = { routes: null, done: 0, total: 0 };
let loaded = false;
let current: { slug: string; controller: AbortController } | null = null;
const queue: Job[] = [];
const downloadListeners = new Set<() => void>();
const SERVER_DOWNLOADS: Downloads = { routes: null, done: 0, total: 0 };

function emitDownloads(next: Partial<Downloads>) {
  downloads = { ...downloads, ...next };
  downloadListeners.forEach((l) => l());
}

function setDownload(slug: string, state: DownloadState | null | undefined) {
  const routes = { ...downloads.routes };
  if (state) routes[slug] = state;
  else delete routes[slug];
  emitDownloads({ routes });
}

function subscribeDownloads(listener: () => void) {
  downloadListeners.add(listener);
  return () => downloadListeners.delete(listener);
}

function loadDownloads() {
  if (loaded || !offlineSupported()) return;
  loaded = true;
  listOfflineRoutes()
    .catch(() => [])
    .then((saved) => {
    const routes = { ...downloads.routes };
    for (const r of saved) routes[r.slug] ??= r.complete === false ? { status: "incompleta" } : { status: "lista", bytes: r.bytes };
    emitDownloads({ routes });
  });
}

async function runQueue() {
  const job = current ? undefined : queue.shift();
  if (!job) return;
  const slug = job.route.slug;
  const controller = new AbortController();
  current = { slug, controller };
  setDownload(slug, { status: "bajando", done: 0, total: 1 });
  try {
    const saved = await downloadRoute(job.route, job.line, job.profile, (done, total) => {
        // un progreso tardío no pisa el estado de una ruta que ya no es la actual
        if (current?.controller === controller) setDownload(slug, { status: "bajando", done, total });
      }, controller.signal);
    setDownload(slug, { status: "lista", bytes: saved.bytes });
  } catch (e) {
    let error: string | undefined;
    if (!controller.signal.aborted) {
      console.error("descarga sin conexión:", e);
      error = e instanceof Error && /^(La ruta|No hay espacio)/.test(e.message) ? e.message : "No se pudo descargar. Revisa tu conexión e inténtalo otra vez.";
    }
    setDownload(slug, { status: "incompleta", error });
  }
  current = null;
  // la cola vacía cierra la tanda: el contador vuelve a cero
  emitDownloads(queue.length ? { done: downloads.done + 1 } : { done: 0, total: 0 });
  void runQueue();
}

/** Agrega la ruta a la cola si no está ya bajando o esperando. */
export function queueDownload(route: OfflineRouteInfo, line: LineCoords, profile: ProfilePoint[] | null) {
  if (current?.slug === route.slug || queue.some((j) => j.route.slug === route.slug)) return;
  queue.push({ route, line, profile, prev: downloads.routes?.[route.slug] });
  setDownload(route.slug, { status: "en-cola" });
  emitDownloads({ total: downloads.total + 1 });
  void runQueue();
}

/** Quita la ruta de la cola o corta su descarga (queda incompleta). */
export function cancelDownload(slug: string) {
  const i = queue.findIndex((j) => j.route.slug === slug);
  if (i >= 0) {
    setDownload(slug, queue.splice(i, 1)[0].prev);
    emitDownloads({ total: downloads.total - 1 });
  }
  if (current?.slug === slug) current.controller.abort();
}

export function cancelAllDownloads() {
  for (const job of queue.splice(0)) setDownload(job.route.slug, job.prev);
  emitDownloads({ total: downloads.done + (current ? 1 : 0) });
  current?.controller.abort();
}

/** Estado de descarga por slug (null mientras se lee el dispositivo) y el avance de la tanda en cola. */
export function useDownloads(fromDevice = true) {
  // sin fromDevice solo se lee la cola en memoria (la píldora, en todas las páginas)
  useEffect(() => {
    if (fromDevice) loadDownloads();
  }, [fromDevice]);
  return useSyncExternalStore(subscribeDownloads, () => downloads, () => SERVER_DOWNLOADS);
}

/** Pide al service worker guardar la página de descargas y sus scripts, para abrirla sin red. */
export async function cacheOfflineShell() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage({ type: "cache-shell", force: true });
}

function isIosSafariTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

const noSubscribe = () => () => {};

/** En iPhone lo guardado desde Safari no aparece en la app instalada en la pantalla de inicio. */
export function useIosSafariTab() {
  return useSyncExternalStore(noSubscribe, isIosSafariTab, () => false);
}

export function formatMb(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("es-MX", { maximumFractionDigits: 1 })} GB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es-MX", { maximumFractionDigits: bytes < 10 * 1024 * 1024 ? 1 : 0 })} MB`;
}
