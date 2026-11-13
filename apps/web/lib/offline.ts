"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ProfilePoint } from "@/lib/gpx";
import { cellsAreaKm2, zoneCells, zoneTiles, type Tile } from "@/lib/hex-grid";
import { DEM_TILES, MAP_STYLE, SATELLITE_TILES } from "@/lib/map-sources";
import type { RouteSummary } from "@/lib/routes";

// Los nombres de los caches y la llave de las teselas vectoriales los comparte public/sw.js
const MAP_CACHE = "brecha-mapas";
const STYLE_CACHE = "brecha-estilo";
const ROUTES_CACHE = "brecha-rutas";
// capas regionales (caminos, cauces, miradores, acampar): archivos completos, compartidos entre rutas
const LAYERS_CACHE = "brecha-capas";
const ROUTE_KEY = "/__descargas/";
// portada de cada ruta, en el mismo cache pero fuera de las llaves que lee el service worker
const COVER_KEY = "/__portadas/";

type LineCoords = [number, number][];
type Bounds = [w: number, s: number, e: number, n: number];

// igual que BASE en lib/lidar-layer.ts (aquí sin maplibre)
const LAYERS_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/capas/lidar-izta`;
// capas regionales por grupo: archivos completos (son chicos); los megas son aproximados, para la hoja
const LAYER_GROUPS = {
  roads: { files: ["brechas.pmtiles"], mb: 0.4 },
  waterfalls: { files: ["cauces.pmtiles", "cascadas.geojson"], mb: 1.8 },
  viewpoints: { files: ["zonas_volcanes.pmtiles", "miradores.geojson", "campamento.geojson"], mb: 1.1 },
};
// del relieve LiDAR solo se bajan las teselas de la zona; estos van completos
const LIDAR_FILES = ["cobertura.geojson", "candidatos.geojson", "hallazgos.geojson"];
const LIDAR_ZOOMS: [number, number] = [9, 15];

/** capa.json: el relieve viene partido en varios PMTiles (como en lib/lidar-layer.ts). */
type LayerManifest = { partes: string[]; bounds: Bounds };

/** Los `bounds` de capa.json si el trazo toca la zona analizada; null si no la toca o no se pudo leer. */
export async function layerZone(line: LineCoords, signal?: AbortSignal): Promise<Bounds | null> {
  try {
    const { bounds } = await getJson<LayerManifest>(`${LAYERS_BASE}/capa.json`, signal);
    const [w, s, e, n] = bounds;
    const lngs = line.map((p) => p[0]);
    const lats = line.map((p) => p[1]);
    return Math.min(...lngs) <= e && Math.max(...lngs) >= w && Math.min(...lats) <= n && Math.max(...lats) >= s ? bounds : null;
  } catch {
    if (signal?.aborted) throw signal.reason;
    return null;
  }
}

/** Si el trazo toca la zona analizada (los `bounds` de capa.json); false si no se pudo leer. */
export async function touchesLayerZone(line: LineCoords, signal?: AbortSignal) {
  return !!(await layerZone(line, signal));
}

export type OfflineRouteInfo = Pick<RouteSummary, "slug" | "name" | "place_label" | "difficulty" | "distance_km" | "elevation_gain_m" | "duration_min" | "cover_url">;

/** Qué se lleva además del mapa y el satélite (obligatorios) y los nombres (van en el mapa base). */
export type DownloadOptions = {
  /** teselas del modelo de elevación: relieve 3D y sombreado */
  terrain: boolean;
  /** se dibujan del mismo modelo de elevación: sin relieve no hay curvas */
  contours: boolean;
  roads: boolean;
  waterfalls: boolean;
  viewpoints: boolean;
  lidar: boolean;
};

export const RADII_KM = [2, 5, 10] as const;
export const DEFAULT_RADIUS_KM = 5;
export const DEFAULT_OPTIONS: DownloadOptions = { terrain: true, contours: true, roads: true, waterfalls: false, viewpoints: false, lidar: false };

export type OfflineRoute = OfflineRouteInfo & {
  line: LineCoords;
  profile: ProfilePoint[] | null;
  /** Llaves de las teselas en el cache: al borrar se quitan las que ninguna otra ruta usa */
  tiles: string[];
  bytes: number;
  savedAt: string;
  /** false mientras baja o si se cortó; los registros viejos no lo traen y cuentan como completos */
  complete?: boolean;
  /** Zona descargada: radio y celdas de lib/hex-grid.ts. Los registros de formato anterior no la traen */
  radiusKm?: number;
  cells?: string[];
  /** Lo que se guardó; las capas regionales y el LiDAR solo quedan en true si la ruta toca su zona */
  options?: DownloadOptions;
  /** Formato anterior: true si quedaron guardadas las capas regionales. Solo se lee */
  layers?: boolean;
};

/** El visor sin conexión no deja alejarse ni acercarse más allá de lo descargado. */
export const OFFLINE_ZOOM = { min: 10, max: 16 };

const RAD = Math.PI / 180;
const EARTH_M = 40075016.686;
// contexto lejano (zooms ≤ 12, para el horizonte en 3D): corredor alrededor del sendero, no hexágonos
const OUTER_M = 15000;
const CONTEXT_ZOOMS: [number, number] = [8, 12];
// detalle completo dentro de la zona de hexágonos; teselas de 256 px: con el mapa en zoom 16 se piden de zoom 17
const SATELLITE_MAX_ZOOM = 17;
const VECTOR_MAX_ZOOM = 14;
const DEM_MAX_ZOOM = 14;
// ≈ 15 000 con 10 km alrededor de una ruta de ~25 km y todo encendido
const MAX_TILES = 20000;
// para estimar antes de bajar; lo real se mide al descargar (LiDAR: 66 MB entre 10 056 teselas)
const KB_PER_TILE = { satellite: 22, dem: 60, vector: 30, lidar: 6.5 };
const GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];
const CONCURRENCY = 6;
// lo que falla se aparta y se reintenta en otra pasada tras estas esperas; si sigue fallando, la descarga queda en pausa
const RETRY_MS = [2000, 5000, 15000];
// plazo por petición (sin señal, fetch no falla: se cuelga); el de public/sw.js (8 s) es corto con 6 a la vez y red lenta
const JOB_TIMEOUT_MS = 60000;
// en pausa sigue al volver la red o la página, o cada minuto por si `online` no llega; nunca antes de 10 s
const RESUME_EVERY_MS = 60000;
const RESUME_MIN_MS = 10000;
const NO_SPACE = "No hay espacio suficiente en el dispositivo";

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

/** Teselas `z/x/y` que tocan el corredor de contexto (OUTER_M) alrededor del trazo. */
function corridorTiles(line: LineCoords, [minZoom, maxZoom]: [number, number]) {
  const tiles: Tile[] = [];
  const buffer = OUTER_M;
  for (let z = minZoom; z <= maxZoom; z++) {
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

/** Contexto lejano por corredor más detalle por la zona de hexágonos, sin repetir. */
function areaTiles(line: LineCoords, cells: string[], [minZoom, maxZoom]: [number, number]): Tile[] {
  const context = corridorTiles(line, [minZoom, Math.min(maxZoom, CONTEXT_ZOOMS[1])]);
  return maxZoom > CONTEXT_ZOOMS[1] ? [...context, ...zoneTiles(cells, [Math.max(minZoom, CONTEXT_ZOOMS[1] + 1), maxZoom])] : context;
}

function tileUrl(template: string, [z, x, y]: Tile) {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** OpenFreeMap versiona sus teselas cada semana: se guardan sin la versión para que sirvan con el TileJSON que haya. */
export function tileCacheKey(url: string) {
  return url.replace(/(tiles\.openfreemap\.org\/planet)\/[^/]+(\/\d+\/\d+\/\d+\.pbf)$/, "$1$2");
}

export type DownloadEstimate = {
  cells: string[];
  areaKm2: number;
  tiles: { satellite: number; dem: number; vector: number; lidar: number };
  /** megas de cada fila de la hoja, encendida o no; las regionales y el LiDAR en 0 si la ruta no toca su zona */
  rows: { map: number; terrain: number; roads: number; waterfalls: number; viewpoints: number; lidar: number };
  /** total de lo encendido */
  mb: number;
};

/** Zona, teselas y megas de la descarga, sin pedir nada a la red; `zone` son los `bounds` de capa.json si la ruta los toca. */
export function estimateDownload(line: LineCoords, radiusKm = DEFAULT_RADIUS_KM, options = DEFAULT_OPTIONS, zone: Bounds | null = null): DownloadEstimate {
  const cells = zoneCells(line, radiusKm);
  const tiles = {
    satellite: areaTiles(line, cells, [CONTEXT_ZOOMS[0], SATELLITE_MAX_ZOOM]).length,
    dem: areaTiles(line, cells, [CONTEXT_ZOOMS[0], DEM_MAX_ZOOM]).length,
    vector: areaTiles(line, cells, [CONTEXT_ZOOMS[0], VECTOR_MAX_ZOOM]).length,
    lidar: zone ? zoneTiles(cells, LIDAR_ZOOMS, zone).length : 0,
  };
  const mb = (n: number, kb: number) => (n * kb) / 1024;
  const rows = {
    map: mb(tiles.satellite, KB_PER_TILE.satellite) + mb(tiles.vector, KB_PER_TILE.vector),
    terrain: mb(tiles.dem, KB_PER_TILE.dem),
    roads: zone ? LAYER_GROUPS.roads.mb : 0,
    waterfalls: zone ? LAYER_GROUPS.waterfalls.mb : 0,
    viewpoints: zone ? LAYER_GROUPS.viewpoints.mb : 0,
    lidar: mb(tiles.lidar, KB_PER_TILE.lidar),
  };
  const total = rows.map + (Object.keys(rows) as (keyof typeof rows)[]).reduce((sum, k) => sum + (k !== "map" && options[k] ? rows[k] : 0), 0);
  return { cells, areaKm2: cellsAreaKm2(cells), tiles, rows, mb: total };
}

type StyleJson = {
  glyphs?: string;
  sprite?: string | { id: string; url: string }[];
  sources: Record<string, { type: string; url?: string; tiles?: string[]; minzoom?: number; maxzoom?: number }>;
  layers: { layout?: Record<string, unknown> }[];
};

/** Lo que no se arregla esperando: la descarga queda incompleta en vez de en pausa. */
class FatalError extends Error {}

function httpError(url: string, status: number) {
  // 408 y 429 son de red lenta o saturada: se reintentan
  const fatal = status >= 400 && status < 500 && status !== 408 && status !== 429;
  return new (fatal ? FatalError : Error)(`${url}: ${status}`);
}

/** Espera `ms` (con `wake`, también hasta que vuelva la red o la página); corta de inmediato si se cancela. */
function wait(ms: number, signal: AbortSignal, wake = false) {
  return new Promise<void>((resolve, reject) => {
    const off = new AbortController();
    const end = (settle: () => void) => {
      clearTimeout(timer);
      off.abort();
      settle();
    };
    const timer = setTimeout(() => end(resolve), ms);
    signal.addEventListener("abort", () => end(() => reject(signal.reason)), { signal: off.signal });
    if (wake) {
      window.addEventListener("online", () => end(resolve), { signal: off.signal });
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && end(resolve), { signal: off.signal });
    }
    if (signal.aborted) end(() => reject(signal.reason));
  });
}

function withTimeout(signal: AbortSignal) {
  return "any" in AbortSignal ? AbortSignal.any([signal, AbortSignal.timeout(JOB_TIMEOUT_MS)]) : signal;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw httpError(url, res.status);
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
    if (tiles?.[0]) sources.push({ template: tiles[0], zooms: [Math.min(CONTEXT_ZOOMS[0], top), top] });
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

// `reload`: public/sw.js no la intercepta, así no hereda su plazo de 8 s; los reintentos van por pasadas en downloadRoute
async function fetchInto(cache: Cache, url: string, signal: AbortSignal, key = url, load = () => fetch(url, { signal: withTimeout(signal), cache: "reload" })) {
  const res = await load();
  // teselas que no existen (mar, sin imagen): no hay nada que guardar
  if (res.status === 404 || res.status === 204) return 0;
  if (!res.ok) throw httpError(url, res.status);
  const body = await res.blob();
  try {
    await cache.put(key, new Response(body, { headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" } }));
  } catch (e) {
    throw e instanceof DOMException && e.name === "QuotaExceededError" ? new FatalError(NO_SPACE) : e;
  }
  return body.size;
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

/**
 * Teselas del relieve LiDAR que tocan la zona, leídas de cada parte con pmtiles. Se guardan en el cache de mapas
 * con una llave estable por parte y tesela (`…/lidar-izta/relieve-1/{z}/{x}/{y}`) que public/sw.js sirve sin red;
 * van por parte porque las partes se enciman en los zooms bajos.
 */
async function lidarTiles(cells: string[], signal: AbortSignal) {
  // pmtiles se carga aquí y no arriba: offline.ts va en todas las páginas (la píldora de descargas)
  const [{ PMTiles }, { partes }] = await Promise.all([import("pmtiles"), getJson<LayerManifest>(`${LAYERS_BASE}/capa.json`, signal)]);
  const parts = await Promise.all(
    partes.map(async (file) => {
      const pmtiles = new PMTiles(`${LAYERS_BASE}/${file}`);
      const h = await pmtiles.getHeader();
      return { pmtiles, name: file.replace(/\.pmtiles$/, ""), bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat] as Bounds };
    }),
  );
  return parts.flatMap(({ pmtiles, name, bounds }) =>
    zoneTiles(cells, LIDAR_ZOOMS, bounds).map(([z, x, y]) => ({
      key: `${LAYERS_BASE}/${name}/${z}/${x}/${y}`,
      load: async () => {
        const tile = await pmtiles.getZxy(z, x, y, withTimeout(signal));
        // ráster WebP; sin tesela (fuera de lo analizado) no hay nada que guardar
        return tile ? new Response(tile.data, { headers: { "Content-Type": "image/webp" } }) : new Response(null, { status: 404 });
      },
    })),
  );
}

export type DownloadChoice = { radiusKm: number; options: DownloadOptions };

/** Baja estilo, mapa base, satélite y lo elegido de la zona de la ruta, y la guarda para el visor sin conexión. */
export async function downloadRoute(
  route: OfflineRouteInfo,
  line: LineCoords,
  profile: ProfilePoint[] | null,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
  choice?: DownloadChoice,
): Promise<OfflineRoute> {
  // sin esto el navegador puede borrar el cache cuando le falta espacio
  await navigator.storage?.persist?.().catch(() => false);
  const prev = await getOfflineRoute(route.slug);
  // sin elegir (Reanudar, Guardadas) se repite lo de la vez anterior o lo de siempre
  const radiusKm = choice?.radiusKm ?? prev?.radiusKm ?? DEFAULT_RADIUS_KM;
  const asked = choice?.options ?? prev?.options ?? DEFAULT_OPTIONS;
  const [style, zone] = await Promise.all([styleResources(signal), layerZone(line, signal)]);
  const options: DownloadOptions = {
    terrain: asked.terrain,
    contours: asked.terrain && asked.contours,
    roads: !!zone && asked.roads,
    waterfalls: !!zone && asked.waterfalls,
    viewpoints: !!zone && asked.viewpoints,
    lidar: !!zone && asked.lidar,
  };
  const cells = zoneCells(line, radiusKm);
  const tileTemplates: { template: string; zooms: [number, number] }[] = [
    { template: SATELLITE_TILES, zooms: [CONTEXT_ZOOMS[0], SATELLITE_MAX_ZOOM] },
    ...(options.terrain ? [{ template: DEM_TILES, zooms: [CONTEXT_ZOOMS[0], DEM_MAX_ZOOM] as [number, number] }] : []),
    ...style.sources,
  ];
  const tiles = [...new Set(tileTemplates.flatMap(({ template, zooms }) => areaTiles(line, cells, zooms).map((t) => tileUrl(template, t))))];
  const lidar = options.lidar ? await lidarTiles(cells, signal) : [];
  if (tiles.length + lidar.length > MAX_TILES) throw new FatalError("La ruta es demasiado extensa para guardarla sin conexión.");

  // el registro va antes de bajar: si se corta, sus teselas se pueden borrar (una ruta nueva queda incompleta)
  const saveRecord = async (record: OfflineRoute) =>
    (await routesCache()).put(ROUTE_KEY + encodeURIComponent(route.slug), new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json" } }));
  // ampliación: la ruta ya estaba completa; si se corta, sigue completa con lo anterior
  const extending = !!prev && prev.complete !== false;
  // al reanudar se parte de lo ya bajado: las teselas en cache se saltan
  let bytes = prev?.complete === false ? prev.bytes : 0;
  const record: OfflineRoute = {
    ...route,
    line,
    profile,
    // al ampliar se suman las anteriores: al borrar la ruta no quedan huérfanas las que alcanzaron a bajar
    tiles: [...new Set([...(extending ? prev.tiles : []), ...tiles.map(tileCacheKey), ...lidar.map((t) => t.key)])],
    bytes,
    savedAt: new Date().toISOString(),
    complete: false,
    radiusKm,
    cells,
    options,
  };
  // mientras amplía, el registro guardado es el anterior (radio, celdas y opciones) con las teselas nuevas
  const progressRecord = (b: number): OfflineRoute => (extending ? { ...prev, tiles: record.tiles, bytes: prev.bytes + b } : { ...record, bytes: b });
  await saveRecord(progressRecord(bytes));
  const storage = await navigator.storage?.estimate?.().catch(() => undefined);
  if (storage?.quota !== undefined && storage.usage !== undefined && storage.quota - storage.usage < estimateDownload(line, radiusKm, options, zone).mb * 1024 * 1024) {
    throw new FatalError(NO_SPACE);
  }

  const [mapCache, styleCache, layersCache] = await Promise.all([caches.open(MAP_CACHE), caches.open(STYLE_CACHE), caches.open(LAYERS_CACHE)]);
  // las capas se vuelven a bajar en cada descarga (son pocos megas): así se actualizan
  const layerFiles = [
    ...(Object.keys(LAYER_GROUPS) as (keyof typeof LAYER_GROUPS)[]).flatMap((g) => (options[g] ? LAYER_GROUPS[g].files : [])),
    ...(options.lidar ? LIDAR_FILES : []),
  ];
  const layerUrls = layerFiles.length ? ["capa.json", ...layerFiles].map((f) => `${LAYERS_BASE}/${f}`) : [];
  const jobs: { url: string; cache: Cache; key: string; load?: () => Promise<Response> }[] = [
    ...style.urls.map((url) => ({ url, cache: styleCache, key: url })),
    ...layerUrls.map((url) => ({ url, cache: layersCache, key: url })),
    ...tiles.map((url) => ({ url, cache: mapCache, key: tileCacheKey(url) })),
    ...lidar.map(({ key, load }) => ({ url: key, cache: mapCache, key, load })),
  ];
  let done = 0;
  let stop = false;
  let lastError: unknown;
  onProgress(0, jobs.length);
  try {
    // por pasadas: lo que falla se aparta y los demás siguen; lo apartado va en la siguiente, tras una espera creciente
    for (let pending = jobs, pass = 0; pending.length; pass++) {
      if (pass > RETRY_MS.length) throw lastError;
      if (pass) await wait(RETRY_MS[pass - 1], signal);
      const failed: typeof jobs = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (!stop && next < pending.length) {
            signal.throwIfAborted();
            const job = pending[next++];
            try {
              // compartida con otra ruta ya descargada
              if (job.cache !== mapCache || !(await mapCache.match(job.key))) bytes += await fetchInto(job.cache, job.url, signal, job.key, job.load);
              onProgress(++done, jobs.length);
            } catch (e) {
              // cancelada o sin arreglo esperando: los demás dejan de bajar
              if (signal.aborted || e instanceof FatalError) {
                stop = true;
                throw e;
              }
              failed.push(job);
              lastError = e;
            }
          }
        }),
      );
      pending = failed;
    }
    // sin portada si falla: no vale perder la descarga por una foto
    if (route.cover_url) await fetchInto(await routesCache(), route.cover_url, signal, COVER_KEY + encodeURIComponent(route.slug)).catch(() => 0);
    signal.throwIfAborted();
  } catch (e) {
    // cortada o con error: se guarda lo bajado para que Reanudar sume
    await saveRecord(progressRecord(bytes));
    throw e;
  }
  const saved: OfflineRoute = { ...record, bytes, complete: true };
  await saveRecord(saved);
  await cacheOfflineShell();
  return saved;
}

/** Si la ruta usa archivos del cache de capas regionales (se comparten entre rutas). */
function hasLayerFiles(r: OfflineRoute) {
  const o = r.options;
  return !!r.layers || !!o && (o.roads || o.waterfalls || o.viewpoints || o.lidar);
}

export async function deleteOfflineRoute(slug: string) {
  const routes = await listOfflineRoutes();
  const target = routes.find((r) => r.slug === slug);
  if (!target) return;
  const others = routes.filter((r) => r.slug !== slug);
  const kept = new Set(others.flatMap((r) => r.tiles));
  const mapCache = await caches.open(MAP_CACHE);
  await Promise.all(target.tiles.filter((t) => !kept.has(t)).map((t) => mapCache.delete(t)));
  if (!others.some(hasLayerFiles)) await caches.delete(LAYERS_CACHE);
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
  // en-pausa: sin red tras los reintentos; sigue sola al volver la red o la página
  | { status: "en-cola" | "en-pausa" | "incompleta"; error?: string }
  | { status: "bajando"; done: number; total: number }
  | { status: "lista"; bytes: number };

type Job = { route: OfflineRouteInfo; line: LineCoords; profile: ProfilePoint[] | null; choice?: DownloadChoice; prev?: DownloadState };
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

let wakeLock: WakeLockSentinel | null = null;

/** Pantalla encendida mientras hay cola: al bloquearse, iOS suspende la página y corta las peticiones. */
async function keepAwake() {
  try {
    if (!current) {
      await wakeLock?.release();
      wakeLock = null;
    } else if (!wakeLock || wakeLock.released) {
      const lock = await navigator.wakeLock.request("screen");
      // mientras tanto llegó otra o la cola se vació
      if (current && (!wakeLock || wakeLock.released)) wakeLock = lock;
      else await lock.release();
    }
  } catch {
    // sin la API o con la página oculta: se vuelve a pedir al volver a ser visible
  }
}

function onVisible() {
  if (document.visibilityState === "visible") void keepAwake();
}

async function runQueue() {
  const job = current ? undefined : queue.shift();
  if (!job) return;
  const slug = job.route.slug;
  const controller = new AbortController();
  current = { slug, controller };
  // el mismo listener no se agrega dos veces
  document.addEventListener("visibilitychange", onVisible);
  void keepAwake();
  setDownload(slug, { status: "bajando", done: 0, total: 1 });
  try {
    for (;;) {
      try {
        const saved = await downloadRoute(job.route, job.line, job.profile, (done, total) => {
            // un progreso tardío no pisa el estado de una ruta que ya no es la actual
            if (current?.controller === controller) setDownload(slug, { status: "bajando", done, total });
          }, controller.signal, job.choice);
        setDownload(slug, { status: "lista", bytes: saved.bytes });
        break;
      } catch (e) {
        if (controller.signal.aborted || e instanceof FatalError) throw e;
        console.warn("descarga sin conexión en pausa:", e);
      }
      // sin red tras los reintentos: espera a que vuelva y sigue (lo ya guardado se salta)
      setDownload(slug, { status: "en-pausa" });
      const paused = Date.now();
      await wait(RESUME_EVERY_MS, controller.signal, true);
      await wait(RESUME_MIN_MS - (Date.now() - paused), controller.signal);
    }
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
  // si no empezó otra, suelta la pantalla
  void keepAwake();
}

/** Agrega la ruta a la cola si no está ya bajando o esperando; sin `choice`, la zona y capas de la vez anterior o las de siempre. */
export function queueDownload(route: OfflineRouteInfo, line: LineCoords, profile: ProfilePoint[] | null, choice?: DownloadChoice) {
  if (current?.slug === route.slug || queue.some((j) => j.route.slug === route.slug)) return;
  queue.push({ route, line, profile, choice, prev: downloads.routes?.[route.slug] });
  setDownload(route.slug, { status: "en-cola" });
  emitDownloads({ total: downloads.total + 1 });
  void runQueue();
}

/** Quita la ruta de la cola o corta su descarga, también en pausa (queda incompleta). */
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
