"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- sin red solo sirve la navegación completa (la maneja el service worker) */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, ArrowUp, Check, ChevronDown, ChevronUp, Clock, CloudDownload, Hexagon, Layers, LocateFixed, Mountain, Navigation, Play, Smartphone, Trash2, TriangleAlert, Undo2, WifiOff, X } from "lucide-react";
import { ElevationProfile } from "@/components/elevation-profile";
import { LayerSheet, loadLayers, overlaySaved, REGIONAL, saveLayers, savedOptions, useOnline, type MapLayers, type Overlay } from "@/components/layer-sheet";
// sin next/dynamic: así sus scripts vienen en el HTML que guarda el service worker y el mapa abre sin red
import { routeCloses, TrackMap } from "@/components/track-map";
import { coverageGeoJson, setCoverage } from "@/lib/coverage-layer";
import { setLidar, setWaterfalls } from "@/lib/lidar-layer";
import { setSatellite, setTopoGroup, type maplibregl } from "@/lib/maplibre";
import { setCamps, setRoads, setViewpoints } from "@/lib/terrain-layers";
import {
  cancelDownload,
  deleteOfflineRoute,
  formatMb,
  getOfflineCover,
  getOfflineRoute,
  layerZone,
  listOfflineRoutes,
  offlineSupported,
  queueDownload,
  storageStatus,
  useDownloads,
  useIosSafariTab,
  type DownloadChoice,
  type DownloadOptions,
  type OfflineRoute,
} from "@/lib/offline";
import { DIFFICULTY, formatDuration, formatKm } from "@/lib/routes";
import { loadTrip, reverseProfile, saveTrip, trackProgress } from "@/lib/track-progress";

/** Lista de rutas guardadas en el dispositivo o, con `?ruta=`, el visor de una. Los enlaces son <a>: sin red solo hay HTML del service worker. */
export function OfflineRoutes() {
  const slug = useSearchParams().get("ruta");
  return slug ? <Viewer slug={slug} /> : <List />;
}

/** Portada guardada en el cache: sin red no hay next/image. */
function Cover({ slug }: { slug: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | undefined;
    let live = true;
    getOfflineCover(slug).then((blob) => {
      if (!blob || !live) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [slug]);
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container text-primary-container/70 sm:size-20">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob local, sin optimizar */}
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Mountain className="size-7" aria-hidden />}
    </div>
  );
}

