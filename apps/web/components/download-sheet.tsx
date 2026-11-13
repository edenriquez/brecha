"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { FeatureCollection, Polygon } from "geojson";
import { Binoculars, Box, Footprints, Hexagon, Layers, Lock, Map as MapIcon, Mountain, Spline, Waves, X, type LucideIcon } from "lucide-react";
import { cellPolygon, cellsBounds, ringCells } from "@/lib/hex-grid";
import { collapseAttribution, MAP_STYLE, maplibregl, setTrack } from "@/lib/maplibre";
import {
  DEFAULT_OPTIONS,
  DEFAULT_RADIUS_KM,
  estimateDownload,
  formatMb,
  layerZone,
  RADII_KM,
  storageStatus,
  type DownloadChoice,
  type DownloadOptions,
  type OfflineRouteInfo,
} from "@/lib/offline";

type Row = { id: keyof DownloadOptions | "map" | "names"; icon: LucideIcon; name: string; hint: string; regional?: boolean };

const ROWS: Row[] = [
  { id: "map", icon: MapIcon, name: "Mapa y satélite", hint: "Necesario para abrir la ruta" },
  { id: "terrain", icon: Box, name: "Relieve en 3D", hint: "Montañas en volumen" },
  { id: "contours", icon: Spline, name: "Curvas de nivel", hint: "Usa el relieve, no pesa más" },
  { id: "names", icon: Mountain, name: "Nombres y cerros", hint: "Cimas, pasos y refugios" },
  { id: "roads", icon: Footprints, name: "Caminos y veredas", hint: "Brechas y terracerías", regional: true },
  { id: "waterfalls", icon: Waves, name: "Cauces y cascadas", hint: "Arroyos y posibles cascadas", regional: true },
  { id: "viewpoints", icon: Binoculars, name: "Miradores y acampado", hint: "Vistas y lugares para acampar", regional: true },
  { id: "lidar", icon: Layers, name: "Relieve LiDAR", hint: "El terreno a 5 m de detalle", regional: true },
];

const ZONE_COLOR = "#164525";
const RING_COLOR = "#717970";
const MB = 1024 * 1024;
const FIT = { top: 64, bottom: 56, left: 24, right: 24 };

function cellsGeoJson(cells: string[]): FeatureCollection<Polygon> {
  return { type: "FeatureCollection", features: cells.map((id) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [cellPolygon(id)] } })) };
}

