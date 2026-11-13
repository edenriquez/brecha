"use client";

import type { FeatureCollection, Point } from "geojson";
import { Protocol } from "pmtiles";
import { maplibregl } from "@/lib/maplibre";

export const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/capas/lidar-izta`;
const ATTRIBUTION = "Relieve: INEGI, modelo digital de elevación 5 m";

export const FINDING_COLORS = {
  monticulo: "#ff9f1c",
  crater: "#e71d36",
  terrazas: "#2ec4b6",
  cantera: "#8d99ae",
} as const;

export const FINDING_LABELS: Record<keyof typeof FINDING_COLORS, string> = {
  monticulo: "Montículo",
  crater: "Cráter",
  terrazas: "Terrazas",
  cantera: "Cantera",
};

export const CANDIDATE_COLOR = "#3a86ff";
export const WATERFALL_COLOR = "#00b4d8";
export const STREAM_COLOR = "#2f7fc1";

type Waterfall = { caida_m: number; pendiente_max: number; cuenca_km2: number; altitud: number; fuente: "lidar" | "satelite" };
type Finding = { tipo: keyof typeof FINDING_COLORS; titulo: string; detalle: string; descripcion: string | null; confianza: "alta" | "media" };
type Candidate = { clase: string; diametro_m: number; relieve_m: number };
/** capa.json: el relieve viene partido en varios PMTiles (Storage no acepta archivos de más de 50 MB) */
type Manifest = { partes: string[]; bounds: [number, number, number, number] };

const OVERLAYS = ["lidar-coverage", "lidar-candidates", "lidar-findings"];

let protocol: Protocol | null = null;
const loading = new WeakMap<maplibregl.Map, Promise<Manifest>>();

/** Registra el protocolo pmtiles:// en maplibre una sola vez. */
export function registerPmtiles() {
  if (protocol) return;
  protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

export function popupContent(lines: [className: string, text: string][]) {
  const root = document.createElement("div");
  root.className = "max-w-64 space-y-1 font-body text-xs text-on-surface";
  for (const [className, text] of lines) {
    const el = document.createElement("p");
    el.className = className;
    el.textContent = text;
    root.append(el);
  }
  return root;
}

function findingPopup(f: Finding, [lng, lat]: number[]) {
  return popupContent([
    ["font-headline text-sm font-bold", f.titulo],
    ["", f.detalle],
    ...(f.descripcion ? [["text-on-surface-variant", f.descripcion] as [string, string]] : []),
    ["pt-1 text-[11px] text-on-surface-variant", `Confianza ${f.confianza} · ${lat.toFixed(5)}, ${lng.toFixed(5)}`],
  ]);
}

function candidatePopup(c: Candidate, [lng, lat]: number[]) {
  const shape = c.clase === "depresión cerrada" ? `${c.relieve_m} m de fondo` : `${c.relieve_m} m de alto`;
  return popupContent([
    ["font-headline text-sm font-bold", `${c.clase[0].toUpperCase()}${c.clase.slice(1)} (sin revisar)`],
    ["", `${c.diametro_m} m de ancho, ${shape}`],
    ["text-on-surface-variant", "Detectado automáticamente en el LiDAR. Puede ser un rasgo real, una construcción o un error del modelo."],
    ["pt-1 text-[11px] text-on-surface-variant", `${lat.toFixed(5)}, ${lng.toFixed(5)}`],
  ]);
}

function waterfallPopup(w: Waterfall, [lng, lat]: number[]) {
  return popupContent([
    ["font-headline text-sm font-bold", "Posible cascada (sin confirmar)"],
    ["", `Desnivel de unos ${Math.round(w.caida_m)} m, con tramos de hasta ${w.pendiente_max}°`],
    ["", `Cuenca de ${w.cuenca_km2.toLocaleString("es-MX")} km² · ${w.altitud.toLocaleString("es-MX")} m de altitud`],
    [
      "text-on-surface-variant",
      `Detectada en el relieve ${w.fuente === "lidar" ? "LiDAR (2007)" : "de satélite"}, no en campo: puede ser de temporada, estar seca o no tener acceso.`,
    ],
    ["pt-1 text-[11px] text-on-surface-variant", `${lat.toFixed(5)}, ${lng.toFixed(5)}`],
  ]);
}

/** Ficha al tocar un elemento: en un punto sale del punto, en una línea o un área, de donde se tocó. */
export function onClickShow<T>(map: maplibregl.Map, layer: string, content: (props: T, coords: number[]) => HTMLElement) {
  map.on("click", layer, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const coords = feature.geometry.type === "Point" ? (feature.geometry as Point).coordinates : [e.lngLat.lng, e.lngLat.lat];
    new maplibregl.Popup({ maxWidth: "280px" })
      .setLngLat(coords as [number, number])
      .setDOMContent(content(feature.properties as T, coords))
      .addTo(map);
  });
  map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
}

const LINE_LAYERS = ["view-zones", "streams-main", "streams-minor", "roads-casing", "roads", "lidar-coverage"];
// el velo de la zona descargada (lib/coverage-layer.ts): relieves y líneas quedan siempre debajo
const VEIL = "coverage-veil";
const POINT_LAYERS = ["lidar-candidates", "lidar-findings", "waterfalls", "viewpoints", "camps"];

/**
 * Dónde insertar relieves y líneas para que, sin importar el orden en que se prendan, queden debajo del
 * trazo de la ruta (o de las etiquetas) y del velo de la zona, y los relieves debajo de las líneas. Los puntos van encima de todo.
 */
export function overlayAnchor(map: maplibregl.Map, kind: "raster" | "lines") {
  const above = new Set([VEIL, ...(kind === "raster" ? LINE_LAYERS : []), ...POINT_LAYERS]);
  const hasTrack = !!map.getLayer("track-casing");
  return map.getStyle().layers?.find((l) => above.has(l.id) || (hasTrack ? l.id === "track-casing" : l.type === "symbol"))?.id;
}

// los zooms que guarda la descarga (LIDAR_ZOOMS en lib/offline.ts)
const SAVED_ZOOMS = { minzoom: 9, maxzoom: 15 };

async function addLayers(map: maplibregl.Map, saved: boolean): Promise<Manifest> {
  const manifest: Manifest = await fetch(`${BASE}/capa.json`).then((r) => r.json());
  registerPmtiles();
  manifest.partes.forEach((file, i) => {
    const id = `lidar-relief-${i}`;
    // descargado: las teselas que guardó lib/offline.ts, que public/sw.js sirve con y sin red
    const tiles = saved ? { tiles: [`${BASE}/${file.replace(/\.pmtiles$/, "")}/{z}/{x}/{y}`], ...SAVED_ZOOMS } : { url: `pmtiles://${BASE}/${file}` };
    map.addSource(id, { type: "raster", ...tiles, tileSize: 256, attribution: ATTRIBUTION });
    map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.85, "raster-fade-duration": 150 } }, overlayAnchor(map, "raster"));
  });
  map.addSource("lidar-coverage", { type: "geojson", data: `${BASE}/cobertura.geojson` });
  map.addLayer(
    { id: "lidar-coverage", type: "line", source: "lidar-coverage", paint: { "line-color": "#1d3557", "line-width": 1.5, "line-dasharray": [3, 2] } },
    overlayAnchor(map, "lines"),
  );
  map.addSource("lidar-candidates", { type: "geojson", data: `${BASE}/candidatos.geojson` });
  map.addLayer({
    id: "lidar-candidates",
    type: "circle",
    source: "lidar-candidates",
    minzoom: 10,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 6],
      "circle-color": CANDIDATE_COLOR,
      "circle-opacity": 0.85,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });
  map.addSource("lidar-findings", { type: "geojson", data: `${BASE}/hallazgos.geojson` });
  map.addLayer({
    id: "lidar-findings",
    type: "circle",
    source: "lidar-findings",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
      "circle-color": [
        "match",
        ["get", "tipo"],
        "monticulo", FINDING_COLORS.monticulo,
        "crater", FINDING_COLORS.crater,
        "terrazas", FINDING_COLORS.terrazas,
        FINDING_COLORS.cantera,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  onClickShow(map, "lidar-findings", findingPopup);
  onClickShow(map, "lidar-candidates", candidatePopup);
  return manifest;
}

/**
 * Prende o apaga el relieve LiDAR con sus hallazgos. Llamar después del evento "load".
 * Resuelve con los límites de la zona analizada (la primera vez hay que pedir el manifiesto).
 * `saved`: el relieve se lee de las teselas descargadas con la ruta y no del PMTiles del bucket (se fija al crearlo).
 */
export async function setLidar(map: maplibregl.Map, visible: boolean, saved = false): Promise<maplibregl.LngLatBounds | null> {
  let pending = loading.get(map);
  if (!pending) {
    if (!visible) return null;
    pending = addLayers(map, saved);
    loading.set(map, pending);
    pending.catch(() => loading.delete(map));
  }
  const manifest = await pending;
  const layers = [...manifest.partes.map((_, i) => `lidar-relief-${i}`), ...OVERLAYS];
  layers.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
  const [w, s, e, n] = manifest.bounds;
  return new maplibregl.LngLatBounds([w, s], [e, n]);
}

const WATERFALL_LAYERS = ["streams-main", "streams-minor", "waterfalls"];
const waterfallsLoading = new WeakMap<maplibregl.Map, Promise<maplibregl.LngLatBounds>>();

async function addWaterfallLayers(map: maplibregl.Map) {
  const waterfalls: FeatureCollection<Point> = await fetch(`${BASE}/cascadas.geojson`).then((r) => r.json());
  const below = overlayAnchor(map, "lines");
  registerPmtiles();
  map.addSource("streams", { type: "vector", url: `pmtiles://${BASE}/cauces.pmtiles`, attribution: ATTRIBUTION });
  // ancho según el área que drena el cauce; los arroyos chicos solo de cerca
  const width = (k: number): maplibregl.ExpressionSpecification => [
    "interpolate", ["linear"], ["get", "cuenca_km2"],
    2, 1 * k,
    50, 2 * k,
    500, 3.5 * k,
  ];
  const paint = {
    "line-color": STREAM_COLOR,
    "line-opacity": 0.9,
    "line-width": ["interpolate", ["linear"], ["zoom"], 9, width(0.6), 15, width(2)] as maplibregl.ExpressionSpecification,
  };
  const layout = { "line-cap": "round", "line-join": "round" } as const;
  map.addLayer({ id: "streams-main", type: "line", source: "streams", "source-layer": "cauces", filter: [">=", ["get", "cuenca_km2"], 10], layout, paint }, below);
  map.addLayer({ id: "streams-minor", type: "line", source: "streams", "source-layer": "cauces", minzoom: 11, filter: ["<", ["get", "cuenca_km2"], 10], layout, paint }, below);
  map.addSource("waterfalls", { type: "geojson", data: waterfalls });
  map.addLayer({
    id: "waterfalls",
    type: "circle",
    source: "waterfalls",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
      "circle-color": WATERFALL_COLOR,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  onClickShow(map, "waterfalls", waterfallPopup);
  const bounds = new maplibregl.LngLatBounds();
  waterfalls.features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
  return bounds;
}

/** Prende o apaga los cauces y las posibles cascadas. Resuelve con el área donde están las cascadas. */
export async function setWaterfalls(map: maplibregl.Map, visible: boolean): Promise<maplibregl.LngLatBounds | null> {
  let pending = waterfallsLoading.get(map);
  if (!pending) {
    if (!visible) return null;
    pending = addWaterfallLayers(map);
    waterfallsLoading.set(map, pending);
    pending.catch(() => waterfallsLoading.delete(map));
  }
  const bounds = await pending;
  WATERFALL_LAYERS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
  return bounds;
}
