"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth.server";
import { PHOTOS_PER_UPLOAD, REPORT_WINDOW_DAYS, shiftDay, TRAIL_ISSUES, TRAIL_STATUS } from "@/lib/community";
import { todayInMexicoCity } from "@/lib/outings";

export type CommunityState = { error: string | null; done: boolean };

type Target = { id: string; slug: string };
type NewPhoto = { path: string; caption: string; width: number; height: number };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function parsePhotos(raw: string, userId: string): NewPhoto[] | null {
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || !list.length || list.length > PHOTOS_PER_UPLOAD) return null;
  const path = new RegExp(`^${userId}/${UUID}\\.jpg$`);
  const size = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 4000;
  const photos = list.map((p) => ({ path: String(p?.path ?? ""), caption: String(p?.caption ?? "").trim(), width: p?.width, height: p?.height }));
  return photos.every((p) => path.test(p.path) && p.caption.length <= 140 && size(p.width) && size(p.height)) ? photos : null;
}

/** El navegador ya subió las fotos (reducidas, en JPEG) a la carpeta del usuario; aquí se registran. */
export async function addRoutePhotos(route: Target, _prev: CommunityState, form: FormData): Promise<CommunityState> {
  const { supabase, user } = await requireUser(`/rutas/${route.slug}`);
  const photos = parsePhotos(String(form.get("photos") ?? ""), user.id);
  if (!photos) return { error: `Elige de 1 a ${PHOTOS_PER_UPLOAD} fotos y usa descripciones de máximo 140 caracteres.`, done: false };

  const { error } = await supabase
    .from("route_photos")
    .insert(photos.map((p) => ({ route_id: route.id, path: p.path, caption: p.caption || null, width: p.width, height: p.height })));
  if (error) {
    await supabase.storage.from("route-photos").remove(photos.map((p) => p.path));
    // 23514: limit_route_photos
    if (error.code === "23514") return { error: `${error.message}.`, done: false };
    console.error("addRoutePhotos:", error.message);
    return { error: "No pudimos publicar las fotos. Intenta de nuevo.", done: false };
  }
  revalidatePath(`/rutas/${route.slug}`);
  return { error: null, done: true };
}

/** Quien la subió o la moderación; las políticas de storage dejan a ambos borrar también el archivo. */
export async function deleteRoutePhoto(photo: { id: string; path: string; slug: string }): Promise<CommunityState> {
  const { supabase } = await requireUser(`/rutas/${photo.slug}`);
  const { data, error } = await supabase.from("route_photos").delete().eq("id", photo.id).select("id");
  if (error) {
    console.error("deleteRoutePhoto:", error.message);
    return { error: "No pudimos borrar la foto. Intenta de nuevo.", done: false };
  }
  if (!data.length) return { error: "Solo quien subió la foto puede borrarla.", done: false };
  const removed = await supabase.storage.from("route-photos").remove([photo.path]);
  if (removed.error) console.error("deleteRoutePhoto storage:", removed.error.message);
  revalidatePath(`/rutas/${photo.slug}`);
  return { error: null, done: true };
}

export async function reportTrailConditions(route: Target, _prev: CommunityState, form: FormData): Promise<CommunityState> {
  const { supabase } = await requireUser(`/rutas/${route.slug}`);
  const status = String(form.get("status") ?? "");
  const issues = [...new Set(form.getAll("issues").map(String))];
  const visitedOn = String(form.get("visited_on") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const today = todayInMexicoCity();

  if (!(status in TRAIL_STATUS)) return { error: "Elige cómo estaba el sendero.", done: false };
  if (!issues.every((i) => i in TRAIL_ISSUES)) return { error: "Elige solo detalles de la lista.", done: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) || visitedOn > today || visitedOn < shiftDay(today, -REPORT_WINDOW_DAYS)) {
    return { error: `La fecha de tu visita debe ser de los últimos ${REPORT_WINDOW_DAYS} días.`, done: false };
  }
  if (note.length > 500) return { error: "La nota no puede pasar de 500 caracteres.", done: false };

  const { error } = await supabase.from("trail_reports").insert({ route_id: route.id, status, issues, visited_on: visitedOn, note: note || null });
  if (error) {
    if (error.code === "23505") return { error: "Ya reportaste esa fecha en esta ruta.", done: false };
    console.error("reportTrailConditions:", error.message);
    return { error: "No pudimos guardar tu reporte. Intenta de nuevo.", done: false };
  }
  revalidatePath(`/rutas/${route.slug}`);
  return { error: null, done: true };
}

export async function deleteTrailReport(report: { id: string; slug: string }): Promise<CommunityState> {
  const { supabase } = await requireUser(`/rutas/${report.slug}`);
  const { data, error } = await supabase.from("trail_reports").delete().eq("id", report.id).select("id");
  if (error) {
    console.error("deleteTrailReport:", error.message);
    return { error: "No pudimos borrar el reporte. Intenta de nuevo.", done: false };
  }
  if (!data.length) return { error: "Solo quien hizo el reporte puede borrarlo.", done: false };
  revalidatePath(`/rutas/${report.slug}`);
  return { error: null, done: true };
}
