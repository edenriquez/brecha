"use client";

import type { FeatureCollection, LineString } from "geojson";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEM_TILES } from "@/lib/dem";

// Turbopack no empaqueta bien el worker inline de MapLibre; se sirve desde /public (scripts/copy-maplibre-worker.mjs).
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
export { maplibregl };

/** Sombreado del relieve debajo de las etiquetas. Llamar después del evento "load". */
export function addHillshade(map: maplibregl.Map) {
  map.addSource("dem", { type: "raster-dem", tiles: [DEM_TILES], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: "Elevación: Mapzen, AWS Terrain Tiles" });
  const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5b5b52", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#8a8a7a" } },
    firstLabel,
  );
}

/** La atribución compacta arranca abierta y tapa el borde inferior del mapa: se deja en el botón (i). */
export function collapseAttribution(map: maplibregl.Map) {
  map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
}

export type LineCoords = [number, number][];

/** Trazo de una ruta (naranja con borde oscuro) debajo de las etiquetas; con `line` vacío se borra. */
export function setTrack(map: maplibregl.Map, line: LineCoords) {
  const data: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: line.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }] : [],
  };
  const source = map.getSource<maplibregl.GeoJSONSource>("track");
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource("track", { type: "geojson", data });
  const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  const layout = { "line-cap": "round", "line-join": "round" } as const;
  map.addLayer({ id: "track-casing", type: "line", source: "track", layout, paint: { "line-color": "#a53c00", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 8] } }, firstLabel);
  map.addLayer({ id: "track-line", type: "line", source: "track", layout, paint: { "line-color": "#ff7a3d", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 5] } }, firstLabel);
}

export function lineBounds(line: LineCoords) {
  return line.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(line[0], line[0]));
}
