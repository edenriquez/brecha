"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth.server";

export type ReviewState = { error: string | null };

type Target = { id: string; slug: string };

/** El RLS solo deja a la moderación actualizar rutas ajenas: sin filas afectadas, no modera. */
async function review(route: Target, patch: { status: "publicada" | "rechazada"; review_note: string | null }): Promise<ReviewState> {
  const { supabase } = await requireUser(`/revision/${route.slug}`);
  const { data, error } = await supabase.from("routes").update(patch).eq("id", route.id).select("id");
  if (error) {
    console.error("review:", error.message);
    return { error: "No pudimos guardar la revisión. Intenta de nuevo." };
  }
  if (!data.length) return { error: "Solo la moderación revisa rutas." };
  revalidatePath("/");
  revalidatePath(`/rutas/${route.slug}`);
  revalidatePath("/revision");
  revalidatePath("/mis-rutas");
  redirect("/revision");
}

export async function approveRoute(route: Target): Promise<ReviewState> {
  return review(route, { status: "publicada", review_note: null });
}

export async function rejectRoute(route: Target, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  const note = String(form.get("note") ?? "").trim();
  if (note.length < 10 || note.length > 1000) return { error: "Explica en 10 a 1,000 caracteres qué hay que corregir." };
  return review(route, { status: "rechazada", review_note: note });
}

export async function resolveSuggestion(id: string) {
  const { supabase } = await requireUser("/revision");
  const { error } = await supabase.from("route_suggestions").update({ status: "resuelta", resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("resolveSuggestion:", error.message);
  revalidatePath("/revision");
}
