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

export type RouteDetail = RouteSummary & { description: string | null; created_by: string | null };

export type RouteStatus = "revision" | "publicada" | "rechazada";

export const ROUTE_STATUS: Record<RouteStatus, { label: string; tone: "neutral" | "primary" | "error" }> = {
  revision: { label: "En revisión", tone: "neutral" },
  publicada: { label: "Publicada", tone: "primary" },
  rechazada: { label: "No publicada", tone: "error" },
};

/** Lo que se edita de una ruta (el formulario de subir y el de editar) */
export type RouteFields = {
  name: string;
  place_label: string;
  difficulty: Difficulty;
  route_type: RouteSummary["route_type"];
  duration_min: number;
  description: string;
  tags: string;
  cover_url: string | null;
};

export const ROUTE_FIELDS_COLUMNS = "name, place_label, difficulty, route_type, duration_min, description, tags, cover_url";

export function toRouteFields(row: Omit<RouteFields, "description" | "tags"> & { description: string | null; tags: string[] }): RouteFields {
  return { ...row, description: row.description ?? "", tags: row.tags.join(", ") };
}

export type RouteShape = {
  line: [number, number][];
  /** [km, altitud m, lng, lat] */
  profile: [number, number, number, number][] | null;
  gpxUrl: string | null;
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

/** "Cerro del Tepozteco (Vía Corta)" → "cerro-del-tepozteco-via-corta". Nunca "nueva": es la página para subir rutas. */
export function slugify(text: string) {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return !slug || slug === "nueva" ? `ruta-${slug || "sin-nombre"}` : slug;
}

export function outingsLabel(n: number) {
  return n === 1 ? "1 salida próxima" : `${n} salidas próximas`;
}

export function googleMapsDirections(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function googleMapsSearch(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
