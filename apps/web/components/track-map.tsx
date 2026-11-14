"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OpenMapLink } from "@/components/open-map-link";
import { lineKm, notices, NOTICE, sliceLine, TRACTION, tractionSegments, type RouteAnnotation } from "@/lib/annotations";
import { addHillshade, addTopoLayers, collapseAttribution, lineBounds, MAP_STYLE, maplibregl, setTerrain3d, setTrack, setTrackDone, setTraction, TERRAIN_3D_PITCH, type LineCoords } from "@/lib/maplibre";
import { OFFLINE_ZOOM, offlineBounds } from "@/lib/offline";

const LABEL = "flex items-center gap-2 rounded-full border border-outline-variant/80 bg-surface-container-lowest/95 px-2.5 py-1.5 shadow-md";

function labelMarker(text: string, dot: string) {
  const el = document.createElement("div");
  el.className = LABEL;
  el.innerHTML = `<span class="size-3 rounded-full border-2 border-white ${dot}"></span><span class="font-headline text-xs font-bold">${text}</span>`;
  return el;
}

/** Pin redondo con el número del aviso, o etiqueta "4H"/"4L" a media altura de su tramo. */
function badge(text: string, color: string, title: string, round: boolean) {
  const el = document.createElement("div");
  el.className = round
    ? "flex size-6 items-center justify-center rounded-full border-2 border-white font-headline text-[11px] font-bold text-white shadow-md"
    : "rounded-md border-2 border-white px-1 font-mono text-[10px] leading-4 font-bold text-white shadow-md";
  el.style.background = color;
  el.title = title;
  el.textContent = text;
  return el;
}

/** Tracción pintada sobre el trazo y avisos numerados; devuelve los marcadores para quitarlos al redibujar. */
function drawAnnotations(map: maplibregl.Map, line: LineCoords, annotations: RouteAnnotation[]) {
  const km = lineKm(line);
  const segments = tractionSegments(annotations, km[km.length - 1]).filter((s) => s.traction && s.to > s.from);
  setTraction(map, segments.map((s) => ({ line: sliceLine(line, km, s.from, s.to), color: TRACTION[s.traction!].color })));
  const markers = segments
    .filter((s) => s.traction !== "normal")
    .map((s) => {
      const t = TRACTION[s.traction!];
      const mid = sliceLine(line, km, (s.from + s.to) / 2, (s.from + s.to) / 2)[0];
      return new maplibregl.Marker({ element: badge(t.label, t.color, `Tracción ${t.label}`, false) }).setLngLat(mid);
    });
  notices(annotations).forEach((a, i) => {
    const kind = NOTICE[a.kind as keyof typeof NOTICE];
    markers.push(new maplibregl.Marker({ element: badge(String(i + 1), kind.color, `${i + 1}. ${kind.label}`, true) }).setLngLat([a.lng, a.lat]));
  });
  markers.forEach((m) => m.addTo(map));
  return markers;
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
 * `done`: el tramo ya recorrido, en azul sobre el trazo.
 * `annotations`: tracción por tramos y avisos de quien subió la ruta. `onPick`: un clic en el mapa elige ese punto (editor de anotaciones).
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
  done = null,
  annotations,
  onPick,
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
  done?: LineCoords | null;
  annotations?: RouteAnnotation[];
  onPick?: (lngLat: [number, number]) => void;
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoaded = useRef(false);
  const hoverMarker = useRef<maplibregl.Marker | null>(null);
  const terrain3dRef = useRef(terrain3d);
  const doneRef = useRef(done);
  const annotationsRef = useRef(annotations);
  const annotationMarkers = useRef<maplibregl.Marker[]>([]);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
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
    map.on("click", (e) => {
      if (onPickRef.current) onPickRef.current([e.lngLat.lng, e.lngLat.lat]);
      else if (openHrefRef.current) router.push(openHrefRef.current);
    });
    if (onPickRef.current) map.getCanvas().style.cursor = "crosshair";
    else if (openHrefRef.current) map.getCanvas().style.cursor = "pointer";
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
      setTrackDone(map, doneRef.current ?? []);
      if (annotationsRef.current) annotationMarkers.current = drawAnnotations(map, line, annotationsRef.current);
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

  useEffect(() => {
    doneRef.current = done;
    const map = mapRef.current;
    if (map && styleLoaded.current) setTrackDone(map, done ?? []);
  }, [done]);

  useEffect(() => {
    annotationsRef.current = annotations;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    annotationMarkers.current.forEach((m) => m.remove());
    annotationMarkers.current = annotations ? drawAnnotations(map, line, annotations) : [];
  }, [annotations, line]);

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
