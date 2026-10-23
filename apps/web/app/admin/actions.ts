"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth.server";
import { SUSPENSION_DAYS, type ReportTarget, type SuspensionChoice } from "@/lib/moderation";
import { profileHref } from "@/lib/profiles";

export type ModerationState = { error: string | null };

const DAY_MS = 86_400_000;

async function closeReports(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], userId: string, target: ReportTarget, status: "resuelto" | "descartado") {
  const { error } = await supabase
    .from("content_reports")
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("target_type", target.type)
    .eq("target_id", target.id)
    .eq("status", "abierto");
  if (error) throw new Error(`cerrar reportes: ${error.message}`);
}

/** No hacía falta actuar: los reportes se cierran sin tocar el contenido. */
export async function dismissReports(target: ReportTarget): Promise<ModerationState> {
  const { supabase, user } = await requireAdmin("/admin");
  await closeReports(supabase, user.id, target, "descartado");
  revalidatePath("/admin");
  return { error: null };
}

/** Borra la foto o el reporte, cancela la salida o limpia el perfil (nombre, zona, bio y foto), y cierra sus reportes. */
export async function removeReportedContent(target: ReportTarget): Promise<ModerationState> {
  const { supabase, user } = await requireAdmin("/admin");
  const fail = (what: string, message: string) => {
    console.error(`removeReportedContent ${what}:`, message);
    return { error: "No pudimos quitar el contenido. Intenta de nuevo." };
  };

  if (target.type === "foto") {
    const { data, error } = await supabase.from("route_photos").delete().eq("id", target.id).select("path, route:routes(slug)").maybeSingle();
    if (error) return fail("foto", error.message);
    if (data) {
      const removed = await supabase.storage.from("route-photos").remove([data.path]);
      if (removed.error) console.error("removeReportedContent storage:", removed.error.message);
      const route = data.route as unknown as { slug: string } | null;
      if (route) revalidatePath(`/rutas/${route.slug}`);
    }
  } else if (target.type === "reporte") {
    const { data, error } = await supabase.from("trail_reports").delete().eq("id", target.id).select("route:routes(slug)").maybeSingle();
    if (error) return fail("reporte", error.message);
    const route = data?.route as unknown as { slug: string } | null;
    if (route) revalidatePath(`/rutas/${route.slug}`);
  } else if (target.type === "salida") {
    const { data: outing } = await supabase.from("outings").select("status, starts_at, route:routes(slug)").eq("id", target.id).maybeSingle();
    // ya cancelada o ya pasó: el trigger no deja cambiarla y no hay nada que cancelar
    if (outing && outing.status === "abierta" && new Date(outing.starts_at) > new Date()) {
      const { error } = await supabase.from("outings").update({ status: "cancelada" }).eq("id", target.id);
      if (error) return fail("salida", error.message);
      const route = outing.route as unknown as { slug: string } | null;
      if (route) revalidatePath(`/rutas/${route.slug}`);
      revalidatePath("/");
    }
  } else {
    const { data: profile } = await supabase.from("profiles").select("avatar_path").eq("id", target.id).maybeSingle();
    const { error } = await supabase.from("profiles").update({ display_name: null, home_area: null, bio: null, avatar_path: null, avatar_url: null }).eq("id", target.id);
    if (error) return fail("perfil", error.message);
    if (profile?.avatar_path) {
      const removed = await supabase.storage.from("avatars").remove([profile.avatar_path]);
      if (removed.error) console.error("removeReportedContent avatar:", removed.error.message);
    }
    revalidatePath(profileHref(target.id));
  }

  await closeReports(supabase, user.id, target, "resuelto");
  revalidatePath("/admin");
  return { error: null };
}

export async function suspendUser(userId: string, _prev: ModerationState, form: FormData): Promise<ModerationState> {
  const { supabase, user } = await requireAdmin("/admin");
  const choice = String(form.get("days") ?? "") as SuspensionChoice;
  const reason = String(form.get("reason") ?? "").trim();
  if (!(choice in SUSPENSION_DAYS)) return { error: "Elige cuánto dura la suspensión." };
  if (reason.length < 5 || reason.length > 500) return { error: "Explica el motivo en 5 a 500 caracteres; la persona lo verá." };
  if (userId === user.id) return { error: "No puedes suspenderte a ti." };

  const until = choice === "siempre" ? null : new Date(Date.now() + Number(choice) * DAY_MS).toISOString();
  const updated = await supabase.from("user_suspensions").update({ until, reason }).eq("user_id", userId).select("user_id");
  const { error } = updated.error || updated.data?.length ? updated : await supabase.from("user_suspensions").insert({ user_id: userId, until, reason });
  if (error) {
    console.error("suspendUser:", error.message);
    return { error: "No pudimos suspender la cuenta. Intenta de nuevo." };
  }
  revalidatePath("/admin");
  return { error: null };
}

export async function liftSuspension(userId: string): Promise<ModerationState> {
  const { supabase } = await requireAdmin("/admin");
  const { error } = await supabase.from("user_suspensions").delete().eq("user_id", userId);
  if (error) {
    console.error("liftSuspension:", error.message);
    return { error: "No pudimos levantar la suspensión. Intenta de nuevo." };
  }
  revalidatePath("/admin");
  return { error: null };
}
