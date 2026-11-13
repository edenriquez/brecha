"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Check, Droplet, Eye, Footprints, Map as MapIcon, Mountain, MountainSnow, Route, Satellite, Tent, WifiOff, X, type LucideIcon } from "lucide-react";

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

const OVERLAYS: { id: Overlay; label: string; icon: LucideIcon }[] = [
  { id: "contours", label: "Curvas de nivel", icon: Route },
  { id: "names", label: "Nombres y cerros", icon: Mountain },
  { id: "roads", label: "Caminos y veredas", icon: Footprints },
  { id: "waterfalls", label: "Cauces y cascadas", icon: Droplet },
  { id: "viewpoints", label: "Miradores", icon: Eye },
  { id: "camps", label: "Zonas de acampar", icon: Tent },
];

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

/**
 * Hoja inferior para elegir mapa base y capas; cada cambio se aplica al instante (lo aplica quien la usa).
 * `zone`: la ruta toca la zona de las capas regionales. `lidar`: el relieve LiDAR se puede cargar (necesita señal).
 * `saved`: lo que ofrece la hoja quedó guardado con la ruta.
 */
export function LayerSheet({
  layers,
  onChange,
  zone,
  lidar,
  saved,
  onClose,
}: {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  zone: boolean;
  lidar: boolean;
  saved: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => dialog.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
              {disabled && <span className="-mt-1 font-mono text-[10px] text-on-surface-variant">Necesita señal</span>}
              {on && <Check className="absolute top-1 right-1 size-5 rounded-full bg-primary p-0.5 text-on-primary" aria-hidden />}
            </button>
          );
        })}
      </div>

      <p className={SECTION}>Sobre el mapa</p>
      <div className="grid grid-cols-2 gap-2">
        {OVERLAYS.filter((o) => zone || !REGIONAL.includes(o.id)).map(({ id, label, icon: Icon }) => {
          const on = layers.overlays.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...layers, overlays: on ? layers.overlays.filter((o) => o !== id) : [...layers.overlays, id] })}
              className={clsx(
                "flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left font-headline text-sm font-semibold",
                on ? "border-primary bg-primary-fixed text-on-primary-fixed-variant" : "border-outline-variant text-on-surface",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

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
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[11px] text-on-surface-variant">
        <WifiOff className="size-3.5 shrink-0" aria-hidden />
        {saved ? "Guardado con la ruta · funciona sin señal" : "Vuelve a descargar la ruta con señal para usar estas capas sin conexión"}
      </p>
    </div>
  );
}
