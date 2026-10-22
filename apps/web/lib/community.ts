import { todayInMexicoCity, type Person } from "@/lib/outings";

/** Lo mismo que limit_route_photos y la política de trail_reports en la base. */
export const PHOTOS_PER_ROUTE = 12;
export const PHOTOS_PER_UPLOAD = 6;
export const REPORT_WINDOW_DAYS = 60;
/** Reportes más viejos ya no dicen cómo está el sendero hoy. */
export const RECENT_REPORT_DAYS = 90;

export type RoutePhoto = {
  id: string;
  url: string;
  path: string;
  caption: string | null;
  width: number;
  height: number;
  created_at: string;
  author: Person;
};

export type TrailStatus = "bien" | "precaucion" | "cerrada";

export const TRAIL_STATUS: Record<TrailStatus, { label: string; badge: string; dot: string }> = {
  bien: { label: "En buenas condiciones", badge: "bg-primary-fixed text-on-primary-fixed-variant", dot: "bg-primary" },
  precaucion: { label: "Con precaución", badge: "bg-secondary-fixed text-secondary", dot: "bg-secondary" },
  cerrada: { label: "Cerrada o intransitable", badge: "bg-error/10 text-error", dot: "bg-error" },
};

export const TRAIL_ISSUES = {
  lodo: "Lodo",
  agua: "Cruces de agua crecidos",
  obstaculos: "Árboles caídos u obstáculos",
  senalizacion: "Mal señalizado",
  acceso: "Acceso cerrado o cambiado",
  cobro: "Cobran la entrada",
  basura: "Basura",
  concurrido: "Mucha gente",
  inseguridad: "Inseguridad",
} as const;

export type TrailIssue = keyof typeof TRAIL_ISSUES;

export type TrailReport = {
  id: string;
  visited_on: string;
  status: TrailStatus;
  issues: TrailIssue[];
  note: string | null;
  author: Person;
};

const DAY_MS = 86_400_000;

/** YYYY-MM-DD de CDMX desplazado `days` días. */
export function shiftDay(ymd: string, days: number) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "hoy", "ayer", "hace 5 días", "hace 3 semanas" para una fecha YYYY-MM-DD. */
export function daysAgoLabel(ymd: string) {
  const days = Math.round((Date.parse(`${todayInMexicoCity()}T00:00:00Z`) - Date.parse(`${ymd}T00:00:00Z`)) / DAY_MS);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  return `hace ${Math.floor(days / 7)} semanas`;
}
