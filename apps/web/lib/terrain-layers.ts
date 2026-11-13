"use client";

import type { FeatureCollection, Point } from "geojson";
import { PMTiles } from "pmtiles";
import { BASE, onClickShow, overlayAnchor, popupContent, registerPmtiles } from "@/lib/lidar-layer";
import { maplibregl } from "@/lib/maplibre";

export const VIEWPOINT_COLOR = "#c2185b";
export const VIEW_ZONE_COLORS = { ambos: "#9d4edd", izta: "#4895ef", popo: "#f4a261" } as const;
export const CAMP_COLORS = { sugerido: "#40916c", autorizado: "#ffb703" } as const;
export const ROAD_COLORS = { terraceria: "#d4a373", brecha: "#9c6644", vereda: "#6f4e37" } as const;
export const ROAD_LABELS: Record<keyof typeof ROAD_COLORS, string> = { terraceria: "Terracería", brecha: "Brecha", vereda: "Vereda" };

const RELIEF_SOURCE = "Modelo de 5 m de INEGI";
const ROADS_ATTRIBUTION = "Caminos: © colaboradores de OpenStreetMap (ODbL) · INEGI, Red Nacional de Caminos 2024";

type Viewpoint = {
  altitud: number;
  ve_izta: boolean;
  ve_popo: boolean;
  dist_izta_km: number;
  dist_popo_km: number;
  vista_km2: number;
  nombre: string | null;
  acceso_m: number;
  fuente: "lidar" | "satelite";
  aviso: string | null;
};
type Camp = {
  tipo: keyof typeof CAMP_COLORS;
  nombre: string | null;
  area_m2: number | null;
  pendiente: number;
  altitud: number;
  cobertura: "pastizal" | "matorral" | "bosque" | "claro" | "suelo desnudo" | null;
  agua_m: number | null;
  anp: string | null;
  aviso: string | null;
};
type Road = { tipo: keyof typeof ROAD_COLORS; origen: "osm" | "inegi"; largo_m: number; pendiente_media: number; pendiente_max: number };

