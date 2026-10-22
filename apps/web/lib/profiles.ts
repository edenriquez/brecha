import type { Person } from "@/lib/outings";

/** Columnas de Person para los embeds de profiles. */
export const PERSON_COLUMNS = "id, display_name, avatar_url, avatar_path";

/** Lo que valida updateProfile; la base solo pone topes más amplios. */
export const NAME_MIN = 2;
export const NAME_MAX = 50;
export const AREA_MAX = 60;
export const BIO_MAX = 280;

export type Profile = Person & { bio: string | null; home_area: string | null; created_at: string };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La foto subida a Brecha gana sobre la de Google. */
export function avatarSrc(person: Pick<Person, "avatar_url" | "avatar_path">) {
  if (person.avatar_path) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${person.avatar_path}`;
  return person.avatar_url;
}

export function personName(person: Pick<Person, "display_name">) {
  return person.display_name ?? "Senderista de Brecha";
}

export function profileHref(id: string) {
  return `/personas/${id}`;
}
