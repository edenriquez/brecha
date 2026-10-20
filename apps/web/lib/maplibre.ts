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
