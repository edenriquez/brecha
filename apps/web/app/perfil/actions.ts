"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth.server";
import { AREA_MAX, BIO_MAX, NAME_MAX, NAME_MIN, profileHref } from "@/lib/profiles";

export type ProfileState = { error: string | null };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * `avatar`: "keep", "remove" (también quita la de Google) o la ruta que el navegador ya subió a avatars/<uid>/.
 * La foto anterior subida a Brecha se borra al reemplazarla o quitarla.
 */
export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const { supabase, user } = await requireUser("/perfil");
  const name = String(form.get("display_name") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const area = String(form.get("home_area") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const bio = String(form.get("bio") ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const avatar = String(form.get("avatar") ?? "keep");
  const uploaded = new RegExp(`^${user.id}/${UUID}\\.jpg$`).test(avatar) ? avatar : null;
  const discard = async () => {
    if (uploaded) await supabase.storage.from("avatars").remove([uploaded]);
  };

  let error: string | null = null;
  if (name.length < NAME_MIN || name.length > NAME_MAX) error = `Tu nombre debe tener de ${NAME_MIN} a ${NAME_MAX} caracteres.`;
  else if (area.length > AREA_MAX) error = `La zona no puede pasar de ${AREA_MAX} caracteres.`;
  else if (bio.length > BIO_MAX) error = `La presentación no puede pasar de ${BIO_MAX} caracteres.`;
  else if (avatar !== "keep" && avatar !== "remove" && !uploaded) error = "No pudimos usar esa foto. Elígela de nuevo.";
  if (error) {
    await discard();
    return { error };
  }

  const { data: current } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  const changes: Record<string, string | null> = { display_name: name, home_area: area || null, bio: bio || null };
  if (uploaded) changes.avatar_path = uploaded;
  if (avatar === "remove") Object.assign(changes, { avatar_path: null, avatar_url: null });

  const { error: dbError } = await supabase.from("profiles").update(changes).eq("id", user.id);
  if (dbError) {
    await discard();
    console.error("updateProfile:", dbError.message);
    return { error: "No pudimos guardar tu perfil. Intenta de nuevo." };
  }
  if (current?.avatar_path && avatar !== "keep") {
    const removed = await supabase.storage.from("avatars").remove([current.avatar_path]);
    if (removed.error) console.error("updateProfile storage:", removed.error.message);
  }

  revalidatePath(profileHref(user.id));
  redirect(profileHref(user.id));
}
