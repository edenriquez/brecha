import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { RouteCard } from "@/components/route-card";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import type { RouteSummary } from "@/lib/routes";
import { SUMMARY_COLUMNS } from "@/lib/routes.server";

export const metadata: Metadata = { title: "Rutas guardadas" };

export default async function SavedRoutesPage() {
  const { supabase } = await requireUser("/guardadas");
  const { data: saved, error } = await supabase.from("route_favorites").select("route_id").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`guardadas: ${error.message}`);
  const ids = saved.map((s) => s.route_id as string);
  let routes: RouteSummary[] = [];
  if (ids.length) {
    const { data, error: feedError } = await supabase.from("routes_feed").select(SUMMARY_COLUMNS).in("id", ids);
    if (feedError) throw new Error(`guardadas routes_feed: ${feedError.message}`);
    const byId = new Map((data as unknown as RouteSummary[]).map((r) => [r.id, r]));
    routes = ids.flatMap((id) => byId.get(id) ?? []);
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <Heart className="size-4" aria-hidden />
            Solo tú las ves
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Rutas guardadas</h1>
          <p className="mt-1.5 text-on-surface-variant">Las que quieres caminar o volver a hacer.</p>
        </div>

        {routes.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {routes.map((r) => (
              <RouteCard key={r.id} route={r} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest/60 px-6 py-14 text-center">
            <Heart className="size-10 text-outline-variant" aria-hidden />
            <p className="text-sm text-on-surface-variant">Todavía no guardas rutas. Toca el corazón de una ruta para tenerla a la mano.</p>
            <Link href="/" className="text-sm font-semibold text-primary hover:underline">
              Explorar el mapa
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