/** Hoja para elegir la zona de hexágonos y las capas que se guardan con la ruta (mock 08); `initial`: lo ya guardado. */
export function DownloadSheet({
  route,
  line,
  initial,
  onDownload,
  onClose,
}: {
  route: OfflineRouteInfo;
  line: [number, number][];
  initial?: DownloadChoice;
  onDownload: (choice: DownloadChoice) => void;
  onClose: () => void;
}) {
  const [radiusKm, setRadiusKm] = useState(initial?.radiusKm ?? DEFAULT_RADIUS_KM);
  const [options, setOptions] = useState(initial?.options ?? DEFAULT_OPTIONS);
  // undefined mientras se lee capa.json: las filas regionales aparecen si la ruta toca su zona
  const [zone, setZone] = useState<Awaited<ReturnType<typeof layerZone>> | undefined>(undefined);
  const [free, setFree] = useState<number | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const estimate = useMemo(() => estimateDownload(line, radiusKm, options, zone ?? null), [line, radiusKm, options, zone]);

  useEffect(() => {
    const controller = new AbortController();
    layerZone(line, controller.signal).then(setZone, () => {});
    storageStatus()
      .then((s) => s && setFree(Math.max(0, s.quota - s.usage)))
      .catch(() => {});
    return () => controller.abort();
  }, [line]);

  useEffect(() => dialog.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // mapa plano y quieto: solo muestra la zona
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({ container: container.current, style: MAP_STYLE, interactive: false, attributionControl: { compact: true }, bounds: cellsBounds(estimate.cells), fitBoundsOptions: { padding: FIT } });
    m.once("load", () => {
      const firstLabel = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.addSource("zone-ring", { type: "geojson", data: cellsGeoJson([]) });
      m.addSource("zone", { type: "geojson", data: cellsGeoJson([]) });
      m.addLayer({ id: "zone-ring", type: "line", source: "zone-ring", paint: { "line-color": RING_COLOR, "line-opacity": 0.5, "line-width": 1 } }, firstLabel);
      m.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": ZONE_COLOR, "fill-opacity": 0.28 } }, firstLabel);
      m.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": ZONE_COLOR, "line-width": 1.5 } }, firstLabel);
      setTrack(m, line);
      collapseAttribution(m);
      setMap(m);
    });
    return () => m.remove();
    // la zona inicial solo encuadra; los cambios los aplica el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  useEffect(() => {
    if (!map) return;
    map.getSource<maplibregl.GeoJSONSource>("zone")?.setData(cellsGeoJson(estimate.cells));
    map.getSource<maplibregl.GeoJSONSource>("zone-ring")?.setData(cellsGeoJson(ringCells(estimate.cells)));
    map.fitBounds(cellsBounds(estimate.cells), { padding: FIT, duration: 300 });
  }, [map, estimate.cells]);

  function toggle(id: keyof DownloadOptions) {
    setOptions((o) => {
      const next = { ...o, [id]: !o[id] };
      // las curvas salen del relieve: sin él no hay curvas
      if (id === "terrain") next.contours = next.terrain;
      return next;
    });
  }

  const rowMb = (id: Row["id"]) => (id === "contours" || id === "names" ? 0 : estimate.rows[id]);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal
        aria-labelledby="descarga-titulo"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-dvh w-full flex-col overflow-hidden bg-surface outline-none sm:h-[min(52rem,92dvh)] sm:max-w-md sm:rounded-3xl sm:shadow-2xl"
      >
        <div className="relative h-[38dvh] min-h-56 shrink-0 bg-[#e3e8e1] sm:h-72">
          {/* maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper */}
          <div className="absolute inset-0">
            <div ref={container} className="h-full w-full" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 flex size-11 items-center justify-center rounded-full bg-surface-container-lowest shadow-md"
          >
            <X className="size-5" aria-hidden />
          </button>
          <p className="absolute top-[max(1rem,env(safe-area-inset-top))] right-3 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 font-mono text-xs shadow-md">
            {estimate.cells.length} hexágonos · {Math.round(estimate.areaKm2).toLocaleString("es-MX")} km²
          </p>
          <p className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 text-xs shadow-md">
            <Hexagon className="size-4 fill-primary/30 text-primary" aria-hidden />
            Zona que se descarga
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/60 bg-surface-container-low px-4 py-3">
          <span id="radio-titulo" className="text-sm font-medium">
            Alrededor de la ruta
          </span>
          <div role="radiogroup" aria-labelledby="radio-titulo" className="flex rounded-xl bg-surface-container-high p-1">
            {RADII_KM.map((km) => (
              <button
                key={km}
                type="button"
                role="radio"
                aria-checked={radiusKm === km}
                onClick={() => setRadiusKm(km)}
                className={clsx("rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors", radiusKm === km ? "bg-primary text-on-primary" : "text-on-surface-variant")}
              >
                {km} km
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <h2 id="descarga-titulo" className="font-headline text-xl font-bold">
            Qué llevar sin señal
          </h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">{route.name} · solo se guarda la zona marcada</p>
          <ul className="mt-4 divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest">
            {ROWS.filter((r) => !r.regional || zone).map(({ id, icon: Icon, name, hint }) => {
              const option = id === "map" || id === "names" ? null : id;
              const on = option ? options[option] : true;
              const disabled = option === "contours" && !options.terrain;
              return (
                <li key={id} className={clsx("grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_3rem] items-center gap-3 px-4 py-3", disabled && "opacity-50")}>
                  <Icon className="size-5 text-primary" aria-hidden />
                  <div>
                    <p id={`fila-${id}`} className="font-headline font-semibold">
                      {name}
                    </p>
                    <p className="text-xs text-on-surface-variant">{hint}</p>
                  </div>
                  <span className="text-right font-mono text-xs text-on-surface-variant">{formatMb(rowMb(id) * MB)}</span>
                  <span className="flex justify-end">
                    {id === "map" ? (
                      <span className="flex size-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant" aria-label="Obligatorio">
                        <Lock className="size-4" aria-hidden />
                      </span>
                    ) : id === "names" ? (
                      <span className="font-mono text-[11px] text-on-surface-variant">Incluido</span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on && !disabled}
                        aria-labelledby={`fila-${id}`}
                        disabled={disabled}
                        onClick={() => toggle(option!)}
                        className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on && !disabled ? "bg-primary" : "bg-outline-variant")}
                      >
                        <span className={clsx("absolute top-1 size-5 rounded-full bg-surface-container-lowest shadow transition-[left]", on && !disabled ? "left-6" : "left-1")} />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant/60 bg-surface-container-lowest px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div>
            <p className="font-headline text-xl font-bold">≈ {formatMb(estimate.mb * MB)}</p>
            {free !== null && <p className="font-mono text-[11px] text-on-surface-variant">Quedan {formatMb(free)} libres</p>}
          </div>
          <button
            type="button"
            onClick={() => onDownload({ radiusKm, options })}
            className="rounded-2xl bg-primary px-6 py-3 font-headline text-base font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Descargar
          </button>
        </div>
      </div>
    </div>
  );
}
