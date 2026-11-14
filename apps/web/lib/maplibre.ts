"use client";

import type { FeatureCollection, LineString } from "geojson";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mlcontour from "maplibre-contour";
import { DEM_TILES } from "@/lib/dem";
import { MAP_STYLE, SATELLITE_TILES } from "@/lib/map-sources";

// Turbopack no empaqueta bien el worker inline de MapLibre; se sirve desde /public (scripts/copy-maplibre-worker.mjs).
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

export const HILLSHADE_EXAGGERATION = 0.35;

export { MAP_STYLE, maplibregl };

/** Sombreado del relieve debajo de las etiquetas. Llamar después del evento "load". */
export function addHillshade(map: maplibregl.Map) {
  map.addSource("dem", { type: "raster-dem", tiles: [DEM_TILES], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: "Elevación: Mapzen, AWS Terrain Tiles" });
  const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": HILLSHADE_EXAGGERATION, "hillshade-shadow-color": "#5b5b52", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#8a8a7a" } },
    firstLabel,
  );
}

const NAME: maplibregl.ExpressionSpecification = ["coalesce", ["get", "name:es"], ["get", "name"]];
const RANK: maplibregl.ExpressionSpecification = ["coalesce", ["get", "rank"], 99];
const HIKING_POIS = ["alpine_hut", "wilderness_hut", "shelter", "viewpoint", "camp_site", "picnic_site", "attraction", "waterfall", "cave_entrance", "spring"];
// hasta z11 solo el principal de cada zona, hasta z13 los tres primeros
const PEAKS: maplibregl.ExpressionSpecification = ["all", ["has", "name"], ["in", ["get", "class"], ["literal", ["peak", "volcano"]]], ["step", ["zoom"], ["==", RANK, 1], 12, ["<=", RANK, 3], 14, true]];
const CONTOUR_BROWN = "#6f4e37";

// curvas de nivel generadas del mismo modelo de elevación que el sombreado
const contourTiles = new Map<boolean, string>();
// sin worker el modelo de elevación se pide desde la página y el service worker lo sirve sin red;
// maplibre-contour le da a cada fuente su propio protocolo, así conviven las dos
function contourUrl(worker: boolean) {
  let url = contourTiles.get(worker);
  if (!url) {
    const dem = new mlcontour.DemSource({ url: DEM_TILES, encoding: "terrarium", maxzoom: 14, worker });
    dem.setupMaplibre(maplibregl);
    url = dem.contourProtocolUrl({ thresholds: { 11: [100, 500], 13: [50, 200], 14: [20, 100] } });
    contourTiles.set(worker, url);
  }
  return url;
}

/** Grupos de addTopoLayers que se prenden y apagan juntos; las veredas van con los nombres. */
const TOPO_GROUPS = {
  contours: ["contour-lines", "contour-labels"],
  names: ["trail-casing", "trail-paths", "trail-tracks", "park-names", "poi-names", "saddle-names", "peak-dots", "peak-names"],
};
export type TopoGroup = keyof typeof TOPO_GROUPS;

