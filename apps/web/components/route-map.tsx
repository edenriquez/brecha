"use client";

import { useEffect, useRef } from "react";
import { addHillshade, collapseAttribution, lineBounds, MAP_STYLE, maplibregl, setTrack, type LineCoords } from "@/lib/maplibre";
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

function frame(
  map: maplibregl.Map,
  bounds: maplibregl.LngLatBounds,
  pending: { current: maplibregl.LngLatBounds | null },
  animate: boolean,
) {
  if (!map.getContainer().clientWidth) {
    pending.current = bounds;
    return;
  }
  pending.current = null;
  map.fitBounds(bounds, { padding: 80, maxZoom: 11, duration: animate ? 600 : 0 });
}

export function RouteMap({
  routes,
  selectedId,
  onSelect,
  track,
}: {
  routes: RouteSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Trazo de la ruta seleccionada, si tiene */
  track: LineCoords | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLSpanElement; route: RouteSummary }>());
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const framedKey = useRef<string | null>(null);
  const pendingFrame = useRef<maplibregl.LngLatBounds | null>(null);
  const styleLoaded = useRef(false);
  const trackRef = useRef(track);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: [-99.13, 19.43],
      zoom: 8,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.once("load", () => {
      addHillshade(map);
      setTrack(map, trackRef.current ?? []);
      collapseAttribution(map);
      styleLoaded.current = true;
    });
    map.on("error", (e: { error?: { message?: string } }) => console.error("maplibre:", e.error?.message ?? e));
    // en móvil el mapa vive oculto (0×0) mientras se ve la lista: se encuadra al mostrarse
    map.on("resize", () => {
      if (pendingFrame.current) frame(map, pendingFrame.current, pendingFrame, false);
    });
    mapRef.current = map;
    framedKey.current = null;

    const registry = markers.current;
    return () => {
      registry.clear();
      map.remove();
      mapRef.current = null;
      styleLoaded.current = false;
    };
  }, []);

  useEffect(() => {
    trackRef.current = track;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    setTrack(map, track ?? []);
    // al elegir una ruta con trazo se acerca a él; el mapa oculto (móvil, vista de lista) no se mueve
    if (track && map.getContainer().clientWidth) map.fitBounds(lineBounds(track), { padding: 80, maxZoom: 13.5, duration: 800 });
  }, [track]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const registry = markers.current;
    const ids = new Set(routes.map((r) => r.id));
    registry.forEach(({ marker }, id) => {
      if (ids.has(id)) return;
      marker.remove();
      registry.delete(id);
    });
    routes.forEach((route) => {
      if (registry.has(route.id)) return;
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

    const key = [...ids].sort().join();
    if (!routes.length || key === framedKey.current) return;
    const bounds = new maplibregl.LngLatBounds();
    routes.forEach((r) => bounds.extend([r.lng, r.lat]));
    frame(map, bounds, pendingFrame, framedKey.current !== null);
    framedKey.current = key;
  }, [routes]);

  useEffect(() => {
    selectedRef.current = selectedId;
    markers.current.forEach(({ el, route, marker }, id) => {
      const selected = id === selectedId;
      paintPill(el, route, selected);
      marker.getElement().style.zIndex = selected ? "10" : "";
      if (selected) {
        const map = mapRef.current;
        if (map?.getContainer().clientWidth && !map.getBounds().contains(marker.getLngLat())) {
          map.easeTo({ center: marker.getLngLat(), duration: 600 });
        }
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
