"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OpenMapLink } from "@/components/open-map-link";
import { addHillshade, addTopoLayers, collapseAttribution, lineBounds, MAP_STYLE, maplibregl, setTerrain3d, setTrack, TERRAIN_3D_PITCH, type LineCoords } from "@/lib/maplibre";
import { OFFLINE_ZOOM, offlineBounds } from "@/lib/offline";

const LABEL = "flex items-center gap-2 rounded-full border border-outline-variant/80 bg-surface-container-lowest/95 px-2.5 py-1.5 shadow-md";

function labelMarker(text: string, dot: string) {
  const el = document.createElement("div");
  el.className = LABEL;
  el.innerHTML = `<span class="size-3 rounded-full border-2 border-white ${dot}"></span><span class="font-headline text-xs font-bold">${text}</span>`;
  return el;
}

/** Inicio y fin a menos de 200 m: la ruta cierra. */
export function routeCloses(line: LineCoords) {
  return new maplibregl.LngLat(...line[0]).distanceTo(new maplibregl.LngLat(...line[line.length - 1])) < 200;
}

/**
 * Mapa con el trazo de la ruta; `hover` es el punto que se señala desde el perfil de altitud.
 * `offline`: visor a pantalla completa de una ruta descargada, con GPS y sin salir de la zona guardada; el mapa base y las capas los pone el visor.
 * `openHref`: un clic en el mapa (sin arrastrar) lleva ahí, al mapa completo.
 * `onPosition`: cada lectura del GPS del visor. `reversed`: de regreso, "Inicio" y "Fin" se intercambian.
 * `onReady`: el mapa ya cargado y cómo prender o apagar el GPS (solo `offline`, que no muestra controles propios).
 * `onTracking`: si el GPS sigue tu ubicación.
 */
export function TrackMap({
  line,
  hover,
  offline = false,
  terrain3d = false,
  openHref,
  onPosition,
  reversed = false,
  onReady,
  onTracking,
}: {
  line: LineCoords;
  hover: [number, number] | null;
  offline?: boolean;
  terrain3d?: boolean;
  openHref?: string;
  onPosition?: (lngLat: [number, number], accuracy: number) => void;
  reversed?: boolean;
  onReady?: (ready: { map: maplibregl.Map; locate: () => void } | null) => void;
  onTracking?: (on: boolean) => void;
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoaded = useRef(false);
  const hoverMarker = useRef<maplibregl.Marker | null>(null);
  const terrain3dRef = useRef(terrain3d);
  const openHrefRef = useRef(openHref);
  useEffect(() => {
    openHrefRef.current = openHref;
  }, [openHref]);
  const onPositionRef = useRef(onPosition);
  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);
  const reversedRef = useRef(reversed);
  const onReadyRef = useRef(onReady);
  const onTrackingRef = useRef(onTracking);
  useEffect(() => {
    onReadyRef.current = onReady;
    onTrackingRef.current = onTracking;
  }, [onReady, onTracking]);
  const labels = useRef<{ start: Element; end: Element } | null>(null);

  useEffect(() => {
    if (!container.current || line.length < 2) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      bounds: lineBounds(line),
      fitBoundsOptions: { padding: 48 },
      cooperativeGestures: !offline,
      // el visor sin conexión deja abajo su barra de avance
      attributionControl: offline ? false : { compact: true },
      ...(offline && { maxBounds: offlineBounds(line), minZoom: OFFLINE_ZOOM.min, maxZoom: OFFLINE_ZOOM.max }),
    });
    if (offline) map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
    else map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    // maplibre solo emite click si no hubo arrastre: mover el mapa no navega
    map.on("click", () => {
      if (openHrefRef.current) router.push(openHrefRef.current);
    });
    if (openHrefRef.current) map.getCanvas().style.cursor = "pointer";
    let geolocate: maplibregl.GeolocateControl | undefined;
    if (offline) {
      geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, fitBoundsOptions: { maxZoom: 15 } });
      // fuera de la zona guardada llega outofmaxbounds en vez de geolocate: también cuenta como lectura
      const report = (e: maplibregl.GeolocatePositionEvent) => onPositionRef.current?.([e.coords.longitude, e.coords.latitude], e.coords.accuracy);
      geolocate.on("geolocate", report);
      geolocate.on("outofmaxbounds", report);
      geolocate.on("trackuserlocationstart", () => onTrackingRef.current?.(true));
      geolocate.on("trackuserlocationend", () => onTrackingRef.current?.(false));
      // se conserva su lógica (seguimiento, punto azul) pero el botón es el del visor
      map.addControl(geolocate, "bottom-right");
      geolocate._container.style.display = "none";
    }
    map.once("load", () => {
      addHillshade(map);
      addTopoLayers(map, offline);
      setTrack(map, line);
      setTerrain3d(map, terrain3dRef.current);
      if (terrain3dRef.current) map.easeTo({ pitch: TERRAIN_3D_PITCH, duration: 1000 });
      collapseAttribution(map);
      styleLoaded.current = true;
      onReadyRef.current?.({ map, locate: () => geolocate?.trigger() });
    });

    const start = line[0];
    const end = line[line.length - 1];
    const closes = routeCloses(line);
    const endEl = labelMarker(reversedRef.current ? "Inicio" : "Fin", "bg-secondary");
    if (!closes) new maplibregl.Marker({ element: endEl, anchor: "bottom" }).setLngLat(end).addTo(map);
    const startEl = labelMarker(closes ? "Inicio y fin" : reversedRef.current ? "Fin" : "Inicio", "bg-primary");
    new maplibregl.Marker({ element: startEl, anchor: "bottom" }).setLngLat(start).addTo(map);
    if (!closes) labels.current = { start: startEl.lastElementChild!, end: endEl.lastElementChild! };

    const dot = document.createElement("div");
    dot.className = "size-4 rounded-full border-[3px] border-white bg-secondary shadow-md";
    dot.style.display = "none";
    hoverMarker.current = new maplibregl.Marker({ element: dot }).setLngLat(start).addTo(map);
    mapRef.current = map;

    return () => {
      hoverMarker.current = null;
      labels.current = null;
      mapRef.current = null;
      styleLoaded.current = false;
      onReadyRef.current?.(null);
      map.remove();
    };
  }, [line, offline, router]);

  useEffect(() => {
    terrain3dRef.current = terrain3d;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    setTerrain3d(map, terrain3d);
    map.easeTo(terrain3d ? { pitch: TERRAIN_3D_PITCH, duration: 1000 } : { pitch: 0, bearing: 0, duration: 700 });
  }, [terrain3d]);

  // solo cambia el texto: recrear el mapa perdería la vista
  useEffect(() => {
    reversedRef.current = reversed;
    if (!labels.current) return;
    labels.current.start.textContent = reversed ? "Fin" : "Inicio";
    labels.current.end.textContent = reversed ? "Inicio" : "Fin";
  }, [reversed]);

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
      {openHref && <OpenMapLink href={openHref} />}
    </div>
  );
}