export function setTopoGroup(map: maplibregl.Map, group: TopoGroup, visible: boolean) {
  for (const id of TOPO_GROUPS[group]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

/**
 * Curvas de nivel, veredas y nombres de cerros, pasos, refugios y áreas protegidas. Llamar después de addHillshade.
 * `offline`: las curvas se calculan en la página para que funcionen sin red.
 */
export function addTopoLayers(map: maplibregl.Map, offline = false) {
  // encima del sombreado y del satélite, debajo de caminos, ruta y nombres
  const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addSource("contours", { type: "vector", tiles: [contourUrl(!offline)], minzoom: 11, maxzoom: 14 });
  const major: maplibregl.ExpressionSpecification = ["==", ["get", "level"], 1];
  map.addLayer({ id: "contour-lines", type: "line", source: "contours", "source-layer": "contours", paint: { "line-color": CONTOUR_BROWN, "line-opacity": ["case", major, 0.5, 0.3], "line-width": ["case", major, 1, 0.6] } }, firstLabel);
  const paths = (cls: string): maplibregl.ExpressionSpecification => ["==", ["get", "class"], cls];
  // halo blanco para que se lean sobre el satélite
  map.addLayer({ id: "trail-casing", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 12, filter: ["in", ["get", "class"], ["literal", ["path", "track"]]], paint: { "line-color": "#ffffff", "line-opacity": 0.5, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 16, 5.5] } }, firstLabel);
  map.addLayer({ id: "trail-paths", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 12, filter: paths("path"), paint: { "line-color": "#3a3a36", "line-dasharray": [1, 1.5], "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 2.5] } }, firstLabel);
  map.addLayer({ id: "trail-tracks", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 12, filter: paths("track"), paint: { "line-color": "#3a3a36", "line-dasharray": [3, 1.5], "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 16, 3.5] } }, firstLabel);
  map.addLayer(
    {
      id: "contour-labels",
      type: "symbol",
      source: "contours",
      "source-layer": "contours",
      filter: major,
      layout: { "symbol-placement": "line", "text-field": ["concat", ["number-format", ["get", "ele"], { locale: "en-US" }], " m"], "text-font": ["Noto Sans Regular"], "text-size": 10 },
      paint: { "text-color": CONTOUR_BROWN, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    },
    firstLabel,
  );

  // debajo de pueblos y ciudades: en la colisión ganan ellos
  const firstPlace = map.getStyle().layers?.find((l) => "source-layer" in l && l["source-layer"] === "place")?.id;
  const label = (
    id: string,
    sourceLayer: string,
    minzoom: number,
    filter: maplibregl.ExpressionSpecification,
    font: maplibregl.DataDrivenPropertyValueSpecification<string[]>,
    size: number,
    color = "#1c1c18",
    layout: maplibregl.SymbolLayerSpecification["layout"] = {},
  ) =>
    map.addLayer(
      {
        id,
        type: "symbol",
        source: "openmaptiles",
        "source-layer": sourceLayer,
        minzoom,
        filter: ["all", ["has", "name"], filter],
        layout: { "text-field": NAME, "text-font": font, "text-size": size, "symbol-sort-key": RANK, "text-max-width": 8, ...layout },
        paint: { "text-color": color, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      firstPlace,
    );
  label("park-names", "park", 9, ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "class"], ["literal", ["national_park", "nature_reserve"]]]], ["Noto Sans Italic"], 12, "#2f5d3a");
  label("poi-names", "poi", 13, ["in", ["get", "subclass"], ["literal", HIKING_POIS]], ["Noto Sans Regular"], 11);
  label("saddle-names", "mountain_peak", 12, ["==", ["get", "class"], "saddle"], ["Noto Sans Italic"], 11);
  map.addLayer({ id: "peak-dots", type: "circle", source: "openmaptiles", "source-layer": "mountain_peak", minzoom: 9, filter: PEAKS, paint: { "circle-radius": 2.5, "circle-color": "#1c1c18", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } }, firstPlace);
  // el nombre debajo del punto; la altitud desde z11
  label("peak-names", "mountain_peak", 9, PEAKS, ["match", ["get", "class"], "volcano", ["literal", ["Noto Sans Bold"]], ["literal", ["Noto Sans Regular"]]], 13, undefined, {
    "text-field": ["step", ["zoom"], NAME, 11, ["case", ["has", "ele"], ["concat", NAME, "\n", ["number-format", ["round", ["get", "ele"]], { locale: "en-US" }], " m"], NAME]],
    "text-anchor": "top",
    "text-offset": [0, 0.4],
  });
}

/** Foto satelital debajo de las etiquetas (vista híbrida); apaga el sombreado, que la oscurece. Llamar después de addHillshade. */
export function setSatellite(map: maplibregl.Map, visible: boolean) {
  if (!map.getSource("satellite")) {
    if (!visible) return;
    map.addSource("satellite", { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: "Imágenes: Esri, Maxar, Earthstar Geographics" });
    map.addLayer({ id: "satellite", type: "raster", source: "satellite" }, "hillshade");
  }
  map.setLayoutProperty("satellite", "visibility", visible ? "visible" : "none");
  map.setLayoutProperty("hillshade", "visibility", visible ? "none" : "visible");
}

export const SKY = { "sky-color": "#bcd6e6", "horizon-color": "#eef2ea", "fog-color": "#eef2ea", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.3 };

// el terreno lleva su propia fuente: compartir la del sombreado le baja la resolución
export const TERRAIN_SOURCE = "dem-terrain";

export function addTerrainSource(map: maplibregl.Map) {
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, { type: "raster-dem", tiles: [DEM_TILES], encoding: "terrarium", tileSize: 256, maxzoom: 14 });
}

export const TERRAIN_3D_PITCH = 60;
const TERRAIN_3D_EXAGGERATION = 1.5;

/** Relieve en 3D (la foto satelital se tiende encima); inclinar la cámara le toca a quien llama. */
export function setTerrain3d(map: maplibregl.Map, on: boolean) {
  if (!on) {
    map.setTerrain(null);
    return;
  }
  addTerrainSource(map);
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_3D_EXAGGERATION });
  map.setSky(SKY);
}

/** La atribución compacta arranca abierta y tapa el borde inferior del mapa: se deja en el botón (i). */
export function collapseAttribution(map: maplibregl.Map) {
  map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
}

export type LineCoords = [number, number][];

function lineData(line: LineCoords): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: line.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }] : [],
  };
}

