// La zona descargada sobre el mapa del visor (mock 09): celdas guardadas, las parciales y un velo sobre lo demás.

import type { Feature, FeatureCollection, Polygon } from "geojson";
import { cellPolygon } from "@/lib/hex-grid";
import type { maplibregl } from "@/lib/maplibre";

type Bounds = [w: number, s: number, e: number, n: number];

const LINE = "#ffffff";
const PARTIAL = "#a53c00";
const VEIL = "#000000";
const SOURCES = ["coverage-veil", "coverage-cells", "coverage-partial"] as const;
const LAYERS = ["coverage-veil", "coverage-fill", "coverage-line", "coverage-partial"];

const feature = (coordinates: [number, number][][]): Feature<Polygon> => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } });
const collection = (features: Feature<Polygon>[]): FeatureCollection<Polygon> => ({ type: "FeatureCollection", features });

/**
 * GeoJSON de la zona: `cells` las celdas guardadas, `partial` las que se salen de `bounds` (la zona de las capas
 * regionales; null si el registro no guardó ninguna) y `veil`, un polígono del mundo con una perforación por celda.
 */
export function coverageGeoJson(cells: string[], bounds: Bounds | null) {
  const polygons = cells.map(cellPolygon);
  const outside = ([lng, lat]: [number, number]) => !!bounds && (lng < bounds[0] || lat < bounds[1] || lng > bounds[2] || lat > bounds[3]);
  // anillo exterior antihorario y huecos horarios (RFC 7946); cellPolygon da los hexágonos antihorarios
  const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return {
    cells: collection(polygons.map((p) => feature([p]))),
    partial: collection(polygons.filter((p) => p.some(outside)).map((p) => feature([p]))),
    veil: collection(cells.length ? [feature([world, ...polygons.map((p) => [...p].reverse())])] : []),
  };
}

/** Pinta la zona (o la quita con null) debajo del trazo de la ruta y de los nombres. Llamar después del evento "load". */
export function setCoverage(map: maplibregl.Map, zone: ReturnType<typeof coverageGeoJson> | null) {
  if (!zone) {
    LAYERS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", "none"));
    return;
  }
  const data = { "coverage-veil": zone.veil, "coverage-cells": zone.cells, "coverage-partial": zone.partial };
  if (map.getSource("coverage-cells")) {
    SOURCES.forEach((id) => map.getSource<maplibregl.GeoJSONSource>(id)?.setData(data[id]));
    LAYERS.forEach((id) => map.setLayoutProperty(id, "visibility", "visible"));
    return;
  }
  SOURCES.forEach((id) => map.addSource(id, { type: "geojson", data: data[id] }));
  const below = map.getStyle().layers?.find((l) => l.id === "track-casing" || l.type === "symbol")?.id;
  map.addLayer({ id: "coverage-veil", type: "fill", source: "coverage-veil", paint: { "fill-color": VEIL, "fill-opacity": 0.45 } }, below);
  map.addLayer({ id: "coverage-fill", type: "fill", source: "coverage-cells", paint: { "fill-color": LINE, "fill-opacity": 0.08 } }, below);
  map.addLayer({ id: "coverage-line", type: "line", source: "coverage-cells", paint: { "line-color": LINE, "line-opacity": 0.85, "line-width": 1.25 } }, below);
  map.addLayer(
    { id: "coverage-partial", type: "line", source: "coverage-partial", paint: { "line-color": PARTIAL, "line-width": 2, "line-dasharray": [2, 2] } },
    below,
  );
}
