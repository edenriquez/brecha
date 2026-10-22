import "server-only";
import { cache } from "react";
import type { RouteSummary } from "@/lib/routes";
import { PERSON_COLUMNS, UUID_RE, type Profile } from "@/lib/profiles";
import { SUMMARY_COLUMNS } from "@/lib/routes.server";
import { createAnonClient } from "@/lib/supabase/server";

/** Perfil público; null si el id no es de nadie. cache(): lo piden generateMetadata y la página. */
export const getProfile = cache(async (id: string): Promise<Profile | null> => {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await createAnonClient().from("profiles").select(`${PERSON_COLUMNS}, bio, home_area, created_at`).eq("id", id).maybeSingle();
  if (error) throw new Error(`profile ${id}: ${error.message}`);
  return data as Profile | null;
});

export type ProfilePhoto = { id: string; url: string; caption: string | null; route: { slug: string; name: string } };

export type ProfileActivity = {
  routes: RouteSummary[];
  photos: ProfilePhoto[];
  counts: { routes: number; organized: number; walked: number; photos: number; reports: number };
};

/**
 * Lo que alguien aportó a la comunidad. Las salidas a las que se inscribió solo se cuentan, ya pasadas:
 * listar las próximas diría dónde va a estar.
 */
export async function getProfileActivity(id: string): Promise<ProfileActivity> {
  const supabase = createAnonClient();
  const now = new Date().toISOString();
  const [routes, photos, organized, walked, reports] = await Promise.all([
    supabase.from("routes_feed").select(SUMMARY_COLUMNS, { count: "exact" }).eq("created_by", id).order("name").limit(12),
    supabase
      .from("route_photos")
      .select("id, path, caption, route:routes!inner(slug, name)", { count: "exact" })
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("outings").select("id", { count: "exact", head: true }).eq("organizer_id", id).eq("status", "abierta"),
    supabase
      .from("outing_members")
      .select("outing_id, outing:outings!inner(id)", { count: "exact", head: true })
      .eq("user_id", id)
      .eq("outing.status", "abierta")
      .lt("outing.starts_at", now),
    supabase.from("trail_reports").select("id", { count: "exact", head: true }).eq("user_id", id),
  ]);
  for (const [name, r] of Object.entries({ routes, photos, organized, walked, reports })) {
    if (r.error) throw new Error(`perfil ${id} ${name}: ${r.error.message}`);
  }
  const storage = supabase.storage.from("route-photos");
  return {
    routes: routes.data as unknown as RouteSummary[],
    photos: (photos.data as unknown as (Omit<ProfilePhoto, "url"> & { path: string })[]).map(({ path, ...p }) => ({ ...p, url: storage.getPublicUrl(path).data.publicUrl })),
    counts: { routes: routes.count ?? 0, organized: organized.count ?? 0, walked: walked.count ?? 0, photos: photos.count ?? 0, reports: reports.count ?? 0 },
  };
}
