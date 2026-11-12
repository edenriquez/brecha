"use client";

import type { FeatureCollection, LineString } from "geojson";
import type { ProfilePoint } from "@/lib/gpx";
import { addTerrainSource, HILLSHADE_EXAGGERATION, maplibregl, SKY, TERRAIN_SOURCE, type LineCoords } from "@/lib/maplibre";

const ZOOM = 13.6;
// desde arriba se lee el terreno alrededor del sendero; más acostado solo se ve la loma de enfrente
const PITCH = 58;
// para librar una loma la cámara se inclina hasta 44° y luego se acerca;
// más vertical que 30° ya parece vista de satélite
const CLOSER_ZOOMS = [0, 0.7, 1.4];
const VIEWS = CLOSER_ZOOMS.flatMap((zoomIn, i) => {
  const minPitch = i === CLOSER_ZOOMS.length - 1 ? 30 : 44;
  return Array.from({ length: (PITCH - minPitch) / 2 + 1 }, (_, j) => ({ pitch: PITCH - j * 2, zoom: ZOOM + zoomIn }));
});
const SIGHT_SAMPLES = 32;
const CLEARANCE_M = 60;
// la cámara se anticipa a la loma que viene y sube rápido; baja despacio para no cabecear
const SIGHT_AHEAD_KM = 0.15;
const RISE_MS = 150;
const SETTLE_MS = 1600;
const RAD = Math.PI / 180;
// el relieve exagerado deja ver cañadas y lomas que a escala real se ven planas desde la cámara
const EXAGGERATION = 2;
const TOUR_HILLSHADE = 0.75;
const LOOK_AHEAD_KM = 0.3;
// cuánto tarda la cámara en alcanzar el rumbo del sendero: más corto marea en las curvas cerradas
const TURN_MS = 900;
const INTRO_MS = 2200;

export type TourState = { index: number; km: number; ele: number; playing: boolean; done: boolean };

/** Duración del recorrido completo: crece con la ruta sin volverse eterno. */
function tourMs(totalKm: number) {
  return Math.min(Math.max(totalKm * 3.5, 18), 60) * 1000;
}

function bearingBetween([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const dLng = (lng2 - lng1) * RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * RAD);
  const x = Math.cos(lat1 * RAD) * Math.sin(lat2 * RAD) - Math.sin(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos(dLng);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

function turnToward(current: number, target: number, k: number) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * k + 360) % 360;
}

/** Recorrido animado de una ruta sobre el relieve en 3D, con la cámara detrás de quien camina. */
export class RouteTour {
  private km = 0;
  private bearing = 0;
  private pitch = PITCH;
  private zoom = ZOOM;
  private playing = false;
  private raf = 0;
  private last = 0;
  private readonly total: number;
  private readonly kmPerMs: number;
  private readonly marker: maplibregl.Marker;
  private introPending = false;
  // arrastrar o hacer zoom a mano pausa (también durante el vuelo inicial)
  private readonly interrupt = (e: { originalEvent?: Event }) => {
    if (!e.originalEvent) return;
    this.introPending = false;
    if (this.playing) this.pause();
  };

