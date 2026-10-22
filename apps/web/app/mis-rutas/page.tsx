import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { FilePlus2, MessageSquareWarning, Mountain, PencilLine, Route } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import { DIFFICULTY, formatDuration, formatKm, ROUTE_STATUS, type RouteStatus, type RouteSummary } from "@/lib/routes";

export const metadata: Metadata = { title: "Mis rutas" };

type MyRoute = Pick<RouteSummary, "id" | "slug" | "name" | "place_label" | "difficulty" | "distance_km" | "elevation_gain_m" | "duration_min" | "cover_url"> & {
  status: RouteStatus;
  review_note: string | null;
};

const TONE = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary-fixed text-on-primary-fixed-variant",
  error: "bg-error/10 text-error",
};

export default async function MyRoutesPage() {
  const { supabase, user } = await requireUser("/mis-rutas");
  const { data, error } = await supabase
    .from("routes")
    .select("id, slug, name, place_label, difficulty, distance_km, elevation_gain_m, duration_min, cover_url, status, review_note")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`mis rutas: ${error.message}`);
  const routes = data as MyRoute[];

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
              <Route className="size-4" aria-hidden />
              Comunidad Brecha
            </p>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Mis rutas</h1>
            <p className="mt-1.5 text-on-surface-variant">Las rutas que subiste y en qué van.</p>
          </div>
          <Link
            href="/rutas/nueva"
            className="flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2.5 font-headline text-sm font-bold text-on-primary hover:bg-primary-container sm:self-auto"
          >
            <FilePlus2 className="size-4" aria-hidden />
            Subir una ruta
          </Link>
        </div>

        {routes.length ? (
          <ul className="space-y-3">
            {routes.map((route) => {
              const status = ROUTE_STATUS[route.status];
              return (
                <li key={route.id} className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
                  <div className="flex items-start gap-4">
                    {route.cover_url ? (
                      <Image src={route.cover_url} alt="" width={80} height={80} className="size-20 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-primary-fixed/50 text-primary-container">
                        <Mountain className="size-7" aria-hidden />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-headline text-base font-bold">{route.name}</h2>
                        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[status.tone])}>{status.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-on-surface-variant">{route.place_label}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-on-surface-variant">
                        <span>{formatKm(route.distance_km)}</span>
                        <span>↑ {route.elevation_gain_m.toLocaleString("es-MX")} m</span>
                        <span>{formatDuration(route.duration_min)}</span>
                        <span className="flex items-center gap-1">
                          <span className={clsx("size-2 rounded-full", DIFFICULTY[route.difficulty].dot)} />
                          {DIFFICULTY[route.difficulty].label}
                        </span>
                      </p>
                    </div>
                  </div>
                  {route.status === "rechazada" && route.review_note && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-error/5 px-3 py-2 text-xs text-on-surface-variant">
                      <MessageSquareWarning className="mt-px size-4 shrink-0 text-error" aria-hidden />
                      <span>
                        <span className="font-semibold text-on-surface">Qué hay que corregir: </span>
                        {route.review_note}
                      </span>
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-outline-variant/40 pt-3">
                    <Link
                      href={route.status === "publicada" ? `/rutas/${route.slug}` : `/rutas/nueva/enviada?ruta=${route.slug}`}
                      className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary"
                    >
                      {route.status === "publicada" ? "Ver ruta" : "Ver cómo quedó"}
                    </Link>
                    <Link
                      href={`/rutas/${route.slug}/editar`}
                      className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary"
                    >
                      <PencilLine className="size-3.5" aria-hidden />
                      {route.status === "rechazada" ? "Corregir" : "Editar"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest/60 px-6 py-14 text-center">
            <Route className="size-10 text-outline-variant" aria-hidden />
            <p className="text-sm text-on-surface-variant">Todavía no has subido rutas.</p>
            <Link href="/rutas/nueva" className="text-sm font-semibold text-primary hover:underline">
              Sube la primera con su GPX
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
