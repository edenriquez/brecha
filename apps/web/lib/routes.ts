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

export type RouteDetail = RouteSummary & { description: string | null };

export type OutingSummary = {
  id: string;
  title: string;
  starts_at: string;
  meeting_point_label: string;
  capacity: number;
  members: number;
};

export const ROUTE_TYPE: Record<RouteSummary["route_type"], string> = {
  ida_vuelta: "Ida y vuelta",
  circular: "Circular",
  solo_ida: "Solo ida",
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

// Las fechas se muestran en hora del centro de México aunque el render corra en otra zona (Vercel usa UTC)
const TZ = "America/Mexico_City";

export function outingDateParts(iso: string) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, ...o }).format(d);
  return {
    weekday: part({ weekday: "short" }).replace(".", "").toUpperCase(),
    day: part({ day: "numeric" }),
    month: part({ month: "short" }).replace(".", "").toUpperCase(),
    time: part({ hour: "numeric", minute: "2-digit" }),
  };
}

export function spotsLabel(capacity: number, members: number) {
  const left = Math.max(capacity - members, 0);
  if (!left) return "Llena";
  return left === 1 ? "Queda 1 lugar" : `Quedan ${left} lugares`;
}

export function googleMapsDirections(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
