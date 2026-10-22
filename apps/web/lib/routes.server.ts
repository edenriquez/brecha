import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineString } from "geojson";
import { createAnonClient } from "@/lib/supabase/server";
import { ROUTE_FIELDS_COLUMNS, toRouteFields, type RouteDetail, type RouteFields, type RouteShape, type RouteStatus, type RouteSummary } from "@/lib/routes";

const SUMMARY_COLUMNS = "id, slug, name, place_label, difficulty, route_type, distance_km, elevation_gain_m, duration_min, cover_url, tags, lat, lng, upcoming_outings";

export async function listRoutes(): Promise<RouteSummary[]> {
  // el build de CI corre sin Supabase: la página se prerenderiza vacía y en Vercel se llena con datos reales
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("routes_feed")
    .select(SUMMARY_COLUMNS)
    .eq("activity", "hiking")
    .order("upcoming_outings", { ascending: false })
    .order("name");
  if (error) throw new Error(`routes_feed: ${error.message}`);
  return data as RouteSummary[];
}

/** Ruta publicada por slug; null si no existe. cache(): la piden generateMetadata y la página en el mismo render. */
export const getRoute = cache(async (slug: string): Promise<RouteDetail | null> => {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("routes_feed").select(`${SUMMARY_COLUMNS}, description, created_by`).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`routes_feed ${slug}: ${error.message}`);
  return data as RouteDetail | null;
});

export type OwnRoute = Pick<RouteSummary, "id" | "slug" | "distance_km" | "elevation_gain_m"> & {
  status: RouteStatus;
  created_by: string | null;
  review_note: string | null;
  fields: RouteFields;
};

/** Ruta en cualquier estado con la sesión del usuario: el RLS deja ver las propias y, a la moderación, todas. */
export async function getOwnRoute(supabase: SupabaseClient, slug: string): Promise<OwnRoute | null> {
  const { data, error } = await supabase
    .from("routes")
    .select(`id, slug, distance_km, elevation_gain_m, status, created_by, review_note, ${ROUTE_FIELDS_COLUMNS}`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`routes ${slug}: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Omit<OwnRoute, "fields"> & Parameters<typeof toRouteFields>[0];
  return { id: row.id, slug: row.slug, distance_km: row.distance_km, elevation_gain_m: row.elevation_gain_m, status: row.status, created_by: row.created_by, review_note: row.review_note, fields: toRouteFields(row) };
}

/** Trazo, perfil y enlace de descarga del GPX; null si la ruta no tiene trazo. */
export async function getRouteShape(supabase: SupabaseClient, slug: string): Promise<RouteShape | null> {
  const { data, error } = await supabase.from("route_shapes").select("track, elevation_profile, gpx_path").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`route_shapes ${slug}: ${error.message}`);
  if (!data) return null;
  const row = data as { track: LineString; elevation_profile: RouteShape["profile"]; gpx_path: string | null };
  return {
    line: row.track.coordinates as RouteShape["line"],
    profile: row.elevation_profile,
    gpxUrl: row.gpx_path ? supabase.storage.from("route-tracks").getPublicUrl(row.gpx_path, { download: `${slug}.gpx` }).data.publicUrl : null,
  };
}
