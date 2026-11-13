"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { LineString } from "geojson";
import { ArrowDown, Clock, Mountain, RotateCw, Smartphone, Square } from "lucide-react";
import { FavoriteButton } from "@/components/favorite-button";
import type { ProfilePoint } from "@/lib/gpx";
import { cancelAllDownloads, cancelDownload, estimateDownload, formatMb, offlineSupported, queueDownload, useDownloads, useIosSafariTab, type DownloadState } from "@/lib/offline";
import { formatDuration, formatKm, type RouteSummary } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

type Shape = { line: [number, number][]; profile: ProfilePoint[] | null };

// encendido: cada visita a /guardadas encola las nuevas y las incompletas
const AUTO_KEY = "brecha-descargar-guardadas";
const noSubscribe = () => () => {};
// una vez por carga de la app: volver a /guardadas no reencola lo que se canceló a mano
let autoQueued = false;

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

const ROUND = "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors";

/** Rutas guardadas con su estado de descarga y el interruptor para bajarlas todas. */
export function SavedRoutes({ routes }: { routes: RouteSummary[] }) {
  const [shapes, setShapes] = useState<Record<string, Shape> | null>(null);
  const { routes: downloads } = useDownloads();
  const iosTab = useIosSafariTab();
  const supported = useSyncExternalStore(noSubscribe, offlineSupported, () => false);
  const stored = useSyncExternalStore(noSubscribe, readAuto, () => false);
  const [auto, setAuto] = useState<boolean | null>(null);
  const on = (auto ?? stored) && !iosTab;
  const [shapesError, setShapesError] = useState(false);
  const loading = useRef<PromiseLike<Record<string, Shape> | null> | null>(null);

  // los trazos se piden solo con el interruptor encendido o en la primera descarga
  function loadShapes() {
    return (loading.current ??= createClient()
      .from("route_shapes")
      .select("slug, track, elevation_profile")
      .in(
        "slug",
        routes.map((r) => r.slug),
      )
      .then(({ data, error }) => {
        setShapesError(!!error);
        if (error) {
          console.error("route_shapes guardadas:", error.message);
          loading.current = null;
          return null;
        }
        const rows = data as { slug: string; track: LineString | null; elevation_profile: ProfilePoint[] | null }[];
        const next = Object.fromEntries(rows.filter((r) => r.track).map((r) => [r.slug, { line: r.track!.coordinates as [number, number][], profile: r.elevation_profile }]));
        setShapes(next);
        return next;
      }));
  }

  useEffect(() => {
    // tras un fallo no se reintenta solo: lo reintenta la siguiente acción
    if (on && !shapes && !shapesError) void loadShapes();
  });

  const mb = useMemo(() => Object.values(shapes ?? {}).reduce((sum, s) => sum + estimateDownload(s.line).mb, 0), [shapes]);

  function queue(route: RouteSummary) {
    loadShapes().then((loaded) => {
      const shape = loaded?.[route.slug];
      if (shape) queueDownload(route, shape.line, shape.profile);
    });
  }

  // con el interruptor encendido, ya leídos los trazos y el dispositivo
  useEffect(() => {
    if (!on || !shapes || !downloads || autoQueued) return;
    autoQueued = true;
    for (const r of routes) {
      const status = downloads[r.slug]?.status;
      if (status !== "lista" && status !== "bajando" && status !== "en-cola" && status !== "en-pausa") queue(r);
    }
  });

  function toggle() {
    const next = !on;
    setAuto(next);
    // encender encola todo en el efecto de arriba; apagar no borra lo descargado (eso se hace en /descargas)
    autoQueued = !next;
    try {
      localStorage.setItem(AUTO_KEY, next ? "1" : "0");
    } catch {
      // sin almacenamiento: vale solo para esta visita
    }
    if (!next) cancelAllDownloads();
  }

  const withShape = shapes ? routes.filter((r) => shapes[r.slug]).length : 0;

  return (
    <div className="space-y-5">
      {supported && (
        <div className="space-y-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-primary">
              <ArrowDown className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-headline font-bold">Descargar para usar sin señal</p>
              <p className="font-mono text-xs text-on-surface-variant">
                {shapes ? `${withShape} ${withShape === 1 ? "ruta" : "rutas"} · ≈ ${Math.round(mb)} MB` : `${routes.length} ${routes.length === 1 ? "ruta" : "rutas"}`}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label="Descargar para usar sin señal"
              disabled={iosTab}
              onClick={toggle}
              className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-outline-variant")}
            >
              <span className={clsx("absolute top-1 left-1 size-5 rounded-full bg-surface-container-lowest shadow-xs transition-transform", on && "translate-x-5")} />
            </button>
          </div>
          {shapesError && <p className="text-xs font-medium text-error">No se pudieron cargar los trazos. Revisa tu conexión.</p>}
          {iosTab && (
            <p className="flex gap-2 rounded-xl bg-secondary-fixed/40 p-3 text-xs">
              <Smartphone className="size-4 shrink-0 text-secondary" aria-hidden />
              <span>
                En iPhone, agrega Brecha a tu pantalla de inicio (Compartir → <b>Agregar a inicio</b>) y guarda las rutas desde la app: lo que se guarda en Safari no aparece ahí.
              </span>
            </p>
          )}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {routes.map((r) => (
          <SavedRow
            key={r.id}
            route={r}
            hasShape={!shapes || !!shapes[r.slug]}
            download={!supported || !downloads ? undefined : (downloads[r.slug] ?? (shapes && !shapes[r.slug] ? undefined : null))}
            disabled={iosTab}
            onQueue={() => queue(r)}
          />
        ))}
      </ul>
    </div>
  );
}

/** `download`: undefined sin estado que mostrar (sin soporte o sin trazo), null si no está descargada. */
function SavedRow({
  route,
  hasShape,
  download,
  disabled,
  onQueue,
}: {
  route: RouteSummary;
  hasShape: boolean;
  download: DownloadState | null | undefined;
  disabled: boolean;
  onQueue: () => void;
}) {
  const percent = download?.status === "bajando" ? Math.floor((download.done / download.total) * 100) : 0;
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-3 shadow-xs">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-container sm:size-24">
        {route.cover_url ? (
          <Image src={route.cover_url} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
            <Mountain className="size-8" aria-hidden />
          </div>
        )}
        <div className="absolute top-1 right-1 scale-75">
          <FavoriteButton routeId={route.id} slug={route.slug} variant="card" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/rutas/${route.slug}`} className="block truncate font-headline font-bold hover:text-primary">
          {route.name}
        </Link>
        <p className="text-sm text-on-surface-variant">{route.place_label}</p>
        <p className="font-mono text-xs text-on-surface-variant">
          {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m · {formatDuration(route.duration_min)}
        </p>
        {!hasShape && <p className="mt-0.5 text-sm text-on-surface-variant">Sin trazo para descargar</p>}
        {download?.status === "lista" && <p className="mt-0.5 text-sm font-semibold text-primary">Descargada · {formatMb(download.bytes)}</p>}
        {download?.status === "bajando" && <p className="mt-0.5 text-sm font-semibold text-primary">Descargando… {percent}%</p>}
        {download?.status === "en-cola" && <p className="mt-0.5 text-sm text-on-surface-variant">En cola</p>}
        {download?.status === "en-pausa" && <p className="mt-0.5 text-sm font-semibold text-secondary">Sin conexión · se reanuda sola</p>}
        {download?.status === "incompleta" && (
          <>
            <p className="mt-0.5 text-sm font-semibold text-secondary">Descarga incompleta · Reintentar</p>
            {download.error && <p className="text-xs text-error">{download.error}</p>}
          </>
        )}
      </div>
      {download === null && (
        <button type="button" onClick={onQueue} disabled={disabled} aria-label={`Descargar ${route.name}`} className={clsx(ROUND, "disabled:opacity-50 border border-outline-variant text-primary hover:bg-surface-container")}>
          <ArrowDown className="size-5" aria-hidden />
        </button>
      )}
      {download?.status === "lista" && (
        <a href={`/descargas?ruta=${encodeURIComponent(route.slug)}`} aria-label={`Abrir ${route.name} sin conexión`} className={clsx(ROUND, "bg-primary text-on-primary hover:bg-primary-container")}>
          <ArrowDown className="size-5" aria-hidden />
        </a>
      )}
      {download?.status === "bajando" && (
        <button
          type="button"
          onClick={() => cancelDownload(route.slug)}
          aria-label={`Cancelar la descarga de ${route.name}`}
          className={clsx(ROUND, "p-1")}
          style={{ background: `conic-gradient(var(--color-primary) ${percent}%, var(--color-surface-container-high) 0)` }}
        >
          <span className="flex size-full items-center justify-center rounded-full bg-surface-container-lowest text-primary">
            <Square className="size-3.5" aria-hidden />
          </span>
        </button>
      )}
      {(download?.status === "en-cola" || download?.status === "en-pausa") && (
        <button type="button" onClick={() => cancelDownload(route.slug)} aria-label={download.status === "en-pausa" ? `Cancelar la descarga de ${route.name}` : `Quitar ${route.name} de la cola`} className={clsx(ROUND, "border border-outline-variant bg-surface-container text-on-surface-variant")}>
          <Clock className="size-5" aria-hidden />
        </button>
      )}
      {download?.status === "incompleta" && (
        <button type="button" onClick={onQueue} disabled={disabled} aria-label={`Reintentar la descarga de ${route.name}`} className={clsx(ROUND, "disabled:opacity-50 border-2 border-secondary text-secondary hover:bg-secondary-fixed/40")}>
          <RotateCw className="size-5" aria-hidden />
        </button>
      )}
    </li>
  );
}
