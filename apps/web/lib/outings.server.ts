import "server-only";
import { cache } from "react";
import { createAnonClient, type createClient } from "@/lib/supabase/server";
import type { MyOuting, OutingCardData, OutingDetail, OutingSummary, Person } from "@/lib/outings";

const ROUTE_COLUMNS = "id, slug, name, place_label, difficulty, cover_url, distance_km, elevation_gain_m, duration_min";
const SUMMARY_COLUMNS = "id, title, starts_at, meeting_point_label, capacity, outing_members(count)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sin tipos generados del esquema, supabase-js no sabe que route/organizer son uno a uno: la forma de cada fila se declara aquí
type CountRow = { outing_members: { count: number }[] };
type SummaryRow = Omit<OutingSummary, "members"> & CountRow;
type CardRow = SummaryRow & Pick<OutingCardData, "route">;
type DetailRow = Omit<OutingDetail, "members" | "attendees"> & { outing_members: { person: Person }[] };

function withMembers<T extends CountRow>({ outing_members, ...o }: T) {
  return { ...o, members: outing_members[0]?.count ?? 0 };
}

function upcoming(columns: string) {
  return createAnonClient().from("outings").select(columns).eq("status", "abierta").gt("starts_at", new Date().toISOString());
}

export async function listUpcomingOutings(routeId: string): Promise<OutingSummary[]> {
  const { data, error } = await upcoming(SUMMARY_COLUMNS).eq("route_id", routeId).order("starts_at").limit(5);
  if (error) throw new Error(`outings ${routeId}: ${error.message}`);
  return (data as unknown as SummaryRow[]).map(withMembers);
}

/** Salidas próximas de rutas de hiking publicadas, para la pestaña del explorador. */
export async function listAllUpcomingOutings(): Promise<OutingCardData[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const { data, error } = await upcoming(`${SUMMARY_COLUMNS}, route:routes!inner(${ROUTE_COLUMNS})`)
    .eq("route.activity", "hiking")
    .eq("route.status", "publicada")
    .order("starts_at")
    .limit(60);
  if (error) throw new Error(`outings: ${error.message}`);
  return (data as unknown as CardRow[]).map(withMembers);
}

/** Salidas donde estoy inscrito (quien organiza también lo está). `mine` filtra; outing_members(count) sigue contando a todos. */
export async function listMyOutings(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<MyOuting[]> {
  const { data, error } = await supabase
    .from("outings")
    .select(`${SUMMARY_COLUMNS}, status, organizer_id, route:routes!inner(${ROUTE_COLUMNS}), mine:outing_members!inner(user_id)`)
    .eq("mine.user_id", userId)
    .order("starts_at")
    .limit(200);
  if (error) throw new Error(`mis salidas: ${error.message}`);
  return (data as unknown as (CardRow & Pick<MyOuting, "status" | "organizer_id">)[]).map(withMembers);
}

export const getOuting = cache(async (id: string): Promise<OutingDetail | null> => {
  if (!UUID.test(id)) return null;
  const { data, error } = await createAnonClient()
    .from("outings")
    .select(
      `id, title, starts_at, meeting_point_label, capacity, level, pace, notes, status,
       route:routes!inner(${ROUTE_COLUMNS}),
       organizer:profiles!outings_organizer_id_fkey(id, display_name, avatar_url),
       outing_members(joined_at, person:profiles(id, display_name, avatar_url))`,
    )
    .eq("id", id)
    .order("joined_at", { referencedTable: "outing_members" })
    .maybeSingle();
  if (error) throw new Error(`outing ${id}: ${error.message}`);
  if (!data) return null;
  const { outing_members, ...outing } = data as unknown as DetailRow;
  const attendees = outing_members.map((m) => m.person);
  return { ...outing, attendees, members: attendees.length };
});
