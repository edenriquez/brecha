import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Clock, MapPin, MessageSquareWarning, PencilLine, Plus } from "lucide-react";
import { RouteTrack } from "@/components/route-track";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import { DIFFICULTY, formatDuration, formatKm, ROUTE_TYPE, type RouteStatus, type RouteSummary } from "@/lib/routes";
import { getRouteShape } from "@/lib/routes.server";

export const metadata: Metadata = { title: "Ruta enviada" };

type Props = { searchParams: Promise<{ ruta?: string }> };

type SubmittedRoute = Pick<RouteSummary, "slug" | "name" | "place_label" | "difficulty" | "route_type" | "distance_km" | "elevation_gain_m" | "duration_min"> & {
  status: RouteStatus;
  review_note: string | null;
};

const STATUS = {
  revision: { title: "Tu ruta está en revisión", body: "La revisamos para que el trazo y los datos sean confiables. En cuanto la publiquemos aparecerá en el mapa." },
  publicada: { title: "Tu ruta ya está publicada", body: "Ya aparece en el mapa y cualquiera puede convocar salidas." },
  rechazada: { title: "Tu ruta no se publicó", body: "Corrígela con lo que te indicamos y vuelve a enviarla." },
};

export default async function SubmittedRoutePage({ searchParams }: Props) {
  const slug = (await searchParams).ruta ?? "";
  // el RLS deja ver las rutas propias en cualquier estado (y todas a la moderación)
  const { supabase } = await requireUser(`/rutas/nueva/enviada?ruta=${slug}`);
  const { data } = await supabase
    .from("routes")
    .select("slug, name, place_label, difficulty, route_type, distance_km, elevation_gain_m, duration_min, status, review_note")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();
  const route = data as SubmittedRoute;
  const shape = await getRouteShape(supabase, route.slug);
  const status = STATUS[route.status];
  const difficulty = DIFFICULTY[route.difficulty];
  const rejected = route.status === "rechazada";

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div
          role="status"
          className={clsx("flex items-start gap-4 rounded-2xl border p-5", rejected ? "border-error/30 bg-error/5" : "border-primary-container/30 bg-primary-fixed/30")}
        >
          {rejected ? (
            <MessageSquareWarning className="mt-0.5 size-7 shrink-0 text-error" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-7 shrink-0 text-primary-container" aria-hidden />
          )}
          <div>
            <h1 className="font-headline text-xl font-extrabold">{status.title}</h1>
            <p className="mt-1 text-sm text-on-surface-variant">{status.body}</p>
            {rejected && route.review_note && <p className="mt-2 text-sm whitespace-pre-line">{route.review_note}</p>}
          </div>
        </div>

        <section className="space-y-5 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-headline text-2xl font-bold">{route.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-on-surface-variant">
                <MapPin className="size-4 text-outline" aria-hidden />
                {route.place_label}
              </p>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-on-surface-variant">
              <span>{formatKm(route.distance_km)}</span>
              <span>↑ {route.elevation_gain_m.toLocaleString("es-MX")} m</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {formatDuration(route.duration_min)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={clsx("size-2.5 rounded-full", difficulty.dot)} />
                {difficulty.label}
              </span>
              <span>{ROUTE_TYPE[route.route_type]}</span>
            </p>
          </div>
          {shape && <RouteTrack line={shape.line} profile={shape.profile} />}
        </section>

        <div className="flex flex-wrap gap-3">
          {route.status === "publicada" && (
            <Link href={`/rutas/${route.slug}`} className="rounded-lg bg-primary px-4 py-2.5 font-headline text-sm font-bold text-on-primary hover:bg-primary-container">
              Ver la ruta
            </Link>
          )}
          <Link
            href={`/rutas/${route.slug}/editar`}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-4 py-2.5 font-headline text-sm font-bold",
              rejected ? "bg-primary text-on-primary hover:bg-primary-container" : "border border-outline-variant bg-surface-container-lowest hover:border-primary-container hover:text-primary",
            )}
          >
            <PencilLine className="size-4" aria-hidden />
            {rejected ? "Corregir la ruta" : "Editar"}
          </Link>
          <Link
            href="/rutas/nueva"
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-headline text-sm font-bold hover:border-primary-container hover:text-primary"
          >
            <Plus className="size-4" aria-hidden />
            Subir otra ruta
          </Link>
          <Link href="/mis-rutas" className="px-2 py-2.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
            Mis rutas
          </Link>
        </div>
      </main>
    </div>
  );
}
