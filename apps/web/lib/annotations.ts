import { GitFork, MessageCircle, Mountain, TriangleAlert, Waves, type LucideIcon } from "lucide-react";
import { haversineM } from "@/lib/gpx";

export type Traction = "normal" | "4h" | "4l";
export type NoticeKind = "obstruccion" | "lodo_agua" | "paso_dificil" | "chicken_line" | "comentario";
export type AnnotationKind = "traccion" | NoticeKind;

export type RouteAnnotation = {
  id: string;
  kind: AnnotationKind;
  traction: Traction | null;
  km: number;
  lng: number;
  lat: number;
  note: string | null;
  updated_at: string;
};

export const ANNOTATION_COLUMNS = "id, kind, traction, km, lng, lat, note, updated_at";
export const NOTE_MAX = 280;

/** Los colores de facil / moderada / dificil (globals.css). */
export const TRACTION: Record<Traction, { label: string; color: string }> = {
  normal: { label: "Normal", color: "#3a9d5d" },
  "4h": { label: "4H", color: "#e0a526" },
  "4l": { label: "4L", color: "#d64545" },
};
export const UNMARKED = { label: "Sin marcar", color: "#ff7a3d" };

export const NOTICE: Record<NoticeKind, { label: string; color: string; icon: LucideIcon }> = {
  obstruccion: { label: "Obstrucción", color: "#ba1a1a", icon: TriangleAlert },
  lodo_agua: { label: "Lodo o agua", color: "#2563a8", icon: Waves },
  paso_dificil: { label: "Paso difícil", color: "#164525", icon: Mountain },
  chicken_line: { label: "Chicken line", color: "#6b4e2c", icon: GitFork },
  comentario: { label: "Comentario", color: "#414941", icon: MessageCircle },
};

export const kmLabel = (km: number) => `Km ${km.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

/** Avisos ordenados por km; su número en mapa, perfil y listas es la posición + 1. */
export const notices = (annotations: RouteAnnotation[]) => annotations.filter((a) => a.kind !== "traccion").sort((a, b) => a.km - b.km);

/** `id`: la marca que abre el tramo (null en el tramo sin marcar). */
export type TractionSegment = { id: string | null; traction: Traction | null; from: number; to: number };

/** Cada marca de tracción vale desde su km hasta la siguiente o el final; antes de la primera, "sin marcar" (traction null). */
export function tractionSegments(annotations: RouteAnnotation[], totalKm: number): TractionSegment[] {
  const marks = annotations.filter((a) => a.kind === "traccion").sort((a, b) => a.km - b.km);
  const out: TractionSegment[] = [];
  const first = marks[0]?.km ?? totalKm;
  if (first > 0) out.push({ id: null, traction: null, from: 0, to: first });
  // una marca en el último km da un tramo de largo 0: se conserva para poder editarla o borrarla
  marks.forEach((m, i) => out.push({ id: m.id, traction: m.traction, from: m.km, to: Math.max(Math.min(marks[i + 1]?.km ?? totalKm, totalKm), m.km) }));
  return out;
}

/** Km acumulado en cada vértice del trazo: el mismo que da el perfil de altitud. */
export function lineKm(line: [number, number][]) {
  const km = [0];
  for (let i = 1; i < line.length; i++) {
    km.push(km[i - 1] + haversineM({ lng: line[i - 1][0], lat: line[i - 1][1] }, { lng: line[i][0], lat: line[i][1] }) / 1000);
  }
  return km;
}

/** Vértice del trazo más cercano a un punto. ponytail: en una ruta que repite camino gana el primero; elegir en el perfil lo resuelve. */
export function nearestVertex(line: [number, number][], [lng, lat]: [number, number]) {
  let best = 0;
  let bestM = Infinity;
  line.forEach((p, i) => {
    const m = haversineM({ lng, lat }, { lng: p[0], lat: p[1] });
    if (m < bestM) [best, bestM] = [i, m];
  });
  return best;
}

/** Vértices del tramo [from, to], incluido el anterior y el siguiente para que no queden huecos entre tramos. */
export function sliceLine(line: [number, number][], km: number[], from: number, to: number) {
  let i = 0;
  while (i + 1 < km.length && km[i + 1] <= from) i++;
  let j = i;
  while (j + 1 < km.length && km[j] < to) j++;
  return line.slice(i, j + 1);
}

/**
 * Lo que toca avisar en el recorrido. `km`: dónde vas sobre la ida (de regreso, total − lo regresado); `back`: de regreso
 * "adelante" es km decreciente; `seen`: ids ya avisados en este recorrido.
 * `notice`: el aviso más cercano adelante, de 30 m atrás a 250 m adelante sobre la ruta, con los metros en línea recta.
 * `traction`: el tramo marcado en que vas si cambia la tracción respecto al anterior, con lo que falta de él.
 */
export function upcoming(annotations: RouteAnnotation[], totalKm: number, km: number, back: boolean, pos: [number, number], seen: Set<string>) {
  const dir = back ? -1 : 1;
  const notice = notices(annotations)
    .map((a) => ({ a, ahead: (a.km - km) * dir }))
    .filter(({ a, ahead }) => !seen.has(a.id) && ahead >= -0.03 && ahead <= 0.25)
    .sort((x, y) => x.ahead - y.ahead)[0]?.a;
  const segments = tractionSegments(annotations, totalKm);
  const i = segments.findIndex((s) => (back ? s.from < km && km <= s.to : s.from <= km && km < s.to));
  const seg = segments[i];
  const before = segments[i - dir]?.traction ?? null;
  // sin marcar no avisa; "normal" solo al salir de 4H o 4L
  const changed = !!seg?.id && !!seg.traction && seg.traction !== before && (seg.traction !== "normal" || !!before);
  return {
    notice: notice && { annotation: notice, m: haversineM({ lng: pos[0], lat: pos[1] }, notice) },
    traction: changed && !seen.has(seg.id!) ? { segment: seg, leftKm: back ? km - seg.from : seg.to - km } : null,
  };
}
