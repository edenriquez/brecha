"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Mountain, Rotate3d, Satellite, Waves } from "lucide-react";
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
  const [lidar, setLidarOn] = useState(false);
  const lidarRef = useRef(lidar);
  const [waterfalls, setWaterfallsOn] = useState(false);
  const waterfallsRef = useRef(waterfalls);
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
      setLidar(map, lidarRef.current).catch((e) => console.error("capa LiDAR:", e));
      setWaterfalls(map, waterfallsRef.current).catch((e) => console.error("capa de cascadas:", e));
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
    lidarRef.current = lidar;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    setLidar(map, lidar)
      .then((zone) => lidar && zone && mapRef.current === map && showZone(map, zone))
      .catch((e) => console.error("capa LiDAR:", e));
  }, [lidar]);

  useEffect(() => {
    waterfallsRef.current = waterfalls;
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    setWaterfalls(map, waterfalls)
      .then((zone) => waterfalls && zone && mapRef.current === map && showZone(map, zone))
      .catch((e) => console.error("capa de cascadas:", e));
  }, [waterfalls]);

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

  // maplibre-gl.css pone position: relative al contenedor, por eso el absolute va en un wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      {!touring && (
        // abajo de "Buscar en esta zona", que va centrado arriba y en mapas angostos lo taparía
        <div className="absolute top-16 left-4 z-10 flex flex-col items-start gap-2 xl:top-4">
          <div className="flex flex-wrap gap-2 pr-4">
            <LayerToggle
              on={satellite}
              onClick={() => {
                setSatelliteOn(!satellite);
                if (satellite) setTerrain3dOn(false);
              }}
              icon={<Satellite className="size-4" aria-hidden />}
            >
              Satélite
            </LayerToggle>
            {satellite && (
              <LayerToggle on={terrain3d} onClick={() => setTerrain3dOn((on) => !on)} icon={<Rotate3d className="size-4" aria-hidden />}>
                3D
              </LayerToggle>
            )}
            <LayerToggle on={lidar} onClick={() => setLidarOn((on) => !on)} icon={<Layers className="size-4" aria-hidden />}>
              Relieve LiDAR
            </LayerToggle>
            <LayerToggle on={waterfalls} onClick={() => setWaterfallsOn((on) => !on)} icon={<Waves className="size-4" aria-hidden />}>
              Cascadas
            </LayerToggle>
          </div>
          {lidar && <LidarLegend />}
          {waterfalls && <WaterfallLegend />}
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

function LayerToggle({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 rounded-full px-4 py-2 font-headline text-sm font-semibold shadow-lg ring-1 transition-transform hover:scale-105 active:scale-95",
        on ? "bg-primary text-on-primary ring-primary" : "bg-surface-container-lowest text-on-surface ring-outline-variant/60",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function LidarLegend() {
  return (
    <div className="w-56 space-y-2 rounded-2xl bg-surface-container-lowest/95 p-3 text-[11px] text-on-surface-variant shadow-lg ring-1 ring-outline-variant/50">
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

function WaterfallLegend() {
  return (
    <div className="w-56 space-y-2 rounded-2xl bg-surface-container-lowest/95 p-3 text-[11px] text-on-surface-variant shadow-lg ring-1 ring-outline-variant/50">
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
