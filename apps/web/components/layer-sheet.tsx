"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import {
  Check,
  CircleCheck,
  Download,
  Droplet,
  Eye,
  EyeOff,
  Footprints,
  Hexagon,
  Map as MapIcon,
  Mountain,
  MountainSnow,
  Route,
  Satellite,
  Square,
  Tent,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { cancelDownload, DEFAULT_RADIUS_KM, formatMb, type DownloadChoice, type DownloadOptions, type DownloadState, type OfflineRoute } from "@/lib/offline";

// solo con señal: no hace falta en el HTML que guarda el service worker
const DownloadSheet = dynamic(() => import("./download-sheet").then((m) => m.DownloadSheet), { ssr: false });

export type Base = "satellite" | "topo" | "lidar";
export type Overlay = "contours" | "names" | "roads" | "waterfalls" | "viewpoints" | "camps";
export type MapLayers = { base: Base; overlays: Overlay[]; terrain3d: boolean };

/** Solo existen en la zona analizada (los `bounds` de capa.json), igual que el relieve LiDAR. */
export const REGIONAL: Overlay[] = ["roads", "waterfalls", "viewpoints", "camps"];

const BASES: { id: Base; label: string; icon: LucideIcon; thumb: string }[] = [
  { id: "satellite", label: "Satélite", icon: Satellite, thumb: "bg-linear-to-br from-primary-container to-tertiary-container text-on-primary" },
  { id: "topo", label: "Topográfico", icon: MapIcon, thumb: "bg-surface-container text-tertiary" },
  { id: "lidar", label: "Relieve LiDAR", icon: Mountain, thumb: "bg-linear-to-br from-surface-container-high to-outline text-on-primary" },
];

// de qué opción de la descarga depende cada capa; los nombres van siempre con el mapa base
const OVERLAYS: { id: Overlay; label: string; icon: LucideIcon; option: keyof DownloadOptions | null }[] = [
  { id: "contours", label: "Curvas de nivel", icon: Route, option: "contours" },
  { id: "names", label: "Nombres y cerros", icon: Mountain, option: null },
  { id: "roads", label: "Caminos y veredas", icon: Footprints, option: "roads" },
  { id: "waterfalls", label: "Cauces y cascadas", icon: Droplet, option: "waterfalls" },
  { id: "viewpoints", label: "Miradores", icon: Eye, option: "viewpoints" },
  { id: "camps", label: "Zonas de acampar", icon: Tent, option: "viewpoints" },
];

/** Lo que guardó el registro; el de formato anterior llevaba curvas y nombres, y las regionales según `layers`. */
export function savedOptions(route: OfflineRoute): DownloadOptions {
  const regional = !!route.layers;
  return route.options ?? { terrain: true, contours: true, roads: regional, waterfalls: regional, viewpoints: regional, lidar: false };
}

/** Si la capa está en el teléfono. */
export function overlaySaved(id: Overlay, options: DownloadOptions) {
  const option = OVERLAYS.find((o) => o.id === id)!.option;
  return !option || (options[option] && (option !== "contours" || options.terrain));
}

const KEY = "brecha:capas";
const DEFAULT_LAYERS: MapLayers = { base: "satellite", overlays: ["names"], terrain3d: true };

/** La elección de capas, una para todas las rutas; sin almacenamiento (o ilegible), la inicial. */
export function loadLayers(): MapLayers {
  try {
    const saved: MapLayers = { ...DEFAULT_LAYERS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    return Array.isArray(saved.overlays) ? saved : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

export function saveLayers(layers: MapLayers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layers));
  } catch {
    // sin almacenamiento: la elección dura lo que la página
  }
}

