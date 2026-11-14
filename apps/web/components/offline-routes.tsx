"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- sin red solo sirve la navegación completa (la maneja el service worker) */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, ArrowUp, Check, ChevronDown, ChevronUp, Clock, CloudDownload, CloudOff, Hexagon, Info, Layers, LocateFixed, MessageSquarePlus, Mountain, Navigation, Play, Smartphone, ThumbsDown, ThumbsUp, Trash2, TriangleAlert, Undo2, WifiOff, X } from "lucide-react";
import { ElevationProfile } from "@/components/elevation-profile";
import { LayerSheet, loadLayers, overlaySaved, REGIONAL, saveLayers, savedOptions, useOnline, type MapLayers, type Overlay } from "@/components/layer-sheet";
// sin next/dynamic: así sus scripts vienen en el HTML que guarda el service worker y el mapa abre sin red
import { routeCloses, TrackMap } from "@/components/track-map";
import { answerAnnotation, discardAnnotation, enqueueAnnotation, flushAnnotations, forgetUploaded, retryAnnotation, usePendingAnnotations } from "@/lib/annotation-queue";
import { ANSWERABLE, confirmedLabel, kmLabel, NOTE_MAX, NOTICE, TRACTION, upcoming, type NoticeKind, type RouteAnnotation, type Traction } from "@/lib/annotations";
import { daysAgoLabel } from "@/lib/community";
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
  refreshAnnotations,
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
                  {state.status === "en-pausa" && <p className="mt-1.5 text-sm text-secondary">Sin conexión · se reanuda sola</p>}
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
                {state.status === "bajando" || state.status === "en-cola" || state.status === "en-pausa" ? (
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
const SECTION = "mb-2 font-mono text-xs tracking-widest text-on-surface-variant uppercase";
const metersLabel = (m: number) => (m < 1000 ? `${Math.round(m)} m` : formatKm(m / 1000));
const updatedLabel = (a: RouteAnnotation) => `actualizado ${daysAgoLabel(new Date(a.updated_at).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }))}`;

function Viewer({ slug }: { slug: string }) {
  const [route, setRoute] = useState<OfflineRoute | null | undefined>(undefined);
  const [layers, setLayers] = useState(loadLayers);
  const [ready, setReady] = useState<{ map: maplibregl.Map; locate: () => void } | null>(null);
  const [tracking, setTracking] = useState(false);
  // la hoja de capas, el panel de avance y la de reportar nunca a la vez
  const [open, setOpen] = useState<"capas" | "avance" | "reportar" | null>(null);
  // lo que se reporta: el punto del trazo donde estabas al abrir la hoja (se fija ahí) y qué se marca
  const [spot, setSpot] = useState<{ km: number; lng: number; lat: number; offM: number; accuracy: number } | null>(null);
  const [mark, setMark] = useState<Traction | NoticeKind | null>(null);
  const [note, setNote] = useState("");
  // aviso de fuera del sendero reducido a su ícono; vuelve a salir completo si regresas al sendero y te sales otra vez
  const [offHidden, setOffHidden] = useState(false);
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
  // `stale`: el GPS se apagó después de esta lectura; sirve para el avance pero no para reportar
  const [progress, setProgress] = useState<(ReturnType<typeof trackProgress> & { accuracy: number; lngLat: [number, number]; stale?: boolean }) | null>(null);
  const gps = useRef<{ lngLat: [number, number]; accuracy: number } | null>(null);
  // avisos y tramos ya avisados en este recorrido, y el pin tocado con el aviso próximo que había al tocarlo
  const [seen, setSeen] = useState(() => new Set<string>());
  const [picked, setPicked] = useState<{ id: string; over?: string } | null>(null);
  // con menos de 2 puntos no hay perfil que recorrer
  const routeProfile = route?.profile && route.profile.length >= 2 ? route.profile : null;
  const reversed = useMemo(() => routeProfile && reverseProfile(routeProfile), [routeProfile]);
  // tramo recorrido: del inicio del perfil activo hasta donde vas, solo con la ruta comenzada
  const at = startedAt ? (progress?.index ?? null) : null;
  const done = useMemo(() => {
    const p = back ? reversed : routeProfile;
    return p && at ? p.slice(0, at + 1).map(([, , lng, lat]): [number, number] => [lng, lat]) : null;
  }, [back, reversed, routeProfile, at]);
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
  // lo que sigue en el teléfono se pinta junto a lo guardado; al subir algo se relee para cambiar los temporales por las filas
  const refresh = (signal: AbortSignal) =>
    refreshAnnotations(slug, signal).then((notes) => {
      if (!notes) return;
      // lo recién subido ya viene en la relectura: sale de la cola
      forgetUploaded(slug, notes.annotations.map((a) => a.id));
      setRoute((r) => r && { ...r, ...notes });
    });
  const [pending, waiting] = usePendingAnnotations(slug, () => refresh(new AbortController().signal));
  const routeAnnotations = route?.annotations;
  const annotations = useMemo(() => {
    const extra = pending.filter((p) => !routeAnnotations?.some((a) => a.id === p.id));
    return extra.length ? [...(routeAnnotations ?? []), ...extra] : routeAnnotations;
  }, [routeAnnotations, pending]);
  // con señal débil el navegador no avisa "online": mientras haya algo por subir se reintenta cada minuto
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(flushAnnotations, 60_000);
    return () => clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    (offlineSupported() ? getOfflineRoute(slug) : Promise.resolve(null)).then(setRoute);
  }, [slug]);

  // con señal se vuelven a pedir las anotaciones, sin esperar para pintar lo guardado; sin ella o si fallan, quedan las guardadas
  useEffect(() => {
    const controller = new AbortController();
    if (offlineSupported()) void refresh(controller.signal);
    void flushAnnotations();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh es nueva en cada render; solo depende de slug
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
    return p ? { ...trackProgress(p, { lng: fix.lngLat[0], lat: fix.lngLat[1] }, last), accuracy: fix.accuracy, lngLat: fix.lngLat } : null;
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
    setSeen(new Set());
    setStartedAt(Date.now());
    setProgress(gps.current && locate(gps.current, back, null));
    setOpen("avance");
    if (!tracking) ready?.locate();
  }
  function finish() {
    resume.current = null;
    setSeen(new Set());
    setStartedAt(null);
    setBack(false);
    setActive(null);
  }
  // sin recorrido comenzado el GPS solo pinta el punto en el mapa
  const going = startedAt ? progress : null;
  const offM = going && going.offM > 50 && going.offM > going.accuracy ? going.offM : null;
  if (offM === null && offHidden) setOffHidden(false);
  const offText = offM === null ? "" : `Estás a ${metersLabel(offM)} del sendero`;
  const figures = going && [
    [back ? "Regresado" : "Recorrido", ...formatKm(going.doneKm).split(" "), "text-on-surface"],
    ["Falta", ...formatKm(going.leftKm).split(" "), "text-secondary"],
    ["Por subir", Math.round(going.climbM).toLocaleString("es-MX"), "m", "text-on-surface"],
  ];
  const expanded = open === "avance";
  // una tarjeta a la vez: pin tocado > aviso próximo > cambio de tracción
  const totalKm = routeProfile ? routeProfile[routeProfile.length - 1][0] : 0;
  const next = going && annotations ? upcoming(annotations, totalKm, back ? totalKm - going.doneKm : going.doneKm, back, going.lngLat, seen) : null;
  const near = next?.notice?.annotation;
  // un aviso próximo nuevo le gana al pin que se quedó abierto
  if (picked && near && picked.over !== near.id) setPicked(null);
  const pin = picked ? annotations?.find((a) => a.id === picked.id) : undefined;
  const shown = pin ?? near;
  const dismiss = (id: string) => setSeen((s) => new Set(s).add(id));
  // `answer`: la tarjeta pregunta "¿Sigue ahí?" en lugar de "Entendido"
  let card: { key: string; title: string; note: string | null; meta: string; color: string; badge: ReactNode; close: () => void; drain?: boolean; answer?: (stillThere: boolean) => void } | null = null;
  if (shown) {
    const kind = NOTICE[shown.kind as NoticeKind];
    const m = next?.notice ? Math.round(next.notice.m / 10) * 10 : 0;
    const close = () => {
      setPicked(null);
      // cerrar un pin leído de lejos no cuenta como avisado: al acercarte sale su aviso
      if (shown.id === near?.id) dismiss(shown.id);
    };
    card = {
      key: shown.id,
      title: pin ? `${kind.label} · ${kmLabel(pin.km)}` : m < 30 ? `${kind.label} aquí` : `${kind.label} a ${m} m`,
      note: shown.note,
      meta: (pin ? updatedLabel(pin) : `${kmLabel(shown.km)} · ${updatedLabel(shown)}`) + (shown.confirmed ? ` · ${confirmedLabel(shown.confirmed)}` : ""),
      color: kind.color,
      badge: <kind.icon className="size-5" aria-hidden />,
      close,
      // se contesta estando ahí (no en el pin tocado), con sesión y si el aviso ya está en el servidor; contestar lo da por visto
      answer:
        !pin && route.signedIn && ANSWERABLE.includes(shown.kind) && !shown.id.startsWith("pendiente-")
          ? (stillThere) => {
              answerAnnotation({ slug, annotationId: shown.id, stillThere });
              close();
            }
          : undefined,
    };
  } else if (next?.traction) {
    const { segment, leftKm } = next.traction;
    const t = TRACTION[segment.traction!];
    const mark = annotations!.find((a) => a.id === segment.id);
    card = {
      key: segment.id!,
      title: segment.traction === "normal" ? "Vuelve a tracción normal" : `Aquí empieza ${t.label}`,
      note: mark?.note ?? null,
      meta: `Próximos ${formatKm(leftKm)}`,
      color: t.color,
      badge: segment.traction === "normal" ? <Check className="size-5" aria-hidden /> : <span className="font-headline text-xs font-bold">{t.label}</span>,
      close: () => dismiss(segment.id!),
      drain: true,
    };
  }
  // sin lectura vigente al abrir la hoja, el punto se fija con la primera que llegue
  if (open === "reportar" && !spot && progress && !progress.stale && profile) {
    const [, , lng, lat] = profile[progress.index];
    setSpot({ km: Math.round((back ? totalKm - progress.doneKm : progress.doneKm) * 100) / 100, lng, lat, offM: progress.offM, accuracy: progress.accuracy });
  }
  const canReport = !!route.canAnnotate && !!route.routeId && !!routeProfile;
  function openReport() {
    setSpot(null);
    setMark(null);
    setNote("");
    setOpen("reportar");
    if (!tracking) ready?.locate();
  }
  function report() {
    if (!spot || !mark) return;
    const traction = mark in TRACTION;
    enqueueAnnotation({
      routeId: route!.routeId!,
      slug,
      kind: traction ? "traccion" : (mark as NoticeKind),
      traction: traction ? (mark as Traction) : null,
      km: spot.km,
      lng: spot.lng,
      lat: spot.lat,
      note: note.trim() || null,
    });
    setOpen(null);
  }
  const rejected = pending.find((p) => p.error);
  return (
    <div className="fixed inset-0 bg-[#e3e8e1]">
      <TrackMap
        line={route.line}
        hover={point ? [point[2], point[3]] : null}
        offline
        terrain3d={layers.terrain3d}
        reversed={back}
        done={done}
        annotations={annotations}
        onNotice={(id) => setPicked({ id, over: near?.id })}
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
          {/* con la ruta comenzada el nombre sobra: el mapa queda más libre */}
          {!startedAt && (
            <p className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-3 font-headline text-sm font-bold shadow-lg ring-1 ring-outline-variant/60">
              <Mountain className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{route.name}</span>
            </p>
          )}
        </div>
        {offM !== null &&
          (offHidden ? (
            <button
              type="button"
              onClick={() => setOffHidden(false)}
              aria-label={`${offText}. Ver aviso`}
              className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-secondary-fixed text-secondary shadow-lg ring-1 ring-secondary-container/40"
            >
              <TriangleAlert className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              role="alert"
              onClick={() => setOffHidden(true)}
              className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-secondary-fixed px-3 py-2 text-left text-on-secondary-container shadow-lg ring-1 ring-secondary-container/40"
            >
              <TriangleAlert className="size-5 shrink-0 text-secondary" aria-hidden />
              <span className="flex-1">
                <span className="block font-headline text-sm font-bold">{offText}</span>
                <span className="block text-sm">Regresa al trazo de la ruta.</span>
              </span>
              <X className="size-4 shrink-0" aria-hidden />
            </button>
          ))}
        {card && (
          <div key={card.key} role="status" className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl bg-surface-container-lowest shadow-lg ring-1 ring-outline-variant/60">
            <div className="flex items-start gap-3 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={card.drain ? { background: card.color, color: "#fff" } : { background: `${card.color}1f`, color: card.color }}>
                {card.badge}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-headline font-bold">{card.title}</p>
                {card.note && <p className="text-sm">{card.note}</p>}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-on-surface-variant uppercase">{card.meta}</p>
                  {!pin && !card.answer && (
                    <button type="button" onClick={card.close} className="shrink-0 rounded-full border border-outline-variant px-3 py-1.5 font-headline text-sm font-semibold hover:bg-surface-container">
                      Entendido
                    </button>
                  )}
                </div>
              </div>
              {(pin || card.answer) && (
                <button type="button" onClick={card.close} aria-label="Cerrar" className="-m-1 rounded-full p-2 text-on-surface-variant hover:bg-surface-container">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {card.answer && (
              <div className="mx-3 border-t border-outline-variant/60 py-3">
                <p className="mb-2 font-headline text-sm font-bold">¿Sigue ahí?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => card.answer!(true)} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 font-headline text-sm font-semibold text-on-primary hover:bg-primary-container">
                    <ThumbsUp className="size-4" aria-hidden />
                    Sigue ahí
                  </button>
                  <button type="button" onClick={() => card.answer!(false)} className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant px-3 py-2.5 font-headline text-sm font-semibold hover:bg-surface-container">
                    <ThumbsDown className="size-4" aria-hidden />
                    Ya no está
                  </button>
                </div>
              </div>
            )}
            {/* el cambio de tracción se cierra solo cuando la barra se consume (10 s) */}
            {card.drain && <div className="h-1 origin-left" style={{ background: card.color, animation: "drain 10s linear forwards" }} onAnimationEnd={card.close} />}
          </div>
        )}
        {waiting > 0 && (
          <p role="status" className="pointer-events-auto flex items-center gap-2 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 text-xs shadow-lg ring-1 ring-outline-variant/60">
            <CloudOff className="size-4 shrink-0 text-on-surface-variant" aria-hidden />
            {waiting} por subir · se envían al tener señal
          </p>
        )}
        {rejected && (
          <div role="alert" className="pointer-events-auto w-full max-w-md rounded-2xl bg-surface-container-lowest p-3 text-sm shadow-lg ring-1 ring-error/40">
            <p className="text-error">
              <b>{rejected.kind === "traccion" ? TRACTION[rejected.traction!].label : NOTICE[rejected.kind].label} · {kmLabel(rejected.km)}</b> no se subió: {rejected.error}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => discardAnnotation(rejected.id)} className="rounded-full px-3 py-1.5 font-headline font-semibold hover:bg-error/10">
                Descartar
              </button>
              <button type="button" onClick={() => retryAnnotation(rejected.id)} className="rounded-full border border-error/40 px-3 py-1.5 font-headline font-semibold hover:bg-error/10">
                Reintentar
              </button>
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

      {/* con el avance o la hoja de reportar desplegados suben: las hojas llegan a media pantalla o más */}
      <div className={clsx("absolute right-3 flex -translate-y-1/2 flex-col gap-3 transition-[top]", expanded ? "top-1/4" : open === "reportar" ? "top-1/5" : "top-1/2")}>
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
          onClick={() => {
            // con el seguimiento prendido, el botón apaga el GPS: la última lectura deja de valer como "donde estás"
            if (tracking) setProgress((p) => p && { ...p, stale: true });
            ready?.locate();
          }}
          className={clsx(ROUND, tracking ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface")}
        >
          <LocateFixed className="size-6" aria-hidden />
        </button>
        {canReport && (
          <button
            type="button"
            aria-label="Reportar en este punto"
            aria-expanded={open === "reportar"}
            onClick={() => (open === "reportar" ? setOpen(null) : openReport())}
            className={clsx(ROUND, "bg-secondary text-on-secondary")}
          >
            <MessageSquarePlus className="size-6" aria-hidden />
          </button>
        )}
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
                      setSeen(new Set());
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
          {annotations?.some((a) => a.kind === "traccion") && (
            <p className="absolute bottom-full left-0 mb-2 flex gap-3 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 font-mono text-[11px] shadow-lg ring-1 ring-outline-variant/60">
              {Object.values(TRACTION).map((t) => (
                <span key={t.label} className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </span>
              ))}
            </p>
          )}
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

      {open === "reportar" && (
        <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-surface-container-lowest px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-outline-variant/60">
          <div className="mb-1 flex justify-center">
            <button type="button" onClick={() => setOpen(null)} aria-label="Cerrar" className="flex flex-col items-center gap-1 px-8 text-on-surface-variant">
              <span className="h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
              <ChevronDown className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-headline text-xl font-bold">Reportar aquí</h2>
            <span className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2.5 py-1 font-mono text-xs uppercase">
              <span className={clsx("size-2 rounded-full", online ? "bg-primary" : "bg-secondary-container")} aria-hidden />
              {spot ? kmLabel(spot.km) : "Km …"}
              {!online && " · sin señal"}
            </span>
          </div>
          {!spot ? (
            <p className="mb-3 font-mono text-xs text-on-surface-variant">Buscando tu ubicación…</p>
          ) : (
            spot.offM > 50 &&
            spot.offM > spot.accuracy && (
              <p className="mb-3 flex gap-2 rounded-xl bg-secondary-fixed/50 p-2.5 text-sm text-on-secondary-container">
                <TriangleAlert className="size-4 shrink-0 text-secondary" aria-hidden />
                Estás a {metersLabel(spot.offM)} del sendero: se marca el punto más cercano del trazo.
              </p>
            )
          )}
          <p className={SECTION}>Tracción desde este punto</p>
          {back ? (
            <p className="mb-4 flex items-center gap-1.5 text-sm text-on-surface-variant">
              <Info className="size-4 shrink-0" aria-hidden />
              La tracción se marca de ida.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-outline-variant bg-surface-container p-1">
                {(Object.keys(TRACTION) as Traction[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={mark === t}
                    onClick={() => setMark(t)}
                    className={clsx("flex items-center justify-center gap-2 rounded-xl border py-2.5 font-headline font-semibold", mark === t ? "bg-surface-container-lowest" : "border-transparent")}
                    style={mark === t ? { borderColor: TRACTION[t].color, background: `${TRACTION[t].color}1f` } : undefined}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: TRACTION[t].color }} aria-hidden />
                    {TRACTION[t].label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 mb-4 flex items-center gap-1.5 text-sm text-on-surface-variant">
                <Info className="size-4 shrink-0" aria-hidden />
                El tramo sigue hasta que la cambies.
              </p>
            </>
          )}
          <p className={SECTION}>Marcar un punto</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(NOTICE) as NoticeKind[]).map((k) => {
              const n = NOTICE[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={mark === k}
                  onClick={() => setMark(k)}
                  className={clsx("flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-sm font-semibold", mark === k ? "border-2" : "border-outline-variant")}
                  style={mark === k ? { borderColor: n.color, background: `${n.color}1f` } : undefined}
                >
                  <span className="flex size-10 items-center justify-center rounded-full text-white" style={{ background: n.color }}>
                    <n.icon className="size-5" aria-hidden />
                  </span>
                  {n.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={2}
            aria-label="Nota"
            placeholder={mark === "comentario" ? "Escribe el comentario" : "Agrega una nota (opcional)"}
            className="mt-3 w-full resize-none rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={report}
            disabled={!spot || !mark || (mark === "comentario" && !note.trim())}
            className="mt-2 w-full rounded-2xl bg-primary py-3 font-headline font-bold text-on-primary disabled:opacity-40"
          >
            Guardar
          </button>
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