function List() {
  const [routes, setRoutes] = useState<OfflineRoute[] | null>(null);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageStatus>>>(null);
  const { routes: live } = useDownloads();
  const iosTab = useIosSafariTab();
  // el service worker manda aquí lo que no pudo abrir sin señal; solo del mismo origen (el navegador quita tabs y lee /\ como //)
  // location existe: useSearchParams en una página estática solo renderiza en el cliente
  const desde = useSearchParams().get("desde");
  let retryHref: string | null = null;
  try {
    const retry = desde ? new URL(desde, location.origin) : null;
    if (retry?.origin === location.origin) retryHref = retry.pathname + retry.search;
  } catch {
    // ?desde= mal formado: sin enlace de reintento
  }

  // se vuelve a leer el dispositivo cuando una ruta cambia de estado; el total llega ya con su registro escrito
  const statuses = Object.entries(live ?? {})
    .map(([slug, d]) => slug + d.status + (d.status === "bajando" ? d.total : ""))
    .join();
  useEffect(() => {
    (offlineSupported() ? listOfflineRoutes() : Promise.resolve([])).then(setRoutes);
    storageStatus()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, [statuses]);

  return (
    <div className="min-h-dvh bg-surface-container-low">
      <header className="sticky top-0 z-10 border-b border-outline-variant bg-surface shadow-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <a href="/" className="flex items-center gap-2 font-headline text-2xl font-bold tracking-tight text-primary">
            <Mountain className="size-7 fill-primary-container text-primary-container" aria-hidden />
            brecha
          </a>
        </div>
        {retryHref && (
          <div className="border-t border-outline-variant bg-secondary-fixed">
            <p className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 text-sm text-on-secondary-container">
              <WifiOff className="size-4 shrink-0 text-secondary" aria-hidden />
              <span className="flex-1">Sin señal · estás viendo lo guardado en este dispositivo</span>
              <a href={retryHref} className="shrink-0 font-headline font-bold text-secondary">
                Reintentar
              </a>
            </p>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 font-headline text-2xl font-extrabold tracking-tight">
            <WifiOff className="size-6 text-primary" aria-hidden />
            Rutas sin conexión
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">Se abren sin señal con satélite, relieve 3D y tu ubicación por GPS.</p>
        </div>

        {storage && storage.quota > 0 && (
          <div className="space-y-2.5 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
            <p className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span>Brecha ocupa {formatMb(storage.usage)}</span>
              <span>Quedan {formatMb(Math.max(0, storage.quota - storage.usage))} libres</span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(2, (storage.usage / storage.quota) * 100))}%` }} />
            </div>
            {!storage.persisted && <p className="font-mono text-xs text-on-surface-variant">El sistema podría borrar estos datos si el teléfono se queda sin espacio.</p>}
          </div>
        )}

        {iosTab && (
          <p className="flex gap-2 rounded-xl bg-secondary-fixed/40 p-3 text-xs">
            <Smartphone className="size-4 shrink-0 text-secondary" aria-hidden />
            <span>
              En iPhone, agrega Brecha a tu pantalla de inicio (Compartir → <b>Agregar a inicio</b>) y guarda las rutas desde la app: lo que se guarda en Safari no aparece ahí.
            </span>
          </p>
        )}

        {routes?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-10 text-center">
            <CloudDownload className="size-9 text-outline-variant" aria-hidden />
            <p className="font-headline font-bold">Todavía no guardas rutas</p>
            <p className="max-w-sm text-sm text-on-surface-variant">
              En la página de una ruta con trazo toca <b>Guardar sin conexión</b> antes de salir.
            </p>
            <a href="/" className="mt-2 rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary">
              Explorar rutas
            </a>
          </div>
        )}

        <ul className="space-y-3">
          {routes?.map((r) => {
            // los estados en vivo salen de la cola; sin ella, del registro
            const state = live?.[r.slug] ?? (r.complete === false ? { status: "incompleta" as const } : { status: "lista" as const, bytes: r.bytes });
            const ready = state.status === "lista";
            const percent = state.status === "bajando" ? Math.floor((state.done / state.total) * 100) : 0;
            const info = (
              <>
                <p className="truncate font-headline font-bold">{r.name}</p>
                <p className="text-xs text-on-surface-variant">{r.place_label}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className={clsx("size-2 rounded-full", DIFFICULTY[r.difficulty].dot)} />
                    {DIFFICULTY[r.difficulty].label}
                  </span>
                  <span>{formatKm(r.distance_km)}</span>
                  <span>↑ {r.elevation_gain_m.toLocaleString("es-MX")} m</span>
                  {ready && <span>{formatMb(state.bytes)}</span>}
                </p>
              </>
            );
            return (
              <li key={r.slug} className="flex items-start gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
                <Cover slug={r.slug} />
                <div className="min-w-0 flex-1">
                  {/* solo las completas abren el visor */}
                  {ready ? (
                    <a href={`/descargas?ruta=${encodeURIComponent(r.slug)}`} className="block">
                      {info}
                    </a>
                  ) : (
                    info
                  )}
                  {ready && (
                    <p className="mt-1.5 flex items-center gap-1 text-sm text-primary">
                      <Check className="size-4" aria-hidden />
                      Lista para usar sin señal
                    </p>
                  )}
                  {state.status === "bajando" && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="text-sm text-primary">Descargando… {percent}%</p>
                    </div>
                  )}
                  {state.status === "en-cola" && <p className="mt-1.5 text-sm text-on-surface-variant">En cola</p>}
                  {state.status === "incompleta" && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm text-secondary">Descarga incompleta</span>
                      <button
                        type="button"
                        onClick={() => queueDownload(r, r.line, r.profile)}
                        className="rounded-full border border-primary px-3 py-1 font-headline text-sm font-semibold text-primary hover:bg-surface-container"
                      >
                        Reanudar
                      </button>
                      {state.error && <span className="w-full text-xs text-error">{state.error}</span>}
                    </div>
                  )}
                </div>
                {state.status === "bajando" || state.status === "en-cola" ? (
                  <button
                    type="button"
                    onClick={() => cancelDownload(r.slug)}
                    aria-label={`Cancelar la descarga de ${r.name}`}
                    className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteOfflineRoute(r.slug).then(() => setRoutes((rs) => rs?.filter((x) => x.slug !== r.slug) ?? null))}
                    aria-label={`Borrar ${r.name} del dispositivo`}
                    className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

// capas regionales: se crean al prenderlas la primera vez
const REGIONAL_LAYERS = { roads: setRoads, waterfalls: setWaterfalls, viewpoints: setViewpoints, camps: setCamps };
const ROUND = "pointer-events-auto relative flex size-12 items-center justify-center rounded-full shadow-lg ring-1 ring-outline-variant/60";

function Viewer({ slug }: { slug: string }) {
  const [route, setRoute] = useState<OfflineRoute | null | undefined>(undefined);
  const [layers, setLayers] = useState(loadLayers);
  const [ready, setReady] = useState<{ map: maplibregl.Map; locate: () => void } | null>(null);
  const [tracking, setTracking] = useState(false);
  // la hoja de capas y el panel de avance nunca a la vez
  const [open, setOpen] = useState<"capas" | "avance" | null>(null);
  // los `bounds` de capa.json si la ruta toca la zona de las capas regionales
  const [layerBounds, setLayerBounds] = useState<Awaited<ReturnType<typeof layerZone>>>(null);
  // lo que pidió la descarga lanzada desde la hoja de capas, para marcar sus filas mientras baja
  const [requested, setRequested] = useState<DownloadOptions | null>(null);
  const download = useDownloads().routes?.[slug];
  const [lidarFailed, setLidarFailed] = useState(false);
  const online = useOnline();
  const [active, setActive] = useState<number | null>(null);
  // el recorrido en curso vive en el dispositivo: al reabrir el visor sigue donde iba, con o sin señal
  const [saved] = useState(() => loadTrip(slug));
  const [startedAt, setStartedAt] = useState(saved?.startedAt ?? null);
  const [back, setBack] = useState(saved?.back ?? false);
  // por dónde iba el recorrido guardado: sin él, un ida y vuelta no sabe en cuál de las dos pasadas vas
  const resume = useRef(saved?.index ?? null);
  const [progress, setProgress] = useState<(ReturnType<typeof trackProgress> & { accuracy: number }) | null>(null);
  const gps = useRef<{ lngLat: [number, number]; accuracy: number } | null>(null);
  // con menos de 2 puntos no hay perfil que recorrer
  const routeProfile = route?.profile && route.profile.length >= 2 ? route.profile : null;
  const reversed = useMemo(() => routeProfile && reverseProfile(routeProfile), [routeProfile]);
  const map = ready?.map;
  const zone = !!route?.layers || !!layerBounds;
  const stored = route ? savedOptions(route) : null;
  // el relieve LiDAR sin descargar necesita señal: sin ella se queda el satélite
  const lidar = zone && !lidarFailed && (online || !!stored?.lidar);
  const base = layers.base === "lidar" && !lidar ? "satellite" : layers.base;
  // lo que no está en el teléfono no se muestra: primero se descarga
  const overlays = layers.overlays.filter((o) => (zone || !REGIONAL.includes(o)) && !!stored && overlaySaved(o, stored));
  // memorizada: cada lectura del GPS vuelve a pintar y la zona no cambia
  const coverage = useMemo(() => {
    if (!route?.cells) return null;
    // parciales: solo si el registro guardó capas que existen únicamente dentro de los `bounds`
    const o = savedOptions(route);
    return coverageGeoJson(route.cells, o.roads || o.waterfalls || o.viewpoints || o.lidar ? layerBounds : null);
  }, [route, layerBounds]);
  const finished = download?.status === "lista";

  useEffect(() => {
    (offlineSupported() ? getOfflineRoute(slug) : Promise.resolve(null)).then(setRoute);
  }, [slug]);

  // al terminar una descarga se relee el registro (las capas nuevas pasan a "Descargado"); con el mismo trazo, el mapa no se rehace
  useEffect(() => {
    if (finished) getOfflineRoute(slug).then((next) => next && setRoute((r) => r && { ...next, line: r.line, profile: r.profile }));
  }, [slug, finished]);

  useEffect(() => {
    if (route) layerZone(route.line).then(setLayerBounds);
  }, [route]);

  useEffect(() => {
    if (!map) return;
    setSatellite(map, base === "satellite");
    setTopoGroup(map, "contours", overlays.includes("contours"));
    setTopoGroup(map, "names", overlays.includes("names"));
    for (const [id, set] of Object.entries(REGIONAL_LAYERS)) set(map, overlays.includes(id as Overlay)).catch((e) => console.error(`capa ${id}:`, e));
    setLidar(map, base === "lidar", !!stored?.lidar).catch(() => setLidarFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- overlays es un arreglo nuevo en cada render; su contenido va en la llave
  }, [map, base, overlays.join()]);

  // la zona descargada solo mientras la hoja de capas está abierta
  useEffect(() => {
    if (map) setCoverage(map, open === "capas" ? coverage : null);
  }, [map, open, coverage]);

  useEffect(() => {
    saveTrip(slug, startedAt ? { startedAt, back, index: progress?.index ?? resume.current } : null);
  }, [slug, startedAt, back, progress?.index]);

  useEffect(() => {
    if (!map || open !== "capas") return;
    const close = () => setOpen(null);
    map.on("click", close);
    return () => {
      map.off("click", close);
    };
  }, [map, open]);

  if (route === undefined) return <div className="h-dvh bg-[#e3e8e1]" />;
  if (!route) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-surface-container-low px-6 text-center">
        <p className="font-headline font-bold">Esta ruta no está guardada en el dispositivo</p>
        <a href="/descargas" className="rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary">
          Ver rutas sin conexión
        </a>
      </div>
    );
  }

  const profile = back ? reversed : routeProfile;
  const point = active !== null && profile ? profile[active] : null;
  // `last` va en null al cambiar de modo: el índice recordado era del otro perfil
  function locate(fix: { lngLat: [number, number]; accuracy: number }, inReverse: boolean, last: number | null) {
    const p = inReverse ? reversed : routeProfile;
    return p ? { ...trackProgress(p, { lng: fix.lngLat[0], lat: fix.lngLat[1] }, last), accuracy: fix.accuracy } : null;
  }
  function downloadMore(choice: DownloadChoice) {
    setRequested(choice.options);
    queueDownload(route!, route!.line, route!.profile, choice);
  }
  function changeLayers(next: MapLayers) {
    setLayers(next);
    saveLayers(next);
  }
  function start() {
    resume.current = null;
    setStartedAt(Date.now());
    setProgress(gps.current && locate(gps.current, back, null));
    setOpen("avance");
    if (!tracking) ready?.locate();
  }
  function finish() {
    resume.current = null;
    setStartedAt(null);
    setBack(false);
    setActive(null);
  }
  // sin recorrido comenzado el GPS solo pinta el punto en el mapa
  const going = startedAt ? progress : null;
  const offM = going && going.offM > 50 && going.offM > going.accuracy ? going.offM : null;
  const figures = going && [
    [back ? "Regresado" : "Recorrido", ...formatKm(going.doneKm).split(" "), "text-on-surface"],
    ["Falta", ...formatKm(going.leftKm).split(" "), "text-secondary"],
    ["Por subir", Math.round(going.climbM).toLocaleString("es-MX"), "m", "text-on-surface"],
  ];
  const expanded = open === "avance";
  return (
    <div className="fixed inset-0 bg-[#e3e8e1]">
      <TrackMap
        line={route.line}
        hover={point ? [point[2], point[3]] : null}
        offline
        terrain3d={layers.terrain3d}
        reversed={back}
        onReady={(r) => {
          setReady(r);
          // recorrido que ya estaba en curso: el GPS se prende solo
          if (r && startedAt) r.locate();
        }}
        onTracking={setTracking}
        onPosition={(lngLat, accuracy) => {
          gps.current = { lngLat, accuracy };
          setProgress((prev) => locate(gps.current!, back, prev?.index ?? resume.current));
        }}
      />
      {/* a la derecha queda la atribución del mapa */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-12">
        <div className="flex max-w-full items-center gap-2">
          <a href="/descargas" aria-label="Rutas sin conexión" className={clsx(ROUND, "shrink-0 bg-surface-container-lowest")}>
            <ArrowLeft className="size-5" aria-hidden />
          </a>
          <p className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-3 font-headline text-sm font-bold shadow-lg ring-1 ring-outline-variant/60">
            <Mountain className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{route.name}</span>
          </p>
        </div>
        {offM !== null && (
          <div role="alert" className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-secondary-fixed px-3 py-2 text-on-secondary-container shadow-lg ring-1 ring-secondary-container/40">
            <TriangleAlert className="size-5 shrink-0 text-secondary" aria-hidden />
            <div>
              <p className="font-headline text-sm font-bold">Estás a {offM < 1000 ? `${Math.round(offM)} m` : formatKm(offM / 1000)} del sendero</p>
              <p className="text-sm">Regresa hacia la línea naranja.</p>
            </div>
          </div>
        )}
        {open === "capas" && coverage && (
          <p className="pointer-events-auto flex items-center gap-3 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 text-xs shadow-lg ring-1 ring-outline-variant/60">
            <span className="flex items-center gap-1">
              <Hexagon className="size-4 text-primary" aria-hidden />
              Descargado
            </span>
            {coverage.partial.features.length > 0 && (
              <span className="flex items-center gap-1">
                <Hexagon className="size-4 text-secondary [stroke-dasharray:3_2]" aria-hidden />
                Parcial
              </span>
            )}
            <span className="flex items-center gap-1">
              <Hexagon className="size-4 fill-on-surface/70 text-on-surface/70" aria-hidden />
              Sin datos
            </span>
          </p>
        )}
      </div>

      {/* con el avance desplegado suben: la hoja llega a media pantalla */}
      <div className={clsx("absolute right-3 flex -translate-y-1/2 flex-col gap-3 transition-[top]", expanded ? "top-1/4" : "top-1/2")}>
        <button
          type="button"
          aria-label={overlays.length ? `Capas del mapa (${overlays.length} prendidas)` : "Capas del mapa"}
          aria-expanded={open === "capas"}
          onClick={() => setOpen(open === "capas" ? null : "capas")}
          className={clsx(ROUND, "bg-surface-container-lowest text-on-surface")}
        >
          <Layers className="size-6" aria-hidden />
          {overlays.length > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-on-primary ring-2 ring-surface-container-lowest">
              {overlays.length}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label="Seguir mi ubicación"
          aria-pressed={tracking}
          disabled={!ready}
          onClick={() => ready?.locate()}
          className={clsx(ROUND, tracking ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface")}
        >
          <LocateFixed className="size-6" aria-hidden />
        </button>
      </div>

      {profile && open !== "capas" && expanded && (
        <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface-container-lowest px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-outline-variant/60">
          <div className="relative mb-2 flex justify-center">
            <button type="button" onClick={() => setOpen(null)} aria-expanded aria-label="Plegar el avance" className="flex flex-col items-center gap-1 px-8 text-on-surface-variant">
              <span className="h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
              <ChevronDown className="size-5" aria-hidden />
            </button>
            {startedAt && (
              <button type="button" onClick={finish} className="absolute top-1 right-0 rounded-full px-3 py-1 font-headline text-sm font-semibold text-secondary hover:bg-surface-container">
                Terminar
              </button>
            )}
          </div>
          {!routeCloses(route.line) && (
            <div className="mb-3 grid grid-cols-2 rounded-2xl border border-outline-variant bg-surface-container p-1">
              {[false, true].map((mode) => {
                const Icon = mode ? Undo2 : Navigation;
                return (
                  <button
                    key={String(mode)}
                    type="button"
                    aria-pressed={back === mode}
                    onClick={() => {
                      if (back === mode) return;
                      resume.current = null;
                      setBack(mode);
                      setActive(null);
                      setProgress(gps.current && locate(gps.current, mode, null));
                    }}
                    className={clsx(
                      "flex items-center justify-center gap-2 rounded-xl py-2.5 font-headline font-bold",
                      back === mode ? "bg-primary text-on-primary" : "text-on-surface-variant",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {mode ? "De regreso" : "Ida"}
                  </button>
                );
              })}
            </div>
          )}
          {figures && going ? (
            <>
              <div className="grid grid-cols-3 divide-x divide-outline-variant/60 border-y border-outline-variant/60 py-2.5 text-center">
                {figures.map(([label, value, unit, color], i) => (
                  <div key={label}>
                    <p className="font-mono text-[11px] tracking-wider text-on-surface-variant uppercase">{label}</p>
                    <p className={clsx("flex items-baseline justify-center gap-1 font-headline text-2xl font-bold", color)}>
                      {i === 2 && <ArrowUp className="size-5 self-center" aria-hidden />}
                      {value}
                      <span className="text-sm font-medium opacity-80">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="my-3 flex items-center justify-center gap-1.5 rounded-xl border border-primary-fixed bg-primary-fixed/40 py-2 font-mono text-xs text-on-primary-fixed-variant">
                <Clock className="size-3.5" aria-hidden />≈ {formatDuration(going.minutes)} para {back ? "volver al inicio" : "llegar al final"}
              </p>
            </>
          ) : startedAt ? (
            <p className="mb-3 py-2 text-center font-mono text-xs text-on-surface-variant">Buscando tu ubicación…</p>
          ) : (
            <button type="button" onClick={start} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-headline font-bold text-on-primary">
              <Play className="size-4" aria-hidden />
              Comenzar ruta
            </button>
          )}
          <ElevationProfile profile={profile} active={active} onActive={setActive} overlay position={going?.index ?? null} />
        </div>
      )}
      {profile && !open && (
        <div className="absolute inset-x-3 bottom-3 mb-[env(safe-area-inset-bottom)] flex items-center rounded-2xl bg-surface-container-lowest shadow-lg ring-1 ring-outline-variant/60">
          {startedAt ? (
            <button type="button" aria-expanded={false} onClick={() => setOpen("avance")} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
              {figures ? (
                <span className="grid flex-1 grid-cols-3 divide-x divide-outline-variant/60">
                  {figures.map(([label, value, unit, color], i) => (
                    <span key={label} className="px-2 first:pl-1">
                      <span className="block font-mono text-[10px] tracking-wider text-on-surface-variant uppercase">{label}</span>
                      <span className={clsx("flex items-center gap-0.5 font-headline font-bold", color)}>
                        {i === 2 && <ArrowUp className="size-3.5" aria-hidden />}
                        {value} {unit}
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="flex-1 py-1.5 text-sm text-on-surface-variant">Buscando tu ubicación…</span>
              )}
              <ChevronUp className="size-5 shrink-0 text-on-surface-variant" aria-hidden />
            </button>
          ) : (
            <>
              <button type="button" onClick={start} className="m-1.5 flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-headline font-bold text-on-primary">
                <Play className="size-4" aria-hidden />
                Comenzar ruta
              </button>
              <button type="button" aria-expanded={false} aria-label="Ver el perfil de altitud" onClick={() => setOpen("avance")} className="p-3 text-on-surface-variant">
                <ChevronUp className="size-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      )}

      {open === "capas" && (
        <LayerSheet
          layers={{ ...layers, base }}
          onChange={changeLayers}
          zone={zone}
          lidar={lidar}
          route={route}
          download={download}
          requested={requested}
          onDownload={downloadMore}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
