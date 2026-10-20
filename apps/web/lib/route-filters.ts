import { DIFFICULTY, ROUTE_TYPE, type Difficulty, type RouteSummary } from "@/lib/routes";

type Range = { id: string; label: string; min?: number; max?: number };

/** Rangos con mínimo exclusivo y máximo inclusivo: 5 km cae en "Hasta 5 km". */
export const RANGES = {
  distancia: {
    label: "Distancia",
    field: "distance_km",
    options: [
      { id: "corta", label: "Hasta 5 km", max: 5 },
      { id: "media", label: "5 a 10 km", min: 5, max: 10 },
      { id: "larga", label: "Más de 10 km", min: 10 },
    ],
  },
  desnivel: {
    label: "Desnivel",
    field: "elevation_gain_m",
    options: [
      { id: "bajo", label: "Hasta 400 m", max: 400 },
      { id: "medio", label: "400 a 800 m", min: 400, max: 800 },
      { id: "alto", label: "Más de 800 m", min: 800 },
    ],
  },
  duracion: {
    label: "Duración",
    field: "duration_min",
    options: [
      { id: "corta", label: "Hasta 2 h", max: 120 },
      { id: "media", label: "2 a 4 h", min: 120, max: 240 },
      { id: "larga", label: "Más de 4 h", min: 240 },
    ],
  },
} satisfies Record<string, { label: string; field: keyof RouteSummary; options: Range[] }>;

export type RangeKey = keyof typeof RANGES;
export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];
export const TYPE_KEY = "tipo";
export const DIFFICULTY_KEY = "dificultad";
export const QUERY_KEY = "q";

export function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function matchesQuery(haystack: string[], query: string) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = normalize(haystack.join(" "));
  return tokens.every((t) => text.includes(t));
}

export function routeHaystack(route: RouteSummary) {
  return [route.name, route.place_label, ...route.tags];
}

function inRange(value: number, range: Range) {
  return (range.min === undefined || value > range.min) && (range.max === undefined || value <= range.max);
}

/** Todo menos el texto: dificultad, rangos y tipo de recorrido. */
export function matchesFilters(route: RouteSummary, params: URLSearchParams) {
  const difficulty = params.get(DIFFICULTY_KEY);
  if (difficulty && difficulty in DIFFICULTY && route.difficulty !== (difficulty as Difficulty)) return false;
  const type = params.get(TYPE_KEY);
  if (type && type in ROUTE_TYPE && route.route_type !== type) return false;
  return RANGE_KEYS.every((key) => {
    const { field, options } = RANGES[key];
    const range = options.find((o) => o.id === params.get(key));
    return !range || inRange(Number(route[field]), range);
  });
}

/** Filtros del panel "Más filtros" activos (la dificultad y el texto tienen su propio control). */
export function countPanelFilters(params: URLSearchParams) {
  return [...RANGE_KEYS, TYPE_KEY].filter((key) => params.get(key)).length;
}
