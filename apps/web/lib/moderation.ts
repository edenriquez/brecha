import type { Person } from "@/lib/outings";

/** Lo mismo que los checks de content_reports. */
export type ReportTargetType = "perfil" | "salida" | "foto" | "reporte";
export type ReportReason = "spam" | "acoso" | "peligro" | "falso" | "suplantacion" | "otro";
export type ReportTarget = { type: ReportTargetType; id: string };

export const REPORT_REASONS: Record<ReportReason, string> = {
  spam: "Spam o publicidad",
  acoso: "Acoso, insultos o discriminación",
  peligro: "Pone en riesgo a otras personas",
  falso: "Información falsa o engañosa",
  suplantacion: "Se hace pasar por otra persona",
  otro: "Otra cosa",
};

export const REASONS_FOR: Record<ReportTargetType, ReportReason[]> = {
  perfil: ["suplantacion", "acoso", "spam", "otro"],
  salida: ["peligro", "falso", "acoso", "spam", "otro"],
  foto: ["acoso", "falso", "spam", "otro"],
  reporte: ["falso", "peligro", "acoso", "spam", "otro"],
};

export const TARGET_LABEL: Record<ReportTargetType, string> = {
  perfil: "Perfil",
  salida: "Salida",
  foto: "Foto",
  reporte: "Reporte del sendero",
};

/** Qué hace "quitar contenido" en cada tipo. */
export const REMOVE_LABEL: Record<ReportTargetType, string> = {
  perfil: "Limpiar perfil",
  salida: "Cancelar salida",
  foto: "Borrar foto",
  reporte: "Borrar reporte",
};

export const DETAILS_MAX = 500;

/** Ventana de outing_emergency_contacts() en la base. */
export const EMERGENCY_DAYS_BEFORE = 2;
export const EMERGENCY_DAYS_AFTER = 1;

export const SUSPENSION_DAYS = { "7": "7 días", "30": "30 días", siempre: "Hasta que la moderación la levante" } as const;
export type SuspensionChoice = keyof typeof SUSPENSION_DAYS;

export type EmergencyContact = { name: string; phone: string; relationship: string | null };

export type GroupEmergencyContact = { user_id: string; display_name: string | null; contact_name: string | null; phone: string | null; relationship: string | null };

export type OpenReport = { id: string; reason: ReportReason; details: string | null; created_at: string; reporter: Person };

/** Lo reportado, agrupado: varias personas pueden reportar lo mismo. `content` es null si ya se borró. */
export type ReportGroup = ReportTarget & {
  reports: OpenReport[];
  content: { title: string; text: string | null; image: string | null; href: string; author: Person | null; slug: string | null; path: string | null } | null;
};

export type Suspension = { user_id: string; until: string | null; reason: string; created_at: string; person: Person };

export function isActiveSuspension(s: { until: string | null }) {
  return s.until === null || new Date(s.until) > new Date();
}
