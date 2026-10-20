"use client";

import { useEffect, useRef } from "react";
import { addHillshade, MAP_STYLE, maplibregl } from "@/lib/maplibre";
import { DIFFICULTY, formatKm, type RouteSummary } from "@/lib/routes";

const PILL = "flex items-center gap-1.5 rounded-full border py-1 px-2.5 font-headline text-xs font-bold shadow-sm transition-transform";
const PILL_IDLE = "border-outline-variant/80 bg-surface-container-lowest text-on-surface hover:scale-105";
const PILL_SELECTED = "scale-105 border-2 border-surface-container-lowest bg-primary text-on-primary shadow-lg ring-4 ring-primary/20";

function pillHtml(route: RouteSummary, selected: boolean) {
  const label = selected ? `${route.name} · ${formatKm(route.distance_km)}` : formatKm(route.distance_km);
  const dot = selected ? "bg-surface" : DIFFICULTY[route.difficulty].dot;
  const outings = route.upcoming_outings > 0
    ? `<span class="rounded-full bg-secondary-container px-1.5 text-[10px] text-on-surface">${route.upcoming_outings}</span>`
    : "";
  const name = document.createElement("span");
  name.textContent = label;
  return `<span class="size-2 rounded-full ${dot}"></span>${name.outerHTML}${outings}`;
}

function paintPill(el: HTMLElement, route: RouteSummary, selected: boolean) {
  el.className = `${PILL} ${selected ? PILL_SELECTED : PILL_IDLE}`;
  el.innerHTML = pillHtml(route, selected);
}

export function RouteMap({
  routes,
  selectedId,
  onSelect,
}: {
  routes: RouteSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLSpanElement; route: RouteSummary }>());
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    const bounds = new maplibregl.LngLatBounds();
    routes.forEach((r) => bounds.extend([r.lng, r.lat]));
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      ...(routes.length ? { bounds, fitBoundsOptions: { padding: 80, maxZoom: 11 } } : { center: [-99.13, 19.43], zoom: 8 }),
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.once("load", () => addHillshade(map));
    map.on("error", (e: { error?: { message?: string } }) => console.error("maplibre:", e.error?.message ?? e));

    const registry = markers.current;
    routes.forEach((route) => {
      // el className del botón es de maplibre (maplibregl-marker lo posiciona); el estilo va en el span
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", route.name);
      const el = document.createElement("span");
      paintPill(el, route, route.id === selectedRef.current);
      button.append(el);
      button.addEventListener("click", () => onSelectRef.current(route.id));
      const marker = new maplibregl.Marker({ element: button, anchor: "bottom" }).setLngLat([route.lng, route.lat]).addTo(map);
      registry.set(route.id, { marker, el, route });
    });
    mapRef.current = map;

    return () => {
      registry.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [routes]);

  useEffect(() => {
    selectedRef.current = selectedId;
    markers.current.forEach(({ el, route, marker }, id) => {
      const selected = id === selectedId;
      paintPill(el, route, selected);
      marker.getElement().style.zIndex = selected ? "10" : "";
      if (selected) {
        const map = mapRef.current;
        if (map && !map.getBounds().contains(marker.getLngLat())) map.easeTo({ center: marker.getLngLat(), duration: 600 });
      }
    });
  }, [selectedId]);

  // maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
