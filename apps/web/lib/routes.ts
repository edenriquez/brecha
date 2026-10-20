export type Difficulty = "facil" | "moderada" | "dificil" | "experto";

export type RouteSummary = {
  id: string;
  slug: string;
  name: string;
  place_label: string;
  difficulty: Difficulty;
  route_type: "ida_vuelta" | "circular" | "solo_ida";
  distance_km: number;
  elevation_gain_m: number;
  duration_min: number;
  cover_url: string | null;
  tags: string[];
  lat: number;
  lng: number;
  upcoming_outings: number;
};

export const DIFFICULTY: Record<Difficulty, { label: string; dot: string }> = {
  facil: { label: "Fácil", dot: "bg-facil" },
  moderada: { label: "Moderada", dot: "bg-moderada" },
  dificil: { label: "Difícil", dot: "bg-dificil" },
  experto: { label: "Experto", dot: "bg-experto" },
};

export function formatKm(km: number) {
  return `${Number(km).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km`;
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function outingsLabel(n: number) {
  return n === 1 ? "1 salida próxima" : `${n} salidas próximas`;
}