const num = (n: number) => n.toLocaleString("es-MX");
const where = ([lng, lat]: number[]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const relief = (fuente: "lidar" | "satelite") => `${RELIEF_SOURCE} (${fuente === "lidar" ? "LiDAR de 2007" : "satélite"})`;

function viewpointPopup(v: Viewpoint, coords: number[]) {
  const volcanoes = [v.ve_izta && `el Iztaccíhuatl (${num(v.dist_izta_km)} km)`, v.ve_popo && `el Popocatépetl (${num(v.dist_popo_km)} km)`].filter(Boolean);
  return popupContent([
    ["font-headline text-sm font-bold", `${v.nombre ?? "Mirador"} · ${num(v.altitud)} m`],
    ["", `Desde aquí se ${volcanoes.length > 1 ? "ven" : "ve"} ${volcanoes.join(" y ")}, con unos ${num(v.vista_km2)} km² de paisaje a la vista.`],
    ["", v.acceso_m < 50 ? "Hay un camino junto al punto." : `El camino más cercano está a unos ${num(Math.round(v.acceso_m / 10) * 10)} m en línea recta.`],
    ...(v.aviso ? [["font-semibold", `${v.aviso}.`] as [string, string]] : []),
    ["text-on-surface-variant", "Calculado con el relieve, sin árboles ni bruma: los volcanes se ven mejor en mañanas despejadas, de noviembre a febrero."],
    ["pt-1 text-[11px] text-on-surface-variant", `${relief(v.fuente)} · ${where(coords)}`],
  ]);
}

const COVER: Record<NonNullable<Camp["cobertura"]>, string> = {
  pastizal: "pastizal",
  matorral: "matorral",
  bosque: "bosque",
  claro: "un claro del bosque",
  "suelo desnudo": "suelo desnudo",
};

function campPopup(c: Camp, coords: number[]) {
  const warning: [string, string][] = c.aviso
    ? [["font-semibold", `${c.aviso}.${c.aviso.includes("Popocatépetl") ? " Consulta el semáforo volcánico de CENAPRED antes de ir." : ""}`]]
    : [];
  if (c.tipo === "autorizado") {
    return popupContent([
      ["font-headline text-sm font-bold", `${c.nombre} · ${num(c.altitud)} m`],
      ["", "Zona de uso público o refugio del parque. Regístrate y paga tu brazalete en Paso de Cortés o Amecameca."],
      ...warning,
      ["pt-1 text-[11px] text-on-surface-variant", `CONANP y OpenStreetMap · ${where(coords)}`],
    ]);
  }
  return popupContent([
    ["font-headline text-sm font-bold", "Posible zona para acampar"],
    ["", `Terreno plano (unos ${c.pendiente}°, ${num(c.area_m2 ?? 0)} m²)${c.cobertura ? ` en ${COVER[c.cobertura]}` : ""}, a ${num(c.altitud)} m.`],
    ...(c.agua_m ? [["", `Cauce de temporada a unos ${num(c.agua_m)} m; puede estar seco.`] as [string, string]] : []),
    ...(c.anp
      ? [["font-semibold", `Dentro del ${c.anp}: solo se puede acampar donde lo autorice su programa de manejo. Consulta a la CONANP antes de ir.`] as [string, string]]
      : []),
    ...warning,
    ["text-on-surface-variant", "Es una sugerencia automática a partir del relieve: verifica el lugar, el acceso y el permiso del dueño o del ejido."],
    ["pt-1 text-[11px] text-on-surface-variant", `${RELIEF_SOURCE} · ${where(coords)}`],
  ]);
}

const ROAD_NOTES: Record<keyof typeof ROAD_COLORS, string> = {
  terraceria: "Camino sin pavimentar, de grava o tierra compactada.",
  brecha: "Camino de tierra sin revestir: en temporada de lluvias puede volverse intransitable.",
  vereda: "Sendero sin pavimentar.",
};

function roadPopup(r: Road) {
  return popupContent([
    ["font-headline text-sm font-bold", `${ROAD_LABELS[r.tipo]} · ${num(Math.round(r.largo_m / 100) / 10)} km`],
    ["", `Pendiente media de ${r.pendiente_media} %, con tramos de hasta ${r.pendiente_max} % en 100 m.`],
    ["", ROAD_NOTES[r.tipo]],
    ["text-on-surface-variant", "Verifica su estado antes de ir y respeta los terrenos ejidales."],
    ["pt-1 text-[11px] text-on-surface-variant", r.origen === "osm" ? "Datos: © colaboradores de OpenStreetMap" : "Datos: INEGI, Red Nacional de Caminos 2024"],
  ]);
}

async function load(file: string) {
  const data: FeatureCollection<Point> = await fetch(`${BASE}/${file}`).then((r) => r.json());
  const bounds = new maplibregl.LngLatBounds();
  data.features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
  return { data, bounds };
}

const pointPaint = (color: maplibregl.ExpressionSpecification | string, small = 4, big = 8) => ({
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, small, 14, big] as maplibregl.ExpressionSpecification,
  "circle-color": color,
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 2,
});

async function addViewpoints(map: maplibregl.Map) {
  const points = await load("miradores.geojson");
  registerPmtiles();
  map.addSource("view-zones", { type: "vector", url: `pmtiles://${BASE}/zonas_volcanes.pmtiles` });
  map.addLayer(
    {
      id: "view-zones",
      type: "fill",
      source: "view-zones",
      "source-layer": "zonas_volcanes",
      paint: {
        "fill-color": ["match", ["get", "volcan"], "ambos", VIEW_ZONE_COLORS.ambos, "izta", VIEW_ZONE_COLORS.izta, VIEW_ZONE_COLORS.popo],
        "fill-opacity": 0.14,
      },
    },
    overlayAnchor(map, "lines"),
  );
  map.addSource("viewpoints", { type: "geojson", data: points.data });
  map.addLayer({ id: "viewpoints", type: "circle", source: "viewpoints", paint: pointPaint(VIEWPOINT_COLOR) });
  onClickShow(map, "viewpoints", viewpointPopup);
  return points.bounds;
}