/** Trazo de una ruta (naranja con borde oscuro) debajo de las etiquetas; con `line` vacío se borra. */
export function setTrack(map: maplibregl.Map, line: LineCoords) {
  const data = lineData(line);
  const source = map.getSource<maplibregl.GeoJSONSource>("track");
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource("track", { type: "geojson", data });
  // encima de las altitudes de las curvas
  const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol" && l.source !== "contours")?.id;
  const layout = { "line-cap": "round", "line-join": "round" } as const;
  const width = ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 5] as maplibregl.ExpressionSpecification;
  map.addLayer({ id: "track-casing", type: "line", source: "track", layout, paint: { "line-color": "#a53c00", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 8] } }, firstLabel);
  map.addLayer({ id: "track-line", type: "line", source: "track", layout, paint: { "line-color": "#ff7a3d", "line-width": width } }, firstLabel);
  // tramos por tracción con borde blanco; los llena setTraction
  map.addSource("track-traction", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "track-traction-casing", type: "line", source: "track-traction", layout, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 8] } }, firstLabel);
  map.addLayer({ id: "track-traction", type: "line", source: "track-traction", layout, paint: { "line-color": ["get", "color"], "line-width": width } }, firstLabel);
  // el tramo recorrido, del azul de tu ubicación; lo llena setTrackDone
  map.addSource("track-done", { type: "geojson", data: lineData([]) });
  map.addLayer({ id: "track-done", type: "line", source: "track-done", layout, paint: { "line-color": "#1da1f2", "line-width": width } }, firstLabel);
}

/** Tramo ya recorrido encima del trazo; con `line` vacío se borra. Va después de setTrack. */
export function setTrackDone(map: maplibregl.Map, line: LineCoords) {
  map.getSource<maplibregl.GeoJSONSource>("track-done")?.setData(lineData(line));
}

/** Tramos de color sobre el trazo; con `segments` vacío se borra. Va después de setTrack. */
export function setTraction(map: maplibregl.Map, segments: { line: LineCoords; color: string }[]) {
  map.getSource<maplibregl.GeoJSONSource>("track-traction")?.setData({
    type: "FeatureCollection",
    features: segments.map((s) => ({ type: "Feature", properties: { color: s.color }, geometry: { type: "LineString", coordinates: s.line } })),
  });
}

export function lineBounds(line: LineCoords) {
  return line.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(line[0], line[0]));
}