  constructor(
    private readonly map: maplibregl.Map,
    private readonly profile: ProfilePoint[],
    private readonly onChange: (state: TourState) => void,
  ) {
    this.total = profile[profile.length - 1][0];
    this.kmPerMs = this.total / tourMs(this.total);

    const dot = document.createElement("div");
    dot.className = "size-4 rounded-full border-[3px] border-white bg-secondary shadow-lg ring-4 ring-secondary/30";
    this.marker = new maplibregl.Marker({ element: dot }).setLngLat(this.point(0).lngLat);

    addTerrainSource(map);
    map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: EXAGGERATION });
    map.setSky(SKY);
    map.setMaxPitch(80);
    if (map.getLayer("hillshade")) map.setPaintProperty("hillshade", "hillshade-exaggeration", TOUR_HILLSHADE);

    map.addSource("tour", { type: "geojson", data: this.traveled(0) });
    const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: "tour-line",
        type: "line",
        source: "tour",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 3.5] },
      },
      firstLabel,
    );
    this.marker.addTo(map);
    map.on("movestart", this.interrupt);
  }

  /** Vuela al inicio y arranca. */
  start() {
    const start = this.point(0);
    this.bearing = bearingBetween(start.lngLat, this.point(LOOK_AHEAD_KM).lngLat);
    ({ pitch: this.pitch, zoom: this.zoom } = this.clearView(start));
    this.introPending = true;
    this.map.flyTo({ center: start.lngLat, zoom: this.zoom, pitch: this.pitch, bearing: this.bearing, duration: INTRO_MS, essential: true });
    this.map.once("moveend", () => {
      if (this.introPending) this.play();
      this.introPending = false;
    });
    this.emit();
  }

  play() {
    this.introPending = false;
    if (this.km >= this.total) this.km = 0;
    this.playing = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }

  pause() {
    this.introPending = false;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  /** Mueve el recorrido a un punto del perfil, en pausa. */
  seek(index: number) {
    this.pause();
    this.km = this.profile[index][0];
    const here = this.point(this.km);
    this.bearing = this.targetBearing(here);
    ({ pitch: this.pitch, zoom: this.zoom } = this.clearView(here));
    this.render(here);
    // al saltar lejos el relieve del nuevo punto todavía no carga: se recalcula cuando llega
    this.map.off("idle", this.settle);
    this.map.once("idle", this.settle);
  }

  private readonly settle = () => {
    if (this.playing) return;
    const here = this.point(this.km);
    ({ pitch: this.pitch, zoom: this.zoom } = this.clearView(here));
    this.render(here);
  };

  /** Quita el relieve y lo dibujado; la cámara la regresa quien llama. */
  destroy() {
    cancelAnimationFrame(this.raf);
    this.playing = false;
    this.introPending = false;
    this.map.off("movestart", this.interrupt);
    this.map.off("idle", this.settle);
    this.marker.remove();
    if (this.map.getLayer("tour-line")) this.map.removeLayer("tour-line");
    if (this.map.getSource("tour")) this.map.removeSource("tour");
    this.map.setTerrain(null);
    if (this.map.getLayer("hillshade")) this.map.setPaintProperty("hillshade", "hillshade-exaggeration", HILLSHADE_EXAGGERATION);
  }

  private readonly tick = (now: number) => {
    if (!this.playing) return;
    const dt = Math.min(now - this.last, 100);
    this.last = now;
    this.km = Math.min(this.km + dt * this.kmPerMs, this.total);
    const here = this.point(this.km);
    this.bearing = turnToward(this.bearing, this.targetBearing(here), 1 - Math.exp(-dt / TURN_MS));
    const view = this.clearView(here, this.point(Math.min(this.km + SIGHT_AHEAD_KM, this.total)));
    this.pitch += (view.pitch - this.pitch) * (1 - Math.exp(-dt / (view.pitch < this.pitch ? RISE_MS : SETTLE_MS)));
    this.zoom += (view.zoom - this.zoom) * (1 - Math.exp(-dt / (view.zoom > this.zoom ? RISE_MS : SETTLE_MS)));
    this.render(here);
    if (this.km >= this.total) return this.pause();
    this.raf = requestAnimationFrame(this.tick);
  };

  private render(here = this.point(this.km)) {
    this.map.jumpTo({ center: here.lngLat, zoom: this.zoom, pitch: this.pitch, bearing: this.bearing });
    this.marker.setLngLat(here.lngLat);
    this.map.getSource<maplibregl.GeoJSONSource>("tour")?.setData(this.traveled(this.km));
    this.emit();
  }

  /**
   * Cámara más parecida a la de siempre con la que ninguna loma entre ella y quien camina tapa la vista
   * (de bajada, la montaña que se deja atrás queda justo ahí): primero se inclina y, si no alcanza, se acerca.
   */
  private clearView(...points: ReturnType<RouteTour["point"]>[]) {
    return VIEWS[Math.max(...points.map((p) => this.firstClearView(p)))];
  }

  private firstClearView({ lngLat: [lng, lat], ele }: ReturnType<RouteTour["point"]>) {
    const map = this.map;
    const ground = map.queryTerrainElevation([lng, lat]) || ele * EXAGGERATION;
    const metersPerPx = (40075016.686 * Math.cos(lat * RAD)) / (512 * 2 ** ZOOM);
    const toCamera = (map.getCanvas().clientHeight / 2 / Math.tan((map.getVerticalFieldOfView() / 2) * RAD)) * metersPerPx;
    const reach = toCamera * Math.sin(PITCH * RAD);
    const back = (this.bearing + 180) * RAD;
    // ángulo sobre el horizonte que necesita la vista para pasar por encima de cada muestra
    const needs: [distance: number, angle: number][] = [];
    for (let i = 1; i <= SIGHT_SAMPLES; i++) {
      const d = (reach * i) / SIGHT_SAMPLES;
      const height = map.queryTerrainElevation([
        lng + (d * Math.sin(back)) / (111320 * Math.cos(lat * RAD)),
        lat + (d * Math.cos(back)) / 110540,
      ]);
      // sin teselas cargadas la altura llega vacía o en cero
      if (!height) continue;
      needs.push([d, Math.atan2(height + Math.min(CLEARANCE_M, d * 0.1) - ground, d)]);
    }
    // inclinarla o acercarla también reduce la distancia: solo cuenta lo que queda entre ella y quien camina
    const clear = VIEWS.findIndex(({ pitch, zoom }) => {
      const horizontal = toCamera * 2 ** (ZOOM - zoom) * Math.sin(pitch * RAD);
      const angle = (90 - pitch) * RAD;
      return needs.every(([d, need]) => d > horizontal || need <= angle);
    });
    return clear === -1 ? VIEWS.length - 1 : clear;
  }

  private emit() {
    const here = this.point(this.km);
    this.onChange({ index: here.index, km: this.km, ele: here.ele, playing: this.playing, done: this.km >= this.total });
  }

  private targetBearing(here: ReturnType<RouteTour["point"]>) {
    const ahead = this.point(Math.min(this.km + LOOK_AHEAD_KM, this.total));
    // al final ya no hay hacia dónde ver: se conserva el rumbo
    return ahead.index === here.index && ahead.t === here.t ? this.bearing : bearingBetween(here.lngLat, ahead.lngLat);
  }

  /** Posición a `km` del inicio, interpolada entre puntos del perfil; `index` es el punto más cercano. */
  private point(km: number) {
    const p = this.profile;
    let lo = 0;
    let hi = p.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (p[mid][0] <= km) lo = mid;
      else hi = mid;
    }
    const span = p[hi][0] - p[lo][0];
    const t = span > 0 ? Math.min(Math.max((km - p[lo][0]) / span, 0), 1) : 0;
    const mix = (a: number, b: number) => a + (b - a) * t;
    return {
      lngLat: [mix(p[lo][2], p[hi][2]), mix(p[lo][3], p[hi][3])] as [number, number],
      ele: Math.round(mix(p[lo][1], p[hi][1])),
      index: t < 0.5 ? lo : hi,
      t,
    };
  }

  private traveled(km: number): FeatureCollection<LineString> {
    const here = this.point(km);
    const line: LineCoords = this.profile.filter((p) => p[0] <= km).map((p) => [p[2], p[3]]);
    line.push(here.lngLat);
    return { type: "FeatureCollection", features: line.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }] : [] };
  }
}
