"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth.server";
import { ANSWERABLE, NOTE_MAX, NOTICE, TRACTION, type AnnotationKind, type RouteAnnotation } from "@/lib/annotations";

export type AnnotationResult = { error: string | null };
export type AnnotationInput = Pick<RouteAnnotation, "kind" | "traction" | "km" | "lng" | "lat" | "note"> & { id?: string };

type Target = { id: string; slug: string };

const finite = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

function revalidate(slug: string) {
  revalidatePath(`/rutas/${slug}`);
  revalidatePath(`/rutas/${slug}/anotaciones`);
}

/** Alta (sin `id`) o edición de una anotación; el RLS deja escribir solo a quien subió la ruta o a la moderación. */
export async function saveAnnotation(route: Target, input: AnnotationInput): Promise<AnnotationResult> {
  const { supabase } = await requireUser(`/rutas/${route.slug}/anotaciones`);
  const kind = input.kind as AnnotationKind;
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (kind !== "traccion" && !(kind in NOTICE)) return { error: "Elige qué quieres marcar." };
  if (kind === "traccion" && !(typeof input.traction === "string" && input.traction in TRACTION)) return { error: "Elige la tracción: Normal, 4H o 4L." };
  if (kind === "comentario" && !note) return { error: "Escribe el comentario." };
  if (note.length > NOTE_MAX) return { error: `La nota no puede pasar de ${NOTE_MAX} caracteres.` };
  if (!finite(input.lng, -180, 180) || !finite(input.lat, -90, 90)) return { error: "Elige un punto en el mapa o el perfil." };

  const { data: target } = await supabase.from("routes").select("distance_km").eq("id", route.id).maybeSingle();
  if (!target) return { error: "No encontramos la ruta." };
  if (!finite(input.km, 0, Number(target.distance_km))) return { error: "Ese punto queda fuera de la ruta." };

  const row = { kind, traction: kind === "traccion" ? input.traction : null, km: Math.round(input.km * 100) / 100, lng: input.lng, lat: input.lat, note: note || null };
  const { data, error } = input.id
    ? await supabase.from("route_annotations").update(row).eq("id", input.id).eq("route_id", route.id).select("id")
    : await supabase.from("route_annotations").insert({ ...row, route_id: route.id }).select("id");
  if (error) {
    if (error.code === "23505") return { error: "Ya hay una marca de tracción en ese punto: edítala." };
    // 42501: el RLS rechazó el insert
    if (error.code === "42501") return { error: "Solo quien subió la ruta puede anotarla." };
    console.error("saveAnnotation:", error.message);
    return { error: "No pudimos guardar la anotación. Intenta de nuevo." };
  }
  if (!data.length) return { error: "Solo quien subió la ruta puede anotarla." };
  revalidate(route.slug);
  return { error: null };
}

export async function deleteAnnotation(route: Target, id: string): Promise<AnnotationResult> {
  const { supabase } = await requireUser(`/rutas/${route.slug}/anotaciones`);
  const { data, error } = await supabase.from("route_annotations").delete().eq("id", id).eq("route_id", route.id).select("id");
  if (error) {
    console.error("deleteAnnotation:", error.message);
    return { error: "No pudimos borrar la anotación. Intenta de nuevo." };
  }
  if (!data.length) return { error: "Solo quien subió la ruta puede borrar sus anotaciones." };
  revalidate(route.slug);
  return { error: null };
}

/** Vuelve a mostrar un aviso oculto: cualquier update sube su `updated_at` y las respuestas anteriores dejan de contar. */
export async function reactivateAnnotation(route: Target, id: string, kind: AnnotationKind): Promise<AnnotationResult> {
  const { supabase } = await requireUser(`/rutas/${route.slug}/anotaciones`);
  if (!ANSWERABLE.includes(kind)) return { error: "Ese aviso no se oculta." };
  // el mismo tipo en el set y en el filtro: no cambia ningún valor
  const { data, error } = await supabase.from("route_annotations").update({ kind }).eq("id", id).eq("route_id", route.id).eq("kind", kind).select("id");
  if (error) {
    console.error("reactivateAnnotation:", error.message);
    return { error: "No pudimos reactivar el aviso. Intenta de nuevo." };
  }
  if (!data.length) return { error: "Solo quien subió la ruta puede reactivar sus avisos." };
  revalidate(route.slug);
  return { error: null };
}
