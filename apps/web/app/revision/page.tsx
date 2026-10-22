import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronRight, ClipboardCheck, MessageSquareText, Mountain } from "lucide-react";
import { resolveSuggestion } from "@/app/revision/actions";
import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth.server";
import { DIFFICULTY, formatDuration, formatKm, ROUTE_STATUS, type RouteStatus, type RouteSummary } from "@/lib/routes";

export const metadata: Metadata = { title: "Revisión" };

type QueueRoute = Pick<RouteSummary, "id" | "slug" | "name" | "place_label" | "difficulty" | "distance_km" | "elevation_gain_m" | "duration_min" | "cover_url"> & {
  status: RouteStatus;
  created_at: string;
  reviewed_at: string | null;
  uploader: { display_name: string | null } | null;
};

type Suggestion = {
  id: string;
  message: string;
  created_at: string;
  route: { slug: string; name: string } | null;
  author: { display_name: string | null } | null;
};

const ROUTE_COLUMNS =
  "id, slug, name, place_label, difficulty, distance_km, elevation_gain_m, duration_min, cover_url, status, created_at, reviewed_at, uploader:profiles!routes_created_by_fkey(display_name)";

const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });

export default async function ReviewPage() {
  const { supabase } = await requireAdmin("/revision");
  const [pending, suggestions, reviewed] = await Promise.all([
    supabase.from("routes").select(ROUTE_COLUMNS).eq("status", "revision").order("created_at"),
    supabase
      .from("route_suggestions")
      .select("id, message, created_at, route:routes(slug, name), author:profiles!route_suggestions_user_id_fkey(display_name)")
      .eq("status", "abierta")
      .order("created_at"),
    supabase.from("routes").select(ROUTE_COLUMNS).neq("status", "revision").not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(10),
  ]);
  for (const r of [pending, suggestions, reviewed]) if (r.error) throw new Error(`revisión: ${r.error.message}`);
  const queue = pending.data as unknown as QueueRoute[];
  const open = suggestions.data as unknown as Suggestion[];
  const recent = reviewed.data as unknown as QueueRoute[];

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-4 py-8 sm:px-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <ClipboardCheck className="size-4" aria-hidden />
            Moderación
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Revisión</h1>
          <p className="mt-1.5 text-on-surface-variant">Rutas que subió la comunidad y correcciones que sugirieron.</p>
        </div>

        <section>
          <h2 className="mb-3 font-headline text-lg font-bold">
            Rutas por revisar <span className="text-on-surface-variant">({queue.length})</span>
          </h2>
          {queue.length ? (
            <ul className="space-y-3">
              {queue.map((route) => (
                <li key={route.id}>
                  <RouteRow route={route} note={`Subida por ${route.uploader?.display_name ?? "alguien"} · ${shortDate.format(new Date(route.created_at))}`} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No hay rutas esperando revisión.</Empty>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-headline text-lg font-bold">
            Correcciones sugeridas <span className="text-on-surface-variant">({open.length})</span>
          </h2>
          {open.length ? (
            <ul className="space-y-3">
              {open.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
                  <MessageSquareText className="mt-0.5 size-5 shrink-0 text-secondary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-on-surface-variant">
                      {s.route ? (
                        <Link href={`/rutas/${s.route.slug}`} className="font-semibold text-on-surface hover:text-primary">
                          {s.route.name}
                        </Link>
                      ) : (
                        "Ruta eliminada"
                      )}{" "}
                      · {s.author?.display_name ?? "alguien"} · {shortDate.format(new Date(s.created_at))}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-line">{s.message}</p>
                    {s.route && (
                      <Link href={`/rutas/${s.route.slug}/editar`} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                        Editar la ruta
                      </Link>
                    )}
                  </div>
                  <form action={resolveSuggestion.bind(null, s.id)}>
                    <button className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary">
                      <Check className="size-3.5" aria-hidden />
                      Resuelta
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No hay correcciones pendientes.</Empty>
          )}
        </section>

        {recent.length > 0 && (
          <section>
            <h2 className="mb-3 font-headline text-lg font-bold">Revisadas recientemente</h2>
            <ul className="space-y-3">
              {recent.map((route) => (
                <li key={route.id}>
                  <RouteRow route={route} note={`${ROUTE_STATUS[route.status].label} · ${shortDate.format(new Date(route.reviewed_at!))}`} muted />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function RouteRow({ route, note, muted }: { route: QueueRoute; note: string; muted?: boolean }) {
  return (
    <Link
      href={`/revision/${route.slug}`}
      className={clsx(
        "flex items-center gap-4 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-3.5 shadow-xs transition-colors hover:border-primary-container",
        muted && "opacity-80",
      )}
    >
      {route.cover_url ? (
        <Image src={route.cover_url} alt="" width={64} height={64} className="size-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary-fixed/50 text-primary-container">
          <Mountain className="size-6" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-headline text-sm font-bold">{route.name}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">{route.place_label}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs font-semibold text-on-surface-variant">
          <span>{formatKm(route.distance_km)}</span>
          <span>↑ {route.elevation_gain_m.toLocaleString("es-MX")} m</span>
          <span>{formatDuration(route.duration_min)}</span>
          <span className="flex items-center gap-1">
            <span className={clsx("size-2 rounded-full", DIFFICULTY[route.difficulty].dot)} />
            {DIFFICULTY[route.difficulty].label}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-outline">{note}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-outline" aria-hidden />
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center text-sm text-on-surface-variant">{children}</p>;
}
