"use client";

import { useEffect, useRef, useState } from "react";
import { Binoculars, Layers, Mountain, MountainSnow, Rotate3d, Route, Satellite, Sun, Tent, Waves, X } from "lucide-react";
import clsx from "clsx";
import { RouteTourPanel } from "@/components/route-tour-panel";
import type { ProfilePoint } from "@/lib/gpx";
import { CANDIDATE_COLOR, FINDING_COLORS, FINDING_LABELS, STREAM_COLOR, WATERFALL_COLOR, setLidar, setWaterfalls } from "@/lib/lidar-layer";
import {
  addHillshade,
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
import { DIFFICULTY, formatKm, type RouteSummary } from "@/lib/routes";
import { SunShade, type ShadeStatus } from "@/lib/sun-shade";
import { compassName, formatMinutes, mxDate, mxToday, sunPosition, sunTimes } from "@/lib/sun";
import { CAMP_COLORS, ROAD_COLORS, ROAD_LABELS, VIEWPOINT_COLOR, VIEW_ZONE_COLORS, setCamps, setRoads, setViewpoints } from "@/lib/terrain-layers";

// capas de datos que se crean al prenderlas por primera vez; cada una resuelve con el área que cubre
const OVERLAYS = { lidar: setLidar, waterfalls: setWaterfalls, viewpoints: setViewpoints, camps: setCamps, roads: setRoads };
type Overlay = keyof typeof OVERLAYS;
type Overlays = Record<Overlay, boolean>;
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

function paintPill(el: HTMLElement, route: RouteSummary, selected: boolean) {
  el.className = `${PILL} ${selected ? PILL_SELECTED : PILL_IDLE}`;
  el.innerHTML = pillHtml(route, selected);
}

// a los lados cabe la etiqueta del pin elegido (va centrada en el inicio); arriba, el botón del recorrido
const TRACK_FRAME = { padding: { top: 90, bottom: 60, left: 120, right: 120 }, maxZoom: 13.5 };

type Framing = { bounds: maplibregl.LngLatBoundsLike; options: maplibregl.FitBoundsOptions };

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

export function RouteMap({
  routes,
  selectedId,
  onSelect,
  track,
  profile,
  area,
  onUserMove,
  onTourChange,
}: {
  routes: RouteSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Trazo de la ruta seleccionada: null si no tiene, undefined mientras se pide */
  track: LineCoords | null | undefined;
  /** Perfil de altitud de la ruta seleccionada; con él se puede recorrer en 3D */
  profile: ProfilePoint[] | null;
  /** Al entrar y salir del recorrido en 3D */
  onTourChange?: (touring: boolean) => void;
  /** Zona de "Buscar en esta zona": mientras exista, los pines no vuelven a encuadrarse */
  area: Area | null;
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
  const onTourChangeRef = useRef(onTourChange);
  const framedSelection = useRef<string | null>(null);
  const [overlays, setOverlays] = useState(NO_OVERLAYS);
  const overlaysRef = useRef(overlays);
  const appliedOverlays = useRef(NO_OVERLAYS);
  const [layersOpen, setLayersOpen] = useState(false);
  const [sun, setSunOn] = useState(false);
  const [sunDay, setSunDay] = useState(mxToday);
  const [sunMinutes, setSunMinutes] = useState(initialSunMinutes);
  const [shadeStatus, setShadeStatus] = useState<ShadeStatus>("listo");
  const shadeRef = useRef<SunShade | null>(null);
  const [satellite, setSatelliteOn] = useState(false);
  const satelliteRef = useRef(satellite);
  const [terrain3d, setTerrain3dOn] = useState(false);
  const terrain3dRef = useRef(terrain3d);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onUserMoveRef.current = onUserMove;
    onTourChangeRef.current = onTourChange;
  }, [onSelect, onUserMove, onTourChange]);

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
      setSatellite(map, satelliteRef.current);
      setTerrain3d(map, terrain3dRef.current);
      if (terrain3dRef.current) map.easeTo({ pitch: TERRAIN_3D_PITCH, duration: 1000 });
      applyOverlays(map, overlaysRef.current, appliedOverlays, mapRef);
      collapseAttribution(map);
      styleLoaded.current = true;
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
    framedKey.current = null;

    const registry = markers.current;
    return () => {
      registry.clear();
      map.remove();
      mapRef.current = null;
      styleLoaded.current = false;
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
      button.append(el);
      button.addEventListener("click", () => onSelectRef.current(route.id));
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
  }, [routes]);

  // una zona que llega en la URL (enlace compartido, recarga) se encuadra una vez; la que se elige con el botón ya es la vista
  useEffect(() => {
    areaRef.current = area;
    const map = mapRef.current;
    if (!map || !area || areaFramed.current) return;
    areaFramed.current = true;
    const view = viewArea(map);
    if (area.every((n, i) => Math.abs(n - view[i]) < 1e-3)) return;
    const [west, south, east, north] = area;
    frame(map, { bounds: [[west, south], [east, north]], options: { padding: 0, duration: 0 } }, pendingFrame);
  }, [area]);

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
    });
    if (styleLoaded.current) setTrack(map, track ?? []);

    const key = `${selectedId}:${track === undefined ? "cargando" : track ? "trazo" : "pin"}`;
    // el mapa oculto (móvil, vista de lista) no se mueve
    if (!selectedId || track === undefined || key === framedSelection.current || !map.getContainer().clientWidth) return;
    framedSelection.current = key;
    if (!terrain3dRef.current && (map.getPitch() || map.getBearing())) map.jumpTo({ pitch: 0, bearing: 0 });
    if (track) {
      map.fitBounds(lineBounds(track), { ...TRACK_FRAME, duration: 800 });
    } else {
      const pin = registry.get(selectedId)?.marker.getLngLat();
      if (pin && !map.getBounds().contains(pin)) map.easeTo({ center: pin, duration: 600 });
    }
  }, [selectedId, track]);

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

  // en 3D la brújula vuelve al norte y, arrastrándola, gira e inclina la vista
  useEffect(() => {
    const map = mapRef.current;
    if (!terrain3d || !map) return;
    const compass = new maplibregl.NavigationControl({ showZoom: false });
    map.addControl(compass, "bottom-right");
    return () => {
      if (mapRef.current) map.removeControl(compass);
    };
  }, [terrain3d]);

  useEffect(() => {
    overlaysRef.current = overlays;
    const map = mapRef.current;
    if (map && styleLoaded.current) applyOverlays(map, overlays, appliedOverlays, mapRef);
  }, [overlays]);

  useEffect(() => {
    if (!layersOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setLayersOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [layersOpen]);

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

  // el recorrido es de la ruta elegida: al elegir otra se termina (ajuste durante el render, sin efecto)
  const [tourFor, setTourFor] = useState<string | null>(null);
  const [tourState, setTourState] = useState<TourState | null>(null);
  const [tourOwner, setTourOwner] = useState(selectedId);
  if (tourOwner !== selectedId) {
    setTourOwner(selectedId);
    setTourFor(null);
  }
  const touring = tourFor !== null && tourFor === selectedId && !!profile;
  const tourRef = useRef<RouteTour | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!touring || !map || !profile) return;
    const registry = markers.current;
    registry.forEach(({ marker }) => (marker.getElement().style.visibility = "hidden"));
    const tour = new RouteTour(map, profile, setTourState);
    tourRef.current = tour;
    tour.start();
    onTourChangeRef.current?.(true);
    const owner = selectedRef.current;

    return () => {
      tourRef.current = null;
      onTourChangeRef.current?.(false);
      // al desmontar, el mapa ya se quitó
      if (!mapRef.current) return tour.pause();
      tour.destroy();
      registry.forEach(({ marker }) => (marker.getElement().style.visibility = ""));
      if (terrain3dRef.current) setTerrain3d(map, true);
      map.easeTo({ pitch: terrain3dRef.current ? TERRAIN_3D_PITCH : 0, bearing: 0, duration: 700 });
      map.once("moveend", () => {
        const line = trackRef.current;
        if (line && selectedRef.current === owner) map.fitBounds(lineBounds(line), { ...TRACK_FRAME, duration: 700 });
      });
    };
  }, [touring, profile]);

  const toggleOverlay = (id: Overlay) => setOverlays((current) => ({ ...current, [id]: !current[id] }));
  const activeLayers = [satellite, sun, ...Object.values(overlays)].filter(Boolean).length;

  // maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      {!touring && (
        // abajo de "Buscar en esta zona", que va centrado arriba y en mapas angostos lo taparía
        <div className="pointer-events-none absolute top-16 bottom-4 left-4 z-10 flex flex-col items-start gap-2 xl:top-4">
          <button
            type="button"
            aria-expanded={layersOpen}
            aria-controls="map-layers"
            onClick={() => setLayersOpen((open) => !open)}
            className={clsx(
              "pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 font-headline text-sm font-semibold shadow-lg ring-1 transition-transform hover:scale-105 active:scale-95",
              layersOpen ? "bg-on-surface text-surface ring-on-surface" : "bg-surface-container-lowest text-on-surface ring-outline-variant/60",
            )}
          >
            {layersOpen ? <X className="size-4" aria-hidden /> : <Layers className="size-4" aria-hidden />}
            Capas
            {activeLayers > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-on-primary" aria-label={`${activeLayers} activas`}>
                {activeLayers}
              </span>
            )}
          </button>
          {layersOpen && (
            <div
              id="map-layers"
              className="pointer-events-auto min-h-0 w-72 max-w-[calc(100vw-2rem)] space-y-0.5 overflow-y-auto overscroll-contain rounded-2xl bg-surface-container-lowest/95 p-1.5 shadow-lg ring-1 ring-outline-variant/50"
            >
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
                <button
                  type="button"
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
            </div>
          )}
        </div>
      )}
      {profile && selectedId && !touring && (
        <button
          type="button"
          onClick={() => setTourFor(selectedId)}
          className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-full bg-on-surface px-4 py-2 font-headline text-sm font-semibold text-surface shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Mountain className="size-4" aria-hidden />
          Recorrer en 3D
        </button>
      )}
      {touring && tourState && (
        <RouteTourPanel
          name={routes.find((r) => r.id === selectedId)?.name ?? ""}
          profile={profile}
          state={tourState}
          onToggle={() => (tourState.playing ? tourRef.current?.pause() : tourRef.current?.play())}
          onSeek={(index) => tourRef.current?.seek(index)}
          onClose={() => setTourFor(null)}
        />
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
