"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Binoculars, MountainSnow, Rotate3d, Route, Satellite, Sun, Tent, Users, Waves } from "lucide-react";
import clsx from "clsx";
import { RouteMapPanel, type PanelView } from "@/components/route-map-panel";
import type { ProfilePoint } from "@/lib/gpx";
import { CANDIDATE_COLOR, FINDING_COLORS, FINDING_LABELS, STREAM_COLOR, WATERFALL_COLOR, setLidar, setWaterfalls } from "@/lib/lidar-layer";
import {
  addHillshade,
  addTopoLayers,
  collapseAttribution,
  lineBounds,
  MAP_STYLE,
  maplibregl,
  setSatellite,
  setTerrain3d,
  setTrack,
  TERRAIN_3D_PITCH,
  type LineCoords,
} from "@/lib/maplibre";
import type { Area } from "@/lib/route-filters";
import { RouteTour, type TourState } from "@/lib/route-tour";
import { DIFFICULTY, formatDuration, formatKm, outingsLabel, ROUTE_TYPE, type RouteSummary } from "@/lib/routes";
import { SunShade, type ShadeStatus } from "@/lib/sun-shade";
import { compassName, formatMinutes, mxDate, mxToday, sunPosition, sunTimes } from "@/lib/sun";
import { CAMP_COLORS, ROAD_COLORS, ROAD_LABELS, VIEWPOINT_COLOR, VIEW_ZONE_COLORS, setCamps, setRoads, setViewpoints } from "@/lib/terrain-layers";

// capas de datos que se crean al prenderlas por primera vez; cada una resuelve con el área que cubre
const OVERLAYS = { lidar: setLidar, waterfalls: setWaterfalls, viewpoints: setViewpoints, camps: setCamps, roads: setRoads };
type Overlay = keyof typeof OVERLAYS;
type Overlays = Record<Overlay, boolean>;
const LONG_PRESS_MS = 450;
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };
const NO_OVERLAYS: Overlays = { lidar: false, waterfalls: false, viewpoints: false, camps: false, roads: false };

/** Prende o apaga las capas que cambiaron desde la última vez y encuadra la que se acaba de prender. */
function applyOverlays(map: maplibregl.Map, wanted: Overlays, applied: { current: Overlays }, mapRef: { current: maplibregl.Map | null }) {
  (Object.keys(OVERLAYS) as Overlay[]).forEach((id) => {
    const on = wanted[id];
    if (on === applied.current[id]) return;
    OVERLAYS[id](map, on)
      .then((zone) => on && zone && mapRef.current === map && showZone(map, zone))
      .catch((e) => console.error(`capa ${id}:`, e));
  });
  applied.current = wanted;
}

// hora del panel de sombras: la de ahora si es de día, si no media mañana
function initialSunMinutes() {
  const now = new Date(Date.now() - 6 * 3_600_000);
  const minutes = Math.round((now.getUTCHours() * 60 + now.getUTCMinutes()) / 15) * 15;
  return minutes >= 7 * 60 && minutes <= 18 * 60 ? minutes : 9 * 60;
}

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

// Medidas tomadas de la ficha de referencia (160 de ancho) y llevadas a 256 px, ×1.6: 216 px para la foto,
// y en el bloque de datos el encabezado a 29 px del borde, el primer renglón a 74 y 22 px entre renglones
const CARD_W = 256;
const ICON = `class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
// trazos de lucide: regla, pendiente, reloj y huellas
const ICONS = {
  distance: `<svg ${ICON}><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>`,
  gain: `<svg ${ICON}><path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/></svg>`,
  duration: `<svg ${ICON}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  walk: `<svg ${ICON}><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>`,
};
// todo son <span>: la ficha vive dentro del <button> del pin
const row = (icon: string, label: string, value: string) =>
  `<span class="flex h-[22px] items-center gap-4">${icon}<span class="text-[11px] opacity-80">${label}</span><b class="ml-auto font-headline text-[13px] font-bold">${value}</b></span>`;

/**
 * Ficha de la ruta al pasar el cursor por su pin: arriba, vidrio esmerilado con la foto de fondo, translúcida y a
 * todo lo ancho (nombre y dificultad encima); abajo, un bloque sólido con distancia, desnivel y duración.
 * Vive dentro del botón del pin: pasar el cursor del pin a la ficha no la cierra, y un clic en ella (o en su botón
 * de reproducir) elige la ruta igual que el pin. En pantallas táctiles se abre al mantener presionado el pin
 * (`data-peek` en el botón) y se cierra al tocar fuera. La foto se pide hasta la primera vez que se muestra (`data-src`).
 */
