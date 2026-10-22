import { formatDuration, formatKm } from "@/lib/routes";
import { outingDateParts, type OutingDetail } from "@/lib/outings";

export type CalendarEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
  url: string;
  cancelled: boolean;
  updated: Date;
};

/** El evento dura lo que la ruta; el traslado al inicio del sendero no se conoce. */
export function outingEvent(outing: OutingDetail, url: string): CalendarEvent {
  const { route } = outing;
  const start = new Date(outing.starts_at);
  const description = [
    `Salida en grupo a ${route.name} (${route.place_label}).`,
    `Cita a las ${outingDateParts(outing.starts_at).time} en ${outing.meeting_point_label}.`,
    `Ruta: ${formatKm(route.distance_km)} · ↑ ${route.elevation_gain_m.toLocaleString("es-MX")} m · ${formatDuration(route.duration_min)} aprox.`,
    ...(outing.notes ? ["", "Notas de quien organiza:", outing.notes] : []),
    "",
    `Detalles y lista de asistentes: ${url}`,
  ].join("\n");
  return {
    uid: `${outing.id}@brecha`,
    title: outing.title,
    start,
    end: new Date(start.getTime() + route.duration_min * 60_000),
    location: outing.meeting_point_label,
    description,
    url,
    cancelled: outing.status === "cancelada",
    updated: new Date(outing.updated_at),
  };
}

/** 20261025T130000Z */
function utcStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(e: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545: líneas de máximo 75 octetos, las siguientes empiezan con un espacio. */
function fold(line: string) {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 75) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

export function toICS(e: CalendarEvent) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Brecha//Salidas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    // los calendarios reemplazan el evento importado antes si la secuencia es mayor
    `SEQUENCE:${Math.floor(e.updated.getTime() / 1000)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `LOCATION:${escapeText(e.location)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    `URL:${e.url}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-P1D",
    `DESCRIPTION:${escapeText(`Mañana: ${e.title}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
