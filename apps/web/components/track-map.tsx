"use client";

import { useEffect, useRef } from "react";
import { addHillshade, collapseAttribution, lineBounds, MAP_STYLE, maplibregl, setTrack, type LineCoords } from "@/lib/maplibre";

const LABEL = "flex items-center gap-2 rounded-full border border-outline-variant/80 bg-surface-container-lowest/95 px-2.5 py-1.5 shadow-md";

function labelMarker(text: string, dot: string) {
  const el = document.createElement("div");
  el.className = LABEL;
  el.innerHTML = `<span class="size-3 rounded-full border-2 border-white ${dot}"></span><span class="font-headline text-xs font-bold">${text}</span>`;
  return el;
}

/** Mapa con el trazo de la ruta; `hover` es el punto que se señala desde el perfil de altitud. */
export function TrackMap({ line, hover }: { line: LineCoords; hover: [number, number] | null }) {
  const container = useRef<HTMLDivElement>(null);
  const hoverMarker = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!container.current || line.length < 2) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      bounds: lineBounds(line),
      fitBoundsOptions: { padding: 48 },
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.once("load", () => {
      addHillshade(map);
      setTrack(map, line);
      collapseAttribution(map);
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

    return () => {
      hoverMarker.current = null;
      map.remove();
    };
  }, [line]);

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
