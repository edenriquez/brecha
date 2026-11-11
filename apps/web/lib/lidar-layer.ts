"use client";

import type { FeatureCollection, Point } from "geojson";
import { Protocol } from "pmtiles";
import { maplibregl } from "@/lib/maplibre";

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/capas/lidar-izta`;
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

function popupContent(lines: [className: string, text: string][]) {
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

function onClickShow<T>(map: maplibregl.Map, layer: string, content: (props: T, coords: number[]) => HTMLElement) {
  map.on("click", layer, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const coords = (feature.geometry as Point).coordinates;
    new maplibregl.Popup({ maxWidth: "280px" })
      .setLngLat(coords as [number, number])
      .setDOMContent(content(feature.properties as T, coords))
      .addTo(map);
  });
  map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
}

/** Las capas de datos van justo debajo del trazo de la ruta o, sin trazo, de la primera etiqueta. */
function overlayAnchor(map: maplibregl.Map) {
  return map.getLayer("track-casing") ? "track-casing" : map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

async function addLayers(map: maplibregl.Map): Promise<Manifest> {
  const manifest: Manifest = await fetch(`${BASE}/capa.json`).then((r) => r.json());
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  // el relieve va debajo de los cauces (si ya se prendieron), del trazo de la ruta y de las etiquetas
  const below = overlayAnchor(map);
  manifest.partes.forEach((file, i) => {
    const id = `lidar-relief-${i}`;
    map.addSource(id, { type: "raster", url: `pmtiles://${BASE}/${file}`, tileSize: 256, attribution: ATTRIBUTION });
    map.addLayer(
      { id, type: "raster", source: id, paint: { "raster-opacity": 0.85, "raster-fade-duration": 150 } },
      map.getLayer("streams-main") ? "streams-main" : below,
    );
  });
  map.addSource("lidar-coverage", { type: "geojson", data: `${BASE}/cobertura.geojson` });
  map.addLayer(
    { id: "lidar-coverage", type: "line", source: "lidar-coverage", paint: { "line-color": "#1d3557", "line-width": 1.5, "line-dasharray": [3, 2] } },
    below,
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
 */
export async function setLidar(map: maplibregl.Map, visible: boolean): Promise<maplibregl.LngLatBounds | null> {
  let pending = loading.get(map);
  if (!pending) {
    if (!visible) return null;
    pending = addLayers(map);
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
  const below = overlayAnchor(map);
  map.addSource("streams", { type: "geojson", data: `${BASE}/cauces.geojson`, attribution: ATTRIBUTION });
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
  map.addLayer({ id: "streams-main", type: "line", source: "streams", filter: [">=", ["get", "cuenca_km2"], 10], layout, paint }, below);
  map.addLayer({ id: "streams-minor", type: "line", source: "streams", minzoom: 11, filter: ["<", ["get", "cuenca_km2"], 10], layout, paint }, below);
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
