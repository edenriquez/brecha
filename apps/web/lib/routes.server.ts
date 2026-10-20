import "server-only";
import { createAnonClient } from "@/lib/supabase/server";
import type { RouteSummary } from "@/lib/routes";

export async function listRoutes(): Promise<RouteSummary[]> {
  // el build de CI corre sin Supabase: la página se prerenderiza vacía y en Vercel se llena con datos reales
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("routes_feed")
    .select("id, slug, name, place_label, difficulty, route_type, distance_km, elevation_gain_m, duration_min, cover_url, tags, lat, lng, upcoming_outings")
    .eq("activity", "hiking")
    .order("upcoming_outings", { ascending: false })
    .order("name");
  if (error) throw new Error(`routes_feed: ${error.message}`);
  return data as RouteSummary[];
}
