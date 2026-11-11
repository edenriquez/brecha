"use client";

import { useEffect, useRef } from "react";
import { addHillshade, collapseAttribution, lineBounds, MAP_STYLE, maplibregl, setSatellite, setTerrain3d, setTrack, TERRAIN_3D_PITCH, type LineCoords } from "@/lib/maplibre";
import { OFFLINE_ZOOM, offlineBounds } from "@/lib/offline";

const LABEL = "flex items-center gap-2 rounded-full border border-outline-variant/80 bg-surface-container-lowest/95 px-2.5 py-1.5 shadow-md";

function labelMarker(text: string, dot: string) {
  const el = document.createElement("div");
  el.className = LABEL;
  el.innerHTML = `<span class="size-3 rounded-full border-2 border-white ${dot}"></span><span class="font-headline text-xs font-bold">${text}</span>`;
  return el;
}

/**
 * Mapa con el trazo de la ruta; `hover` es el punto que se señala desde el perfil de altitud.
 * `offline`: visor a pantalla completa de una ruta descargada, en satélite, con GPS y sin salir de la zona guardada.
 */
export function TrackMap({ line, hover, offline = false, terrain3d = false }: { line: LineCoords; hover: [number, number] | null; offline?: boolean; terrain3d?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoaded = useRef(false);
  const hoverMarker = useRef<maplibregl.Marker | null>(null);
  const terrain3dRef = useRef(terrain3d);

  useEffect(() => {
    if (!container.current || line.length < 2) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      bounds: lineBounds(line),
      fitBoundsOptions: { padding: 48 },
      cooperativeGestures: !offline,
      attributionControl: { compact: true },
      ...(offline && { maxBounds: offlineBounds(line), minZoom: OFFLINE_ZOOM.min, maxZoom: OFFLINE_ZOOM.max }),
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: offline }), "bottom-right");
    if (offline) {
      map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, fitBoundsOptions: { maxZoom: 15 } }), "bottom-right");
    }
    map.once("load", () => {
      addHillshade(map);
      setTrack(map, line);
      if (offline) setSatellite(map, true);
      setTerrain3d(map, terrain3dRef.current);
      if (terrain3dRef.current) map.easeTo({ pitch: TERRAIN_3D_PITCH, duration: 1000 });
      collapseAttribution(map);
      styleLoaded.current = true;
    });

    const start = line[0];
    const end = line[line.length - 1];
    const closes = new maplibregl.LngLat(...start).distanceTo(new maplibregl.LngLat(...end)) < 200;
    if (!closes) new maplibregl.Marker({ element: labelMarker("Fin", "bg-secondary"), anchor: "bottom" }).setLngLat(end).addTo(map);
    new maplibregl.Marker({ element: labelMarker(closes ? "Inicio y fin" : "Inicio", "bg-primary"), anchor: "bottom" }).setLngLat(start).addTo(map);

    const dot = document.createElement("div");
    dot.className = "size-4 rounded-full border-[3px] border-white bg-secondary shadow-md";
    dot.style.display = "none";
    hoverMarker.current = new maplibregl.Marker({ element: dot }).setLngLat(start).addTo(map);
    mapRef.current = map;

    return () => {
      hoverMarker.current = null;
      mapRef.current = null;
      styleLoaded.current = false;
      map.remove();
    };
  }, [line, offline]);

  useEffect(() => {
    terrain3dRef.current = terrain3d;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    setTerrain3d(map, terrain3d);
    map.easeTo(terrain3d ? { pitch: TERRAIN_3D_PITCH, duration: 1000 } : { pitch: 0, bearing: 0, duration: 700 });
  }, [terrain3d]);

  useEffect(() => {
    const marker = hoverMarker.current;
    if (!marker) return;
    marker.getElement().style.display = hover ? "" : "none";
    if (hover) marker.setLngLat(hover);
  }, [hover]);

  // maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