function hoverCard(route: RouteSummary) {
  // el relleno vertical une la ficha con el pin: sin hueco, el cursor no la pierde al subir hacia ella;
  // solo recibe el cursor mientras se ve, para que no tape el mapa alrededor de cada pin
  const box = document.createElement("span");
  box.className = "pointer-events-none absolute bottom-full left-1/2 block -translate-x-1/2 py-2 text-left opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-data-[peek]:pointer-events-auto group-data-[peek]:opacity-100";
  box.style.width = `${CARD_W}px`;
  const cover = route.cover_url
    ? `<img alt="" data-src="/_next/image?url=${encodeURIComponent(route.cover_url)}&w=640&q=75" class="absolute inset-0 h-full w-full object-cover opacity-75" />`
    : `<svg viewBox="0 0 24 24" class="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/4 opacity-40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;
  const outings =
    route.upcoming_outings > 0
      ? `<span class="absolute top-[108px] right-4 flex items-center gap-1.5 text-[11px] font-medium [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]"><i class="size-1.5 rounded-full bg-secondary-container"></i>${outingsLabel(route.upcoming_outings)}</span>`
      : "";
  box.innerHTML = `
    <span data-card class="block origin-bottom scale-95 overflow-hidden bg-on-surface/25 text-white shadow-2xl ring-1 ring-white/40 backdrop-blur-xl transition-transform duration-200 group-hover:scale-100 group-data-[peek]:scale-100">
      <span class="relative block h-[216px]">
        ${cover}
        <span class="absolute inset-0 bg-gradient-to-b from-black/50 via-black/5 to-black/25"></span>
        <span data-name class="absolute inset-x-4 top-3.5 line-clamp-2 font-headline text-sm leading-[18px] font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]"></span>
        <span class="absolute top-[82px] left-4 flex items-center gap-1.5 rounded-full bg-white/15 py-0.5 pr-2.5 pl-2 text-[11px] font-medium [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]"><i class="size-2 rounded-full ${DIFFICULTY[route.difficulty].dot} ring-1 ring-white/70"></i>${DIFFICULTY[route.difficulty].label}</span>
        ${outings}
      </span>
      <span class="relative block h-[139px] bg-primary pt-[21px] pr-7 pl-5 font-body text-on-primary">
        <span class="absolute -top-5 left-1/2 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-primary ring-[3px] ring-white/80 transition-transform hover:scale-110" title="Recorrer en 3D"><svg viewBox="0 0 24 24" class="ml-0.5 size-4" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg></span>
        <span class="mb-[26px] flex h-4 items-center gap-1.5 text-[11px] font-medium opacity-90">${ICONS.walk}${ROUTE_TYPE[route.route_type]}</span>
        ${row(ICONS.distance, "Distancia", formatKm(route.distance_km))}
        ${row(ICONS.gain, "Desnivel", `↑ ${route.elevation_gain_m.toLocaleString("es-MX")} m`)}
        ${row(ICONS.duration, "Duración", formatDuration(route.duration_min))}
      </span>
    </span>`;
  // el nombre lo escribe quien sube la ruta: va como texto, no como HTML
  box.querySelector("[data-name]")!.textContent = route.name;
  return box;
}

/** Coloca la ficha donde quepa: arriba del pin o, si no hay lugar, abajo; y la recorre para que no se salga por los lados. */
function placeCard(card: HTMLElement, pin: HTMLElement, box: HTMLElement) {
  const img = card.querySelector<HTMLImageElement>("img[data-src]");
  if (img && !img.src) img.src = img.dataset.src!;
  const p = pin.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const below = p.top - b.top < card.offsetHeight + 8 && b.bottom - p.bottom > p.top - b.top;
  card.style.bottom = below ? "auto" : "";
  card.style.top = below ? "100%" : "";
  card.querySelector<HTMLElement>("[data-card]")!.style.transformOrigin = below ? "top" : "";
  const center = p.left + p.width / 2;
  const shift = Math.max(b.left + 8 - (center - CARD_W / 2), 0) + Math.min(b.right - 8 - (center + CARD_W / 2), 0);
  card.style.marginLeft = `${shift}px`;
}

function paintPill(el: HTMLElement, route: RouteSummary, selected: boolean) {
  el.className = `${PILL} ${selected ? PILL_SELECTED : PILL_IDLE}`;
  el.innerHTML = pillHtml(route, selected);
}

// a los lados cabe la etiqueta del pin elegido (va centrada en el inicio); arriba, el botón del recorrido
const TRACK_FRAME = { padding: { top: 90, bottom: 60, left: 120, right: 120 }, maxZoom: 13.5 };

/** `area`: encuadre de la zona elegida, que se descarta si la zona se quita antes de que el mapa se vea. */
type Framing = { bounds: maplibregl.LngLatBoundsLike; options: maplibregl.FitBoundsOptions; area?: true };

function frame(map: maplibregl.Map, framing: Framing, pending: { current: Framing | null }) {
  if (!map.getContainer().clientWidth) {
    pending.current = framing;
    return;
  }
  pending.current = null;
  map.fitBounds(framing.bounds, framing.options);
}

function viewArea(map: maplibregl.Map): Area {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

/**
 * `mode`: el selector Rutas / Salidas que va sobre el mapa; el estado es del explorador (el buscador vive en el encabezado).
 * Con una ruta elegida el mapa es solo de ella y, si tiene perfil, se ve en 3D con su recorrido andando: se esconden
 * los demás pines, el buscador y el selector, y quedan `onBack` (volver a la vista inicial, plana) y un panel al pie
 * con el recorrido, las capas y `onDownload` (ir a la página de la ruta). No hay botones de zoom: dedos o rueda. `onPeek`: el cursor entró a un pin; sirve para adelantar la carga del trazo.
 */
export function RouteMap({
  routes,
  selectedId,
  onSelect,
  track,
  profile,
  area,
  me,
  onUserMove,
  mode,
  onMode,
  outingCount,
  onBack,
  onDownload,
  onPeek,
}: {
  onPeek: (id: string) => void;
  onBack: () => void;
  onDownload: () => void;
  mode: "rutas" | "salidas";
  onMode: (mode: "rutas" | "salidas") => void;
  /** Salidas próximas de la actividad, para la insignia del selector */
  outingCount: number;
  routes: RouteSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Trazo de la ruta seleccionada: null si no tiene, undefined mientras se pide */
  track: LineCoords | null | undefined;
  /** Perfil de altitud de la ruta seleccionada; con él se puede recorrer en 3D */
  profile: ProfilePoint[] | null;
  /** Zona de "Buscar en esta zona": mientras exista, los pines no vuelven a encuadrarse */
  area: Area | null;
  /** Tu ubicación, si la diste con "Usar mi ubicación actual": se pinta como un punto azul */
  me: { lat: number; lng: number } | null;
  /** Lo que se ve tras mover el mapa con la mano (no tras un encuadre automático) */
  onUserMove: (view: Area) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLSpanElement; route: RouteSummary }>());
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const framedKey = useRef<string | null>(null);
  const pendingFrame = useRef<Framing | null>(null);
  const styleLoaded = useRef(false);
  const trackRef = useRef(track);
  const areaRef = useRef(area);
  const areaFramed = useRef(false);
  const onUserMoveRef = useRef(onUserMove);
  const onPeekRef = useRef(onPeek);
  const framedSelection = useRef<string | null>(null);
  const hadSelection = useRef(false);
  // pin con la ficha abierta por pulsación larga (táctil) y cómo devolverlo a su capa
  const peeked = useRef<HTMLElement | null>(null);
  const lowerPeeked = useRef<() => void>(() => {});
  const closePeek = useCallback(() => {
    if (!peeked.current) return;
    delete peeked.current.dataset.peek;
    lowerPeeked.current();
    peeked.current = null;
  }, []);
  // tocar fuera del pin (el mapa, otro pin, un control) cierra la ficha
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (peeked.current && !(e.target instanceof Node && peeked.current.contains(e.target))) closePeek();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [closePeek]);
  // el recorrido arranca solo: si la ruta llega elegida, espera a que el estilo del mapa cargue
  const [styleReady, setStyleReady] = useState(false);
  const [overlays, setOverlays] = useState(NO_OVERLAYS);
  const overlaysRef = useRef(overlays);
  const appliedOverlays = useRef(NO_OVERLAYS);
  const [sun, setSunOn] = useState(false);
  const [sunDay, setSunDay] = useState(mxToday);
  const [sunMinutes, setSunMinutes] = useState(initialSunMinutes);
  const [shadeStatus, setShadeStatus] = useState<ShadeStatus>("listo");
  const shadeRef = useRef<SunShade | null>(null);
  const [satellite, setSatelliteOn] = useState(false);
  const satelliteRef = useRef(satellite);
  const [terrain3d, setTerrain3dOn] = useState(false);
  const terrain3dRef = useRef(terrain3d);
  // panel de la ruta elegida: perfil, capas o plegado; con cada ruta vuelve al perfil
  const [panelView, setPanelView] = useState<PanelView>("perfil");
  const [panelOwner, setPanelOwner] = useState(selectedId);
  if (panelOwner !== selectedId) {
    setPanelOwner(selectedId);
    setPanelView("perfil");
    // las capas son de la ruta elegida: al volver al mapa de todas las rutas se apagan (ahí no hay cómo quitarlas)
    if (!selectedId) {
      setOverlays(NO_OVERLAYS);
      setSatelliteOn(false);
      setSunOn(false);
      setTerrain3dOn(false);
    }
  }
  useEffect(() => {
    onSelectRef.current = onSelect;
    onUserMoveRef.current = onUserMove;
    onPeekRef.current = onPeek;
  }, [onSelect, onUserMove, onPeek]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: [-99.13, 19.43],
      zoom: 8,
      attributionControl: { compact: true },
    });
    map.once("load", () => {
      addHillshade(map);
      addTopoLayers(map);
      setTrack(map, trackRef.current ?? []);
      setSatellite(map, satelliteRef.current);
      setTerrain3d(map, terrain3dRef.current);
      if (terrain3dRef.current) map.easeTo({ pitch: TERRAIN_3D_PITCH, duration: 1000 });
      applyOverlays(map, overlaysRef.current, appliedOverlays, mapRef);
      collapseAttribution(map);
      styleLoaded.current = true;
      setStyleReady(true);
    });
    map.on("error", (e: { error?: { message?: string } }) => console.error("maplibre:", e.error?.message ?? e));
    // en móvil el mapa vive oculto (0×0) mientras se ve la lista: se encuadra al mostrarse
    map.on("resize", () => {
      if (pendingFrame.current) frame(map, { ...pendingFrame.current, options: { ...pendingFrame.current.options, duration: 0 } }, pendingFrame);
    });
    // fitBounds/easeTo no traen originalEvent: solo arrastrar, hacer zoom o usar los botones cuenta
    map.on("moveend", (e: { originalEvent?: Event }) => {
      if (e.originalEvent) onUserMoveRef.current(viewArea(map));
    });
    mapRef.current = map;
    // un mapa nuevo no ha encuadrado nada; pasa al volver a montarse con una ruta ya elegida
    framedKey.current = null;
    framedSelection.current = null;

    const registry = markers.current;
    return () => {
      registry.clear();
      map.remove();
      mapRef.current = null;
      styleLoaded.current = false;
      setStyleReady(false);
      appliedOverlays.current = NO_OVERLAYS;
    };
  }, []);

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
      const card = hoverCard(route);
      button.classList.add("group");
      button.append(el, card);
      const lower = () => (button.style.zIndex = route.id === selectedRef.current ? "10" : "");
      const show = () => {
        onPeekRef.current(route.id);
        placeCard(card, button, map.getContainer());
        // la ficha va sobre los demás pines y sobre los controles del mapa
        button.style.zIndex = "30";
      };
      button.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && show());
      button.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && lower());

      // táctil: un toque elige la ruta; mantener presionado abre la ficha, que se queda hasta tocar fuera
      let press = 0;
      let from = { x: 0, y: 0 };
      let held = false;
      const cancel = () => clearTimeout(press);
      button.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        held = false;
        from = { x: e.clientX, y: e.clientY };
        cancel();
        press = window.setTimeout(() => {
          held = true;
          if (peeked.current && peeked.current !== button) closePeek();
          peeked.current = button;
          lowerPeeked.current = lower;
          show();
          button.dataset.peek = "";
        }, LONG_PRESS_MS);
      });
      // arrastrar el mapa desde el pin no es una pulsación larga
      button.addEventListener("pointermove", (e) => Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10 && cancel());
      button.addEventListener("pointerup", cancel);
      button.addEventListener("pointercancel", cancel);
      // el menú del sistema al mantener presionado taparía la ficha
      button.addEventListener("contextmenu", (e) => e.preventDefault());
      button.style.setProperty("-webkit-touch-callout", "none");
      button.style.userSelect = "none";
      button.addEventListener("click", () => {
        // al soltar una pulsación larga llega un clic: ese no elige la ruta; el siguiente (en el pin o en la ficha) sí
        if (held) return void (held = false);
        closePeek();
        onSelectRef.current(route.id);
      });
      const marker = new maplibregl.Marker({ element: button, anchor: "bottom" }).setLngLat([route.lng, route.lat]).addTo(map);
      registry.set(route.id, { marker, el, route });
    });

    const key = [...ids].sort().join();
    if (!routes.length || key === framedKey.current) return;
    const animate = framedKey.current !== null;
    framedKey.current = key;
    if (areaRef.current) return;
    const bounds = new maplibregl.LngLatBounds();
    routes.forEach((r) => bounds.extend([r.lng, r.lat]));
    frame(map, { bounds, options: { padding: 80, maxZoom: 11, duration: animate ? 600 : 0 } }, pendingFrame);
  }, [routes, closePeek]);

  // la zona que llega en la URL o del buscador de lugares se encuadra; la que se elige con el botón ya es la vista
  useEffect(() => {
    areaRef.current = area;
    const map = mapRef.current;
    if (!map) return;
    // la zona cambió o se quitó: el encuadre que esperaba a que se viera el mapa ya no vale
    if (pendingFrame.current?.area) pendingFrame.current = null;
    if (!area) return;
    const view = viewArea(map);
    if (area.every((n, i) => Math.abs(n - view[i]) < 1e-3)) return;
    const [west, south, east, north] = area;
    frame(map, { bounds: [[west, south], [east, north]], options: { padding: 0, duration: areaFramed.current ? 600 : 0 }, area: true }, pendingFrame);
    areaFramed.current = true;
  }, [area]);

  // el punto azul de tu ubicación: un marcador fijo, sin seguirte (la zona alrededor ya centra el mapa en ti)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    const el = document.createElement("span");
    el.className = "block size-4 rounded-full border-2 border-white bg-[#1da1f2] shadow-md";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Tu ubicación");
    const marker = new maplibregl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(map);
    return () => void marker.remove();
  }, [me]);

  // la ruta elegida se encuadra completa en cuanto llega su trazo; sin trazo, basta con que se vea su pin
  useEffect(() => {
    selectedRef.current = selectedId;
    trackRef.current = track;
    const map = mapRef.current;
    if (!map) return;
    const registry = markers.current;
    registry.forEach(({ el, route, marker }, id) => {
      paintPill(el, route, id === selectedId);
      marker.getElement().style.zIndex = id === selectedId ? "10" : "";
      // el pin elegido ya dice su nombre
      (marker.getElement().lastElementChild as HTMLElement).hidden = id === selectedId;
    });
    if (styleLoaded.current) setTrack(map, track ?? []);

    // con una ruta elegida solo se ve su pin
    registry.forEach(({ marker }, id) => (marker.getElement().style.display = !selectedId || id === selectedId ? "" : "none"));
    // al soltarla, de vuelta a la vista inicial (la zona buscada o todos los pines), sin importar a dónde se movió el mapa
    const released = !selectedId && hadSelection.current;
    hadSelection.current = !!selectedId;
    if (released) {
      framedSelection.current = null;
      // las capas abiertas recorren el centro del mapa: la vista inicial va sin ese relleno
      map.setPadding(NO_PADDING);
      const view = { pitch: terrain3dRef.current ? TERRAIN_3D_PITCH : 0, bearing: 0, duration: 600 };
      if (areaRef.current) {
        const [west, south, east, north] = areaRef.current;
        frame(map, { bounds: [[west, south], [east, north]], options: { padding: 0, ...view } }, pendingFrame);
      } else if (registry.size) {
        const bounds = new maplibregl.LngLatBounds();
        registry.forEach(({ route }) => bounds.extend([route.lng, route.lat]));
        frame(map, { bounds, options: { padding: 80, maxZoom: 11, ...view } }, pendingFrame);
      }
    }
    const key = `${selectedId}:${track === undefined ? "cargando" : track ? "trazo" : "pin"}`;
    if (!selectedId || track === undefined || key === framedSelection.current) return;
    framedSelection.current = key;
    // con perfil la cámara es del recorrido en 3D, que arranca de inmediato: encuadrar antes el trazo lo retrasa
    if (profile) return;
    if (!terrain3dRef.current && (map.getPitch() || map.getBearing())) map.jumpTo({ pitch: 0, bearing: 0 });
    // con el mapa oculto (móvil, vista de lista) frame() lo deja pendiente hasta que se muestre
    if (track) {
      frame(map, { bounds: lineBounds(track), options: { ...TRACK_FRAME, duration: 800 } }, pendingFrame);
    } else {
      const pin = registry.get(selectedId)?.marker.getLngLat();
      if (!pin) return;
      if (!map.getContainer().clientWidth) frame(map, { bounds: [pin, pin], options: { maxZoom: 12, duration: 0 } }, pendingFrame);
      else if (!map.getBounds().contains(pin)) map.easeTo({ center: pin, duration: 600 });
    }
  }, [selectedId, track, profile]);

  useEffect(() => {
    satelliteRef.current = satellite;
    if (mapRef.current && styleLoaded.current) setSatellite(mapRef.current, satellite);
  }, [satellite]);

  useEffect(() => {
    terrain3dRef.current = terrain3d;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    setTerrain3d(map, terrain3d);
    map.easeTo(terrain3d ? { pitch: TERRAIN_3D_PITCH, duration: 1000 } : { pitch: 0, bearing: 0, duration: 700 });
  }, [terrain3d]);

  useEffect(() => {
    overlaysRef.current = overlays;
    const map = mapRef.current;
    if (map && styleLoaded.current) applyOverlays(map, overlays, appliedOverlays, mapRef);
  }, [overlays]);

  useEffect(() => {
    if (panelView !== "capas") return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setPanelView("perfil");
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panelView]);

  // la capa de sombras se crea al prenderla por primera vez y vive lo que viva el mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current || (!sun && !shadeRef.current)) return;
    shadeRef.current ??= new SunShade(map, setShadeStatus);
    shadeRef.current.setVisible(sun);
  }, [sun]);

  useEffect(() => {
    shadeRef.current?.setDate(mxDate(sunDay, sunMinutes));
  }, [sunDay, sunMinutes, sun]);

  useEffect(
    () => () => {
      shadeRef.current?.destroy();
      shadeRef.current = null;
    },
    [],
  );

  // con perfil, la ruta elegida se ve siempre en 3D con su recorrido, que arranca solo; plegar el panel
  // no sale del 3D: solo "volver" (soltar la ruta) regresa al mapa plano
  const [tourState, setTourState] = useState<TourState | null>(null);
  const touring = !!selectedId && !!profile && styleReady;
  const tourRef = useRef<RouteTour | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!touring || !map || !profile) return;
    const registry = markers.current;
    registry.forEach(({ marker }) => (marker.getElement().style.visibility = "hidden"));
    const tour = new RouteTour(map, profile, setTourState);
    tourRef.current = tour;
    tour.start();

    return () => {
      tourRef.current = null;
      // al desmontar, el mapa ya se quitó
      if (!mapRef.current) return tour.pause();
      tour.destroy();
      registry.forEach(({ marker }) => (marker.getElement().style.visibility = ""));
      // la cámara la regresa el efecto de la selección al soltar la ruta
      if (terrain3dRef.current) setTerrain3d(map, true);
    };
  }, [touring, profile]);

  const selected = routes.find((r) => r.id === selectedId);

  // con las capas abiertas el panel tapa media pantalla: el centro del mapa (quien camina) se recorre al centro de lo
  // que sí se ve y el recorrido se pausa; al cerrarlas vuelve a su lugar y sigue si iba andando
  const panelBox = useRef<HTMLDivElement>(null);
  const layersOpen = !!selectedId && panelView === "capas";
  useEffect(() => {
    const map = mapRef.current;
    const box = panelBox.current;
    if (!layersOpen || !map || !box) return;
    const resume = !!tourRef.current?.isPlaying;
    tourRef.current?.pause();
    // animado en pausa; si el recorrido anda (lo reanudaron con las capas abiertas) sus cuadros cortarían la animación
    const pad = (padding: typeof NO_PADDING) => (tourRef.current?.isPlaying ? map.setPadding(padding) : map.easeTo({ padding, duration: 300 }));
    // 40: lo que el panel se separa del borde inferior
    const fit = () => pad({ ...NO_PADDING, bottom: box.offsetHeight + 40 });
    fit();
    // prender una capa despliega su leyenda y el panel crece
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => {
      observer.disconnect();
      if (!mapRef.current) return;
      pad(NO_PADDING);
      if (resume) map.once("moveend", () => tourRef.current?.play());
    };
  }, [layersOpen]);
  const toggleOverlay = (id: Overlay) => setOverlays((current) => ({ ...current, [id]: !current[id] }));
  const activeLayers = [satellite, sun, ...Object.values(overlays)].filter(Boolean).length;

  // maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      {!selectedId && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-3 *:pointer-events-auto">
          <div role="group" aria-label="Qué ver en el mapa" className="flex h-10 w-64 max-w-[calc(100%-40px)] items-center gap-0.5 rounded-full bg-surface-container-lowest p-1 font-headline text-[13px] font-semibold shadow-lg ring-1 ring-outline-variant/60">
            <button type="button" aria-pressed={mode === "rutas"} onClick={() => onMode("rutas")} className={clsx("h-full flex-1 rounded-full px-3.5 transition-colors", mode === "rutas" ? "bg-on-surface text-surface" : "text-on-surface-variant")}>
              Rutas
            </button>
            <button
              type="button"
              aria-pressed={mode === "salidas"}
              onClick={() => onMode("salidas")}
              className={clsx("flex h-full flex-1 items-center justify-center gap-1.5 rounded-full pr-3.5 pl-3 whitespace-nowrap transition-colors", mode === "salidas" ? "bg-on-surface text-surface" : "text-on-surface-variant")}
            >
              <Users className="size-3.5" aria-hidden /> Salidas
              {outingCount > 0 && (
                <span className={clsx("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold", mode === "salidas" ? "bg-surface text-on-surface" : "bg-secondary text-on-secondary")}>
                  {outingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
      {selected && (
        <>
          {/* lo único fuera del panel: volver al mapa de todas las rutas */}
          <button type="button" onClick={onBack} aria-label="Volver al mapa de rutas" className="absolute top-4 left-4 z-10 grid size-10 place-items-center rounded-full bg-surface-container-lowest shadow-lg ring-1 ring-outline-variant/60 transition-transform hover:scale-105 active:scale-95">
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          {/* arriba del botón de atribución del mapa */}
          <div ref={panelBox} className="absolute inset-x-3 bottom-10 z-10 lg:inset-x-4">
            <RouteMapPanel
              name={selected.name}
              summary={`${formatKm(selected.distance_km)} · ↑ ${selected.elevation_gain_m.toLocaleString("es-MX")} m`}
              profile={profile}
              tour={touring ? tourState : null}
              onToggle={() => (tourState?.playing ? tourRef.current?.pause() : tourRef.current?.play())}
              onSeek={(index) => tourRef.current?.seek(index)}
              view={panelView}
              onView={setPanelView}
              activeLayers={activeLayers}
              onDownload={onDownload}
              layers={
                <>
              <LayerRow
                on={satellite}
                onToggle={() => {
                  setSatelliteOn(!satellite);
                  if (satellite) setTerrain3dOn(false);
                }}
                icon={<Satellite className="size-4" aria-hidden />}
                title="Satélite"
                hint="Imagen aérea de fondo"
              >
                {/* con el recorrido la ruta ya se ve en 3D */}
                <button
                  type="button"
                  hidden={touring}
                  aria-pressed={terrain3d}
                  onClick={() => setTerrain3dOn((on) => !on)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                    terrain3d ? "bg-primary text-on-primary ring-primary" : "bg-surface text-on-surface ring-outline-variant/70",
                  )}
                >
                  <Rotate3d className="size-3.5" aria-hidden />
                  Relieve en 3D
                </button>
              </LayerRow>
              <LayerRow on={overlays.lidar} onToggle={() => toggleOverlay("lidar")} icon={<MountainSnow className="size-4" aria-hidden />} title="Relieve LiDAR" hint="Montículos, cráteres y terrazas">
                <LidarLegend />
              </LayerRow>
              <LayerRow on={sun} onToggle={() => setSunOn((on) => !on)} icon={<Sun className="size-4" aria-hidden />} title="Sol y sombra" hint="Qué laderas tienen sol a cada hora">
                <SunPanel day={sunDay} minutes={sunMinutes} status={shadeStatus} onDay={setSunDay} onMinutes={setSunMinutes} />
              </LayerRow>
              <LayerRow on={overlays.viewpoints} onToggle={() => toggleOverlay("viewpoints")} icon={<Binoculars className="size-4" aria-hidden />} title="Miradores" hint="Con vista al Izta y al Popo">
                <ViewpointLegend />
              </LayerRow>
              <LayerRow on={overlays.waterfalls} onToggle={() => toggleOverlay("waterfalls")} icon={<Waves className="size-4" aria-hidden />} title="Cascadas" hint="Posibles cascadas y cauces">
                <WaterfallLegend />
              </LayerRow>
              <LayerRow on={overlays.camps} onToggle={() => toggleOverlay("camps")} icon={<Tent className="size-4" aria-hidden />} title="Campamento" hint="Terreno plano y sitios autorizados">
                <CampLegend />
              </LayerRow>
              <LayerRow on={overlays.roads} onToggle={() => toggleOverlay("roads")} icon={<Route className="size-4" aria-hidden />} title="Brechas" hint="Caminos de tierra y su pendiente">
                <RoadLegend />
              </LayerRow>
                </>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Encuadra la zona de una capa si no se ve o si el mapa está demasiado lejos para distinguirla. */
function showZone(map: maplibregl.Map, zone: maplibregl.LngLatBounds) {
  const view = map.getBounds();
  const overlaps = zone.getWest() < view.getEast() && zone.getEast() > view.getWest() && zone.getSouth() < view.getNorth() && zone.getNorth() > view.getSouth();
  if (!overlaps || map.getZoom() < 8.5) map.fitBounds(zone, { padding: 40, duration: 800 });
}

/** Una capa del menú: el renglón la prende y, prendida, muestra debajo su leyenda o sus controles. */
function LayerRow({
  on,
  onToggle,
  icon,
  title,
  hint,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={clsx("rounded-xl", on && "bg-surface-container")}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-container"
      >
        <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full", on ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface")}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-headline text-sm font-semibold text-on-surface">{title}</span>
          <span className="block text-[11px] text-on-surface-variant">{hint}</span>
        </span>
        <span aria-hidden className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-outline-variant")}>
          <span className={clsx("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform", on && "translate-x-4")} />
        </span>
      </button>
      {on && children && <div className="px-3 pt-1 pb-3">{children}</div>}
    </div>
  );
}

const LEGEND = "space-y-2 text-[11px] text-on-surface-variant";

function Swatch({ color, line }: { color: string; line?: boolean }) {
  if (line) return <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: color }} />;
  return <span className="size-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: color }} />;
}

function ViewpointLegend() {
  return (
    <div className={LEGEND}>
      <ul className="space-y-1">
        <li className="flex items-center gap-1.5">
          <Swatch color={VIEWPOINT_COLOR} />
          Mirador con vista a los dos volcanes
        </li>
        {(
          [
            ["ambos", "Desde aquí se ven los dos"],
            ["izta", "Solo el Iztaccíhuatl"],
            ["popo", "Solo el Popocatépetl"],
          ] as const
        ).map(([zone, label]) => (
          <li key={zone} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-sm opacity-60" style={{ background: VIEW_ZONE_COLORS[zone] }} />
            {label}
          </li>
        ))}
      </ul>
      <p>Calculado con el relieve, sin árboles ni bruma. Faltan los miradores a menos de 12 km del cráter del Popocatépetl.</p>
    </div>
  );
}

function CampLegend() {
  return (
    <div className={LEGEND}>
      <ul className="space-y-1">
        <li className="flex items-center gap-1.5">
          <Swatch color={CAMP_COLORS.autorizado} />
          Zona autorizada o refugio
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch color={CAMP_COLORS.sugerido} />
          Terreno plano sugerido, sin verificar
        </li>
      </ul>
      <p>
        Sugerencias a partir del relieve, lejos de cauces y construcciones. En áreas naturales protegidas solo se acampa donde está permitido, y en terreno ejidal o
        privado hace falta permiso.
      </p>
    </div>
  );
}

function RoadLegend() {
  return (
    <div className={LEGEND}>
      <ul className="space-y-1">
        {(Object.keys(ROAD_COLORS) as (keyof typeof ROAD_COLORS)[]).map((tipo) => (
          <li key={tipo} className="flex items-center gap-1.5">
            <Swatch color={ROAD_COLORS[tipo]} line />
            {ROAD_LABELS[tipo]}
          </li>
        ))}
      </ul>
      <p>De OpenStreetMap e INEGI, con la pendiente del modelo de 5 m. Pueden estar cerradas o ser privadas, y con lluvia volverse intransitables.</p>
    </div>
  );
}

function LidarLegend() {
  return (
    <div className={LEGEND}>
      <p>
        <span className="font-semibold text-[#d9332a]">Rojo</span>: más alto que su entorno ·{" "}
        <span className="font-semibold text-[#2659e6]">azul</span>: más bajo
      </p>
      <p>Dentro de la línea punteada el dato es LiDAR y se notan rasgos de pocos metros; fuera es de satélite y más ruidoso.</p>
      <ul className="grid grid-cols-2 gap-1">
        {(Object.keys(FINDING_COLORS) as (keyof typeof FINDING_COLORS)[]).map((tipo) => (
          <li key={tipo} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full ring-2 ring-white" style={{ background: FINDING_COLORS[tipo] }} />
            {FINDING_LABELS[tipo]}
          </li>
        ))}
        <li className="col-span-2 flex items-center gap-1.5">
          <span className="size-2 rounded-full ring-1 ring-white" style={{ background: CANDIDATE_COLOR }} />
          Detectado, sin revisar (desde zoom 10)
        </li>
      </ul>
    </div>
  );
}

// los textos de salida/puesta y de posición son para el centro de la región; el sombreado usa el centro del mapa
const REGION = { lat: 19.3, lng: -99.0 };
const SHADE_STATUS: Record<ShadeStatus, string | null> = {
  calculando: "Calculando sombras…",
  listo: null,
  lejos: "Acércate al mapa para ver las sombras.",
  error: "No pudimos calcular las sombras. Intenta de nuevo.",
};

function SunPanel({ day, minutes, status, onDay, onMinutes }: { day: string; minutes: number; status: ShadeStatus; onDay: (day: string) => void; onMinutes: (minutes: number) => void }) {
  const { sunrise, sunset } = sunTimes(day, REGION.lat, REGION.lng);
  const sun = sunPosition(mxDate(day, minutes), REGION.lat, REGION.lng);
  return (
    <div className={LEGEND}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5">
          Día
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && onDay(e.target.value)}
            className="rounded-md border border-outline-variant/70 bg-surface px-1.5 py-0.5 text-on-surface"
          />
        </label>
        <span className="font-mono text-sm font-semibold text-on-surface">{formatMinutes(minutes)}</span>
      </div>
      <input
        type="range"
        min={5 * 60}
        max={20 * 60}
        step={15}
        value={minutes}
        onChange={(e) => onMinutes(Number(e.target.value))}
        aria-label="Hora del día"
        aria-valuetext={formatMinutes(minutes)}
        className="w-full accent-primary"
      />
      <p>
        {sun.altitude > 0 ? `Sol a ${Math.round(sun.altitude)}° desde ${compassName(sun.azimuth)}` : "El sol está bajo el horizonte"}
        {sunrise !== null && sunset !== null && ` · sale ${formatMinutes(sunrise)}, se pone ${formatMinutes(sunset)}`}
      </p>
      {SHADE_STATUS[status] && <p className="font-semibold text-on-surface">{SHADE_STATUS[status]}</p>}
      <p>Sombras que proyecta el relieve (no árboles ni edificios), con el modelo de 5 m de INEGI en la zona de los volcanes.</p>
    </div>
  );
}

function WaterfallLegend() {
  return (
    <div className={LEGEND}>
      <ul className="space-y-1">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: WATERFALL_COLOR }} />
          Posible cascada, sin confirmar
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: STREAM_COLOR }} />
          Cauce (los arroyos chicos desde zoom 11)
        </li>
      </ul>
      <p>
        Salen del relieve, no de visitas: un cauce marca por dónde bajaría el agua, no que haya agua todo el año.
      </p>
    </div>
  );
}
