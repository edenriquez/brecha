"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack no empaqueta bien el worker inline de MapLibre; se sirve desde /public (scripts/copy-maplibre-worker.mjs).
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
// Modelo de elevación abierto (Terrarium de Mapzen/AWS, sin llave) para el sombreado del relieve
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
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
