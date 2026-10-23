"use server";

import { requireUser } from "@/lib/auth.server";
import { DETAILS_MAX, REASONS_FOR, type ReportReason, type ReportTarget } from "@/lib/moderation";

export type ReportState = { error: string | null; done: boolean };

export async function reportContent(target: ReportTarget & { back: string }, _prev: ReportState, form: FormData): Promise<ReportState> {
  const { supabase } = await requireUser(target.back);
  const reason = String(form.get("reason") ?? "") as ReportReason;
  const details = String(form.get("details") ?? "").trim();

  if (!REASONS_FOR[target.type]?.includes(reason)) return { error: "Elige un motivo.", done: false };
  if (reason === "otro" && details.length < 10) return { error: "Cuéntanos en al menos 10 caracteres qué pasa.", done: false };
  if (details.length > DETAILS_MAX) return { error: `El detalle no puede pasar de ${DETAILS_MAX} caracteres.`, done: false };

  const { error } = await supabase.from("content_reports").insert({ target_type: target.type, target_id: target.id, reason, details: details || null });
  if (error) {
    if (error.code === "23505") return { error: "Ya lo reportaste; la moderación lo está revisando.", done: false };
    // 23514: check_content_report (ya no existe, es tuyo o demasiados reportes)
    if (error.code === "23514") return { error: `${error.message}.`, done: false };
    console.error("reportContent:", error.message);
    return { error: "No pudimos enviar el reporte. Intenta de nuevo.", done: false };
  }
  return { error: null, done: true };
}
