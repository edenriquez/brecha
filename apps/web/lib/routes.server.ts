import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineString } from "geojson";
import { createAnonClient } from "@/lib/supabase/server";
import type { RouteDetail, RouteShape, RouteSummary } from "@/lib/routes";

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
  const { data, error } = await supabase.from("routes_feed").select(`${SUMMARY_COLUMNS}, description`).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`routes_feed ${slug}: ${error.message}`);
  return data as RouteDetail | null;
});

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
