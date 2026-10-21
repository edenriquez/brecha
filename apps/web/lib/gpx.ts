import type { Difficulty, RouteSummary } from "@/lib/routes";

/** Lo mismo corre en el navegador (vista previa) y en el servidor (lo que se guarda), sin dependencias. */

export type TrackPoint = { lng: number; lat: number; ele: number | null };
/** [km desde el inicio, altitud m, lng, lat] */
export type ProfilePoint = [number, number, number, number];
/** Forma compacta para enviar al servidor: [lng, lat, ele | null] */
export type PackedPoint = [number, number, number | null];

export type TrackAnalysis = {
  points: TrackPoint[];
  distanceKm: number;
  gainM: number | null;
  lossM: number | null;
  minEle: number | null;
  maxEle: number | null;
  profile: ProfilePoint[] | null;
  routeType: RouteSummary["route_type"];
  durationMin: number;
};

export const STEP_M = 20;
export const MIN_KM = 0.3;
export const MAX_KM = 120;
const PROFILE_POINTS = 200;

export class GpxError extends Error {}

const NUM = "([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)";
const POINT_TAG = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
const LAT = new RegExp(`\\blat\\s*=\\s*["']${NUM}["']`);
const LON = new RegExp(`\\blon\\s*=\\s*["']${NUM}["']`);
const ELE = new RegExp(`<ele>\\s*${NUM}\\s*</ele>`);

/** Puntos de los tracks (<trkpt>); si el archivo solo trae una ruta planeada, sus <rtept>. */
export function parseGpx(xml: string): TrackPoint[] {
  if (!/<gpx[\s>]/.test(xml)) throw new GpxError("El archivo no parece un GPX.");
  const byTag: Record<string, TrackPoint[]> = { trkpt: [], rtept: [] };
  for (const [, tag, attrs, body] of xml.matchAll(POINT_TAG)) {
    const lat = Number(attrs.match(LAT)?.[1]);
    const lng = Number(attrs.match(LON)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const ele = body ? Number(body.match(ELE)?.[1]) : NaN;
    byTag[tag].push({ lat, lng, ele: Number.isFinite(ele) ? ele : null });
  }
  const points = byTag.trkpt.length >= 2 ? byTag.trkpt : byTag.rtept;
  if (points.length < 2) throw new GpxError("El GPX no trae un track con puntos.");
  return points;
}

/** Nombre del track (o del archivo) para prellenar el formulario. */
export function parseGpxName(xml: string): string | null {
  const raw = xml.match(/<trk\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1] ?? xml.match(/<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/)?.[1];
  if (!raw) return null;
  const name = raw
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e]!)
    .trim();
  return name || null;
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Un punto cada STEP_M metros: quita el ruido de GPS parado y deja el tamaño acotado (100 km ≈ 5,000 puntos). */
export function resample(points: TrackPoint[], step = STEP_M): TrackPoint[] {
  const out: TrackPoint[] = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = haversineM(a, b);
    if (!seg) continue;
    let at = step - carried;
    while (at <= seg) {
      const t = at / seg;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        ele: a.ele !== null && b.ele !== null ? a.ele + (b.ele - a.ele) * t : (t < 0.5 ? a.ele : b.ele),
      });
      at += step;
    }
    carried = seg - (at - step);
  }
  const last = points[points.length - 1];
  if (haversineM(out[out.length - 1], last) > 1) out.push(last);
  return out;
}

/** Media móvil de 5 puntos (~100 m): el desnivel con altitudes crudas de GPS sale inflado. */
function smooth(values: number[], radius = 2) {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

/** Cierra en el inicio: circular, o ida y vuelta si la segunda mitad repite el camino de la primera. */
function detectRouteType(points: TrackPoint[]): RouteSummary["route_type"] {
  if (haversineM(points[0], points[points.length - 1]) > 200) return "solo_ida";
  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid).filter((_, i) => i % 3 === 0);
  const secondHalf = points.slice(mid).filter((_, i) => i % 5 === 0);
  const retraced = secondHalf.filter((p) => firstHalf.some((q) => haversineM(p, q) < 30)).length;
  return retraced / Math.max(secondHalf.length, 1) > 0.6 ? "ida_vuelta" : "circular";
}

/** Tiempo en movimiento al estilo MIDE: 4 km/h en plano, 400 m/h de subida, 600 m/h de bajada. */
export function estimateDurationMin(distanceKm: number, gainM: number, lossM: number) {
  const horizontal = distanceKm / 4;
  const vertical = gainM / 400 + lossM / 600;
  const hours = Math.max(horizontal, vertical) + Math.min(horizontal, vertical) / 2;
  return Math.max(15, Math.round((hours * 60) / 15) * 15);
}

