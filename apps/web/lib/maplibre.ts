"use client";

import type { FeatureCollection, LineString } from "geojson";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