async function addCamps(map: maplibregl.Map) {
  const camps = await load("campamento.geojson");
  map.addSource("camps", { type: "geojson", data: camps.data });
  map.addLayer({
    id: "camps",
    type: "circle",
    source: "camps",
    // los autorizados encima y más grandes
    layout: { "circle-sort-key": ["match", ["get", "tipo"], "autorizado", 1, 0] },
    paint: {
      ...pointPaint(["match", ["get", "tipo"], "autorizado", CAMP_COLORS.autorizado, CAMP_COLORS.sugerido]),
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, ["match", ["get", "tipo"], "autorizado", 6, 3.5], 14, ["match", ["get", "tipo"], "autorizado", 10, 7]],
      "circle-stroke-color": ["match", ["get", "tipo"], "autorizado", "#1b4332", "#ffffff"],
    },
  });
  onClickShow(map, "camps", campPopup);
  return camps.bounds;
}

async function addRoads(map: maplibregl.Map) {
  const url = `${BASE}/brechas.pmtiles`;
  // el área sale del encabezado del PMTiles, sin bajar los caminos
  const { minLon, minLat, maxLon, maxLat } = await new PMTiles(url).getHeader();
  registerPmtiles();
  map.addSource("roads", { type: "vector", url: `pmtiles://${url}`, attribution: ROADS_ATTRIBUTION });
  const width = (terraceria: number, brecha: number, vereda: number): maplibregl.ExpressionSpecification => [
    "match", ["get", "tipo"],
    "terraceria", terraceria,
    "brecha", brecha,
    vereda,
  ];
  const layout = { "line-cap": "round", "line-join": "round" } as const;
  const below = overlayAnchor(map, "lines");
  // un borde claro para que se distingan sobre el relieve oscuro y el satélite
  map.addLayer(
    {
      id: "roads-casing",
      type: "line",
      source: "roads",
      "source-layer": "brechas",
      layout,
      paint: {
        "line-color": "#fffaf0",
        "line-opacity": 0.7,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, width(1.6, 1.4, 1), 15, width(6, 5, 3.5)],
      },
    },
    below,
  );
  map.addLayer(
    {
      id: "roads",
      type: "line",
      source: "roads",
      "source-layer": "brechas",
      layout,
      paint: {
        "line-color": ["match", ["get", "tipo"], "terraceria", ROAD_COLORS.terraceria, "brecha", ROAD_COLORS.brecha, ROAD_COLORS.vereda],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, width(0.8, 0.7, 0.5), 15, width(3.5, 3, 1.8)],
      },
    },
    below,
  );
  onClickShow(map, "roads", roadPopup);
  return new maplibregl.LngLatBounds([minLon, minLat], [maxLon, maxLat]);
}

/** Prende o apaga un grupo de capas que se crean la primera vez; resuelve con el área que cubren. */
function toggler(layers: string[], add: (map: maplibregl.Map) => Promise<maplibregl.LngLatBounds>) {
  const loading = new WeakMap<maplibregl.Map, Promise<maplibregl.LngLatBounds>>();
  return async (map: maplibregl.Map, visible: boolean): Promise<maplibregl.LngLatBounds | null> => {
    let pending = loading.get(map);
    if (!pending) {
      if (!visible) return null;
      pending = add(map);
      loading.set(map, pending);
      pending.catch(() => loading.delete(map));
    }
    const bounds = await pending;
    layers.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
    return bounds;
  };
}

/** Miradores con vista a los dos volcanes y las zonas desde donde se ve cada uno. */
export const setViewpoints = toggler(["view-zones", "viewpoints"], addViewpoints);
/** Zonas sugeridas para acampar y sitios autorizados. */
export const setCamps = toggler(["camps"], addCamps);
/** Brechas, terracerías y veredas con su pendiente. */
export const setRoads = toggler(["roads-casing", "roads"], addRoads);