/** `resampled`: los puntos ya vienen de un análisis previo (servidor); remuestrear otra vez recorta las curvas. */
export function analyzeTrack(raw: TrackPoint[], { resampled = false } = {}): TrackAnalysis {
  const points = resampled ? raw : resample(raw);
  let distanceM = 0;
  const km = [0];
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineM(points[i - 1], points[i]);
    km.push(distanceM / 1000);
  }
  const distanceKm = distanceM / 1000;
  if (points.length < 10 || distanceKm < MIN_KM) throw new GpxError("El track es demasiado corto para ser una ruta.");
  if (distanceKm > MAX_KM) throw new GpxError(`El track mide ${Math.round(distanceKm)} km; el máximo es ${MAX_KM} km.`);

  // con menos del 80% de puntos con altitud no hay perfil confiable (se completa con el modelo de elevación)
  const withEle = points.filter((p) => p.ele !== null).length;
  const hasElevation = withEle / points.length >= 0.8;
  let gainM: number | null = null;
  let lossM: number | null = null;
  let minEle: number | null = null;
  let maxEle: number | null = null;
  let profile: ProfilePoint[] | null = null;

  if (hasElevation) {
    let lastKnown = points.find((p) => p.ele !== null)!.ele!;
    const filled = points.map((p) => (p.ele === null ? lastKnown : (lastKnown = p.ele)));
    const ele = smooth(filled);
    gainM = 0;
    lossM = 0;
    for (let i = 1; i < ele.length; i++) {
      const d = ele[i] - ele[i - 1];
      if (d > 0) gainM += d;
      else lossM -= d;
    }
    gainM = Math.round(gainM);
    lossM = Math.round(lossM);
    minEle = Math.round(Math.min(...ele));
    maxEle = Math.round(Math.max(...ele));
    const n = Math.min(PROFILE_POINTS, points.length);
    profile = Array.from({ length: n }, (_, k) => {
      const i = Math.round((k * (points.length - 1)) / (n - 1));
      return [round(km[i], 2), Math.round(ele[i]), round(points[i].lng, 5), round(points[i].lat, 5)];
    });
  }

  return {
    points,
    distanceKm,
    gainM,
    lossM,
    minEle,
    maxEle,
    profile,
    routeType: detectRouteType(points),
    durationMin: estimateDurationMin(distanceKm, gainM ?? 0, lossM ?? 0),
  };
}

/** Sugerencia para el formulario; quien sube la ruta decide. */
export function suggestDifficulty(distanceKm: number, gainM: number, maxEle: number | null): Difficulty {
  const levels: Difficulty[] = ["facil", "moderada", "dificil", "experto"];
  const score = distanceKm + gainM / 100;
  let level = score < 12 ? 0 : score < 20 ? 1 : score < 30 ? 2 : 3;
  if (distanceKm > 0 && gainM / distanceKm > 100) level++; // pendiente fuerte
  if ((maxEle ?? 0) > 3500) level++; // altura: el aire pesa
  return levels[Math.min(level, 3)];
}

export function packPoints(points: TrackPoint[]): PackedPoint[] {
  return points.map((p) => [round(p.lng, 5), round(p.lat, 5), p.ele === null ? null : Math.round(p.ele)]);
}

/** Valida lo que llega del navegador antes de volver a analizarlo en el servidor. */
export function unpackPoints(value: unknown): TrackPoint[] {
  const max = Math.ceil((MAX_KM * 1000) / STEP_M) + 10;
  if (!Array.isArray(value) || value.length < 10 || value.length > max) throw new GpxError("El track llegó incompleto.");
  return value.map((p) => {
    if (!Array.isArray(p) || p.length !== 3) throw new GpxError("El track llegó incompleto.");
    const [lng, lat, ele] = p;
    if (typeof lng !== "number" || typeof lat !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new GpxError("El track tiene coordenadas inválidas.");
    if (ele !== null && (typeof ele !== "number" || ele < -500 || ele > 9000)) throw new GpxError("El track tiene altitudes inválidas.");
    return { lng, lat, ele };
  });
}

export function toEWKT(points: TrackPoint[]) {
  return `SRID=4326;LINESTRING(${points.map((p) => `${p.lng} ${p.lat}`).join(",")})`;
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
