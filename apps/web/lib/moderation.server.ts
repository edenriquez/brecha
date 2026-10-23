import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { OpenReport, ReportGroup, ReportTargetType, Suspension } from "@/lib/moderation";
import type { Person } from "@/lib/outings";
import { PERSON_COLUMNS, profileHref } from "@/lib/profiles";

type Client = Awaited<ReturnType<typeof createClient>>;
type Content = NonNullable<ReportGroup["content"]>;

/** Reportes abiertos agrupados por contenido, los más reportados primero. Solo la moderación los puede leer. */
export async function listReportGroups(supabase: Client): Promise<ReportGroup[]> {
  const { data, error } = await supabase
    .from("content_reports")
    .select(`id, target_type, target_id, reason, details, created_at, reporter:profiles!content_reports_reporter_id_fkey(${PERSON_COLUMNS})`)
    .eq("status", "abierto")
    .order("created_at")
    .limit(500);
  if (error) throw new Error(`content_reports: ${error.message}`);

  const groups = new Map<string, ReportGroup>();
  for (const row of data as unknown as (OpenReport & { target_type: ReportTargetType; target_id: string })[]) {
    const key = `${row.target_type}:${row.target_id}`;
    const group = groups.get(key) ?? { type: row.target_type, id: row.target_id, reports: [], content: null };
    group.reports.push({ id: row.id, reason: row.reason, details: row.details, created_at: row.created_at, reporter: row.reporter });
    groups.set(key, group);
  }

  const idsOf = (type: ReportTargetType) => [...groups.values()].filter((g) => g.type === type).map((g) => g.id);
  const contents = await loadContents(supabase, { perfil: idsOf("perfil"), salida: idsOf("salida"), foto: idsOf("foto"), reporte: idsOf("reporte") });
  for (const g of groups.values()) g.content = contents.get(`${g.type}:${g.id}`) ?? null;

  return [...groups.values()].sort((a, b) => b.reports.length - a.reports.length || a.reports[0].created_at.localeCompare(b.reports[0].created_at));
}

async function loadContents(supabase: Client, ids: Record<ReportTargetType, string[]>) {
  const none = { data: [], error: null };
  const [profiles, outings, photos, reports] = await Promise.all([
    ids.perfil.length ? supabase.from("profiles").select(`${PERSON_COLUMNS}, bio, home_area`).in("id", ids.perfil) : none,
    ids.salida.length
      ? supabase.from("outings").select(`id, title, notes, status, organizer:profiles!outings_organizer_id_fkey(${PERSON_COLUMNS})`).in("id", ids.salida)
      : none,
    ids.foto.length
      ? supabase.from("route_photos").select(`id, path, caption, route:routes(slug, name), author:profiles!route_photos_user_id_fkey(${PERSON_COLUMNS})`).in("id", ids.foto)
      : none,
    ids.reporte.length
      ? supabase.from("trail_reports").select(`id, note, status, route:routes(slug, name), author:profiles!trail_reports_user_id_fkey(${PERSON_COLUMNS})`).in("id", ids.reporte)
      : none,
  ]);
  for (const r of [profiles, outings, photos, reports]) if (r.error) throw new Error(`contenido reportado: ${r.error.message}`);

  const map = new Map<string, Content>();
  type Route = { slug: string; name: string } | null;
  for (const p of profiles.data as unknown as (Person & { bio: string | null; home_area: string | null })[]) {
    map.set(`perfil:${p.id}`, {
      title: p.display_name ?? "(sin nombre)",
      text: [p.home_area, p.bio].filter(Boolean).join(" · ") || null,
      image: null,
      href: profileHref(p.id),
      author: p,
      slug: null,
      path: null,
    });
  }
  for (const o of outings.data as unknown as { id: string; title: string; notes: string | null; status: string; organizer: Person }[]) {
    map.set(`salida:${o.id}`, {
      title: o.status === "cancelada" ? `${o.title} (cancelada)` : o.title,
      text: o.notes,
      image: null,
      href: `/salidas/${o.id}`,
      author: o.organizer,
      slug: null,
      path: null,
    });
  }
  const storage = supabase.storage.from("route-photos");
  for (const f of photos.data as unknown as { id: string; path: string; caption: string | null; route: Route; author: Person }[]) {
    map.set(`foto:${f.id}`, {
      title: f.route ? `Foto en ${f.route.name}` : "Foto",
      text: f.caption,
      image: storage.getPublicUrl(f.path).data.publicUrl,
      href: f.route ? `/rutas/${f.route.slug}` : "/",
      author: f.author,
      slug: f.route?.slug ?? null,
      path: f.path,
    });
  }
  for (const t of reports.data as unknown as { id: string; note: string | null; route: Route; author: Person }[]) {
    map.set(`reporte:${t.id}`, {
      title: t.route ? `Reporte en ${t.route.name}` : "Reporte del sendero",
      text: t.note,
      image: null,
      href: t.route ? `/rutas/${t.route.slug}` : "/",
      author: t.author,
      slug: t.route?.slug ?? null,
      path: null,
    });
  }
  return map;
}

export async function listSuspensions(supabase: Client): Promise<Suspension[]> {
  const { data, error } = await supabase
    .from("user_suspensions")
    .select(`user_id, until, reason, created_at, person:profiles!user_suspensions_user_id_fkey(${PERSON_COLUMNS})`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`user_suspensions: ${error.message}`);
  return data as unknown as Suspension[];
}

export async function moderationStats(supabase: Client) {
  const head = { count: "exact", head: true } as const;
  const [people, published, pending, outings, suggestions] = await Promise.all([
    supabase.from("profiles").select("id", head),
    supabase.from("routes").select("id", head).eq("status", "publicada"),
    supabase.from("routes").select("id", head).eq("status", "revision"),
    supabase.from("outings").select("id", head).eq("status", "abierta").gt("starts_at", new Date().toISOString()),
    supabase.from("route_suggestions").select("id", head).eq("status", "abierta"),
  ]);
  for (const r of [people, published, pending, outings, suggestions]) if (r.error) throw new Error(`estadísticas: ${r.error.message}`);
  return { people: people.count ?? 0, published: published.count ?? 0, pending: pending.count ?? 0, outings: outings.count ?? 0, suggestions: suggestions.count ?? 0 };
}
