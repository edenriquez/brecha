import "server-only";
import { cache } from "react";
import { createAnonClient } from "@/lib/supabase/server";
import type { RouteDetail, RouteSummary } from "@/lib/routes";

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