function subscribeOnline(listener: () => void) {
  addEventListener("online", listener);
  addEventListener("offline", listener);
  return () => {
    removeEventListener("online", listener);
    removeEventListener("offline", listener);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const SECTION = "mb-2 mt-4 font-mono text-xs tracking-widest text-on-surface-variant uppercase";
const ACTION = "flex size-10 items-center justify-center rounded-full";

/**
 * Hoja inferior para elegir mapa base y ver qué capas hay en el teléfono (mock 09); los cambios los aplica quien la usa.
 * `zone`: la ruta toca la zona de las capas regionales. `lidar`: el relieve LiDAR se puede mostrar.
 * `download`: la descarga en curso de esta ruta; `requested`: lo que pidió esa descarga desde el visor.
 */
export function LayerSheet({
  layers,
  onChange,
  zone,
  lidar,
  route,
  download,
  requested,
  onDownload,
  onClose,
}: {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  zone: boolean;
  lidar: boolean;
  route: OfflineRoute;
  download: DownloadState | undefined;
  requested: DownloadOptions | null;
  onDownload: (choice: DownloadChoice) => void;
  onClose: () => void;
}) {
  const online = useOnline();
  const [expand, setExpand] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => dialog.current?.focus(), []);
  useEffect(() => {
    // con la hoja de descarga abierta, Escape la cierra a ella
    if (expand) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, expand]);

  const saved = savedOptions(route);
  const radiusKm = route.radiusKm ?? DEFAULT_RADIUS_KM;
  const busy = download?.status === "bajando" || download?.status === "en-cola";
  const percent = download?.status === "bajando" ? Math.floor((download.done / download.total) * 100) : 0;
  const lidarSaved = saved.lidar;
  function add(option: keyof DownloadOptions) {
    // las curvas salen del relieve: sin él no hay curvas
    onDownload({ radiusKm, options: { ...saved, [option]: true, ...(option === "contours" && { terrain: true }) } });
  }

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-labelledby="capas-titulo"
      tabIndex={-1}
      className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-3xl bg-surface-container-lowest px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-outline-variant/60 outline-none"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <h2 id="capas-titulo" className="font-headline text-xl font-bold">
          Capas del mapa
        </h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <p className={SECTION}>Mapa base</p>
      <div className="grid grid-cols-3 gap-2">
        {BASES.filter((b) => zone || b.id !== "lidar").map(({ id, label, icon: Icon, thumb }) => {
          const on = layers.base === id;
          const disabled = id === "lidar" && !lidar;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange({ ...layers, base: id })}
              className={clsx(
                "relative flex flex-col gap-1.5 rounded-2xl border-2 p-1.5 text-center",
                on ? "border-primary bg-surface-container-low text-primary" : "border-outline-variant/60 text-on-surface",
                disabled && "opacity-50",
              )}
            >
              <span className={clsx("flex aspect-square items-center justify-center rounded-xl", thumb)}>
                <Icon className="size-7" aria-hidden />
              </span>
              <span className="font-headline text-sm font-semibold">{label}</span>
              {id === "lidar" && (disabled || lidarSaved) && (
                <span className={clsx("-mt-1 font-mono text-[10px]", disabled ? "text-secondary" : "text-primary")}>{disabled ? "Necesita señal" : "Descargado"}</span>
              )}
              {on && <Check className="absolute top-1 right-1 size-5 rounded-full bg-primary p-0.5 text-on-primary" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="mt-5 mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-headline text-lg font-bold">En este teléfono</h3>
        <span className="font-mono text-xs text-on-surface-variant">
          {formatMb(route.bytes)}
          {route.radiusKm && ` · ${route.radiusKm} km alrededor`}
        </span>
      </div>
      <ul className="divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant/70">
        {OVERLAYS.filter((o) => zone || !REGIONAL.includes(o.id)).map(({ id, label, icon: Icon, option }) => {
          const here = overlaySaved(id, saved);
          const on = layers.overlays.includes(id);
          const loading = !here && busy && !!option && !!requested?.[option];
          return (
            <li key={id} className="grid min-h-14 grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_2.5rem] items-center gap-2.5 px-3 py-2">
              <Icon className={clsx("size-5", here ? "text-primary" : "text-on-surface-variant")} aria-hidden />
              <span id={`capa-${id}`} className="font-headline text-sm font-semibold">
                {label}
              </span>
              <span className="text-right text-xs tabular-nums">
                {here ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-primary">
                    Descargado
                    <CircleCheck className="size-4 shrink-0 fill-primary text-on-primary" aria-hidden />
                  </span>
                ) : loading ? (
                  <span className="font-semibold text-primary">Descargando… {percent}%</span>
                ) : online ? (
                  <span className="text-on-surface-variant">No descargado</span>
                ) : (
                  <span className="text-secondary">Necesita señal</span>
                )}
              </span>
              {here ? (
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={on ? "Ocultar" : "Mostrar"}
                  aria-describedby={`capa-${id}`}
                  onClick={() => onChange({ ...layers, overlays: on ? layers.overlays.filter((o) => o !== id) : [...layers.overlays, id] })}
                  className={clsx(ACTION, on ? "bg-primary-fixed text-on-primary-fixed-variant" : "bg-surface-container text-on-surface-variant")}
                >
                  {on ? <Eye className="size-5" aria-hidden /> : <EyeOff className="size-5" aria-hidden />}
                </button>
              ) : loading ? (
                <button type="button" aria-label="Detener la descarga" onClick={() => cancelDownload(route.slug)} className={clsx(ACTION, "bg-surface-container text-primary")}>
                  <Square className="size-4 fill-current" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Descargar"
                  aria-describedby={`capa-${id}`}
                  disabled={!online || busy}
                  onClick={() => add(option!)}
                  className={clsx(ACTION, "border border-primary text-primary disabled:border-outline-variant disabled:text-outline-variant")}
                >
                  <Download className="size-5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {online && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setExpand(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary py-3 font-headline font-semibold text-primary disabled:opacity-50"
        >
          <Hexagon className="size-5" aria-hidden />
          Ampliar la zona descargada
        </button>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-outline-variant/60 pt-4">
        <MountainSnow className="size-6 shrink-0 text-primary" aria-hidden />
        <span id="relieve-3d" className="flex-1 font-headline font-semibold">
          Relieve en 3D
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={layers.terrain3d}
          aria-labelledby="relieve-3d"
          onClick={() => onChange({ ...layers, terrain3d: !layers.terrain3d })}
          className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors", layers.terrain3d ? "bg-primary" : "bg-outline-variant")}
        >
          <span className={clsx("absolute top-1 size-5 rounded-full bg-surface-container-lowest shadow transition-[left]", layers.terrain3d ? "left-6" : "left-1")} />
        </button>
      </div>
      {(!route.cells || !online) && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[11px] text-on-surface-variant">
          <WifiOff className="size-3.5 shrink-0" aria-hidden />
          {route.cells ? "Sin señal · ves solo lo guardado en este teléfono" : "Vuelve a descargar la ruta para ver la zona guardada"}
        </p>
      )}

      {expand && (
        <DownloadSheet
          route={route}
          line={route.line}
          initial={{ radiusKm, options: saved }}
          onDownload={(choice) => {
            onDownload(choice);
            setExpand(false);
          }}
          onClose={() => setExpand(false)}
        />
      )}
    </div>
  );
}
