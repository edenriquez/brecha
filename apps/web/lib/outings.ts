import type { RouteSummary } from "@/lib/routes";

export type OutingLevel = "principiante" | "intermedio" | "avanzado";
export type OutingPace = "relajado" | "moderado" | "rapido";

export const LEVEL: Record<OutingLevel, string> = { principiante: "Principiante", intermedio: "Intermedio", avanzado: "Avanzado" };
export const PACE: Record<OutingPace, string> = { relajado: "Relajado", moderado: "Moderado", rapido: "Rápido" };

export type OutingSummary = {
  id: string;
  title: string;
  starts_at: string;
  meeting_point_label: string;
  capacity: number;
  members: number;
};

export type OutingRoute = Pick<RouteSummary, "id" | "slug" | "name" | "place_label" | "difficulty" | "cover_url" | "distance_km" | "elevation_gain_m" | "duration_min">;

export type OutingCardData = OutingSummary & { route: OutingRoute };

export type Person = { id: string; display_name: string | null; avatar_url: string | null };

export type OutingStatus = "abierta" | "cancelada";

export type OutingDetail = OutingCardData & {
  level: OutingLevel;
  pace: OutingPace;
  notes: string | null;
  status: OutingStatus;
  organizer: Person;
  attendees: Person[];
};

/** Salida en "Mis salidas": la mía como organizador o en la que me inscribí. */
export type MyOuting = OutingCardData & { status: OutingStatus; organizer_id: string };

export function isOutingOpen(outing: { status: OutingStatus; starts_at: string }) {
  return outing.status === "abierta" && new Date(outing.starts_at) > new Date();
}

// Las fechas se muestran y capturan en hora del centro de México aunque el render corra en otra zona (Vercel usa UTC)
export const TZ = "America/Mexico_City";

/** Fecha y hora locales del formulario a ISO. México no tiene horario de verano desde 2022: el offset es fijo. */
export function mexicoCityISO(date: string, time: string) {
  return `${date}T${time}:00-06:00`;
}

/** Inverso de mexicoCityISO: fecha y hora de CDMX para precargar el formulario al editar. */
export function mexicoCityFields(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

/** Hoy en CDMX como YYYY-MM-DD, para el mínimo del selector de fecha. */
export function todayInMexicoCity() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function outingDateParts(iso: string) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, ...o }).format(d);
  return {
    weekday: part({ weekday: "short" }).replace(".", "").toUpperCase(),
    day: part({ day: "numeric" }),
    month: part({ month: "short" }).replace(".", "").toUpperCase(),
    time: part({ hour: "numeric", minute: "2-digit" }),
    long: part({ weekday: "long", day: "numeric", month: "long" }),
  };
}

export function spotsLabel(capacity: number, members: number) {
  const left = Math.max(capacity - members, 0);
  if (!left) return "Llena";
  return left === 1 ? "Queda 1 lugar" : `Quedan ${left} lugares`;
}

export function initials(name: string | null) {
  const parts = (name ?? "?").trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
