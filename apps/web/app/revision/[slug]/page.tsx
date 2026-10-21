import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Download, MapPin, PencilLine } from "lucide-react";
import { ReviewActions } from "@/components/review-actions";
import { RouteTrack } from "@/components/route-track";
import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth.server";
import { DIFFICULTY, formatDuration, formatKm, ROUTE_STATUS, ROUTE_TYPE } from "@/lib/routes";
import { getOwnRoute, getRouteShape } from "@/lib/routes.server";

export const metadata: Metadata = { title: "Revisar ruta" };

type Props = { params: Promise<{ slug: string }> };

export default async function ReviewRoutePage({ params }: Props) {
  const { slug } = await params;
  const { supabase } = await requireAdmin(`/revision/${slug}`);
  const [route, shape] = await Promise.all([getOwnRoute(supabase, slug), getRouteShape(supabase, slug)]);
  if (!route) notFound();
  const { data: uploader } = route.created_by
    ? await supabase.from("profiles").select("display_name").eq("id", route.created_by).maybeSingle()
    : { data: null };
  const { fields } = route;
  const difficulty = DIFFICULTY[fields.difficulty];
  const tags = fields.tags ? fields.tags.split(", ") : [];

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Link href="/revision" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver a la revisión
        </Link>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <section className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
              <div>
                <p className="mb-1 text-xs font-semibold text-on-surface-variant">
                  {ROUTE_STATUS[route.status].label} · subida por {uploader?.display_name ?? "el equipo"}
                </p>
                <h1 className="font-headline text-2xl font-extrabold sm:text-3xl">{fields.name}</h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-on-surface-variant">
                  <MapPin className="size-4 text-outline" aria-hidden />
                  {fields.place_label}
                </p>
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-on-surface-variant">
                <span>{formatKm(route.distance_km)}</span>
                <span>↑ {route.elevation_gain_m.toLocaleString("es-MX")} m</span>
                <span>{formatDuration(fields.duration_min)}</span>
                <span className="flex items-center gap-1.5">
                  <span className={clsx("size-2.5 rounded-full", difficulty.dot)} />
                  {difficulty.label}
                </span>
                <span>{ROUTE_TYPE[fields.route_type]}</span>
              </p>
              {shape ? <RouteTrack line={shape.line} profile={shape.profile} /> : <p className="text-sm text-on-surface-variant">Esta ruta no tiene trazo.</p>}
              {shape?.gpxUrl && (
                <a href={shape.gpxUrl} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  <Download className="size-4" aria-hidden />
                  Descargar el GPX original
                </a>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
              <h2 className="font-headline text-lg font-bold">Descripción y foto</h2>
              {fields.cover_url ? (
                <div className="relative h-64 overflow-hidden rounded-xl border border-outline-variant/60">
                  <Image src={fields.cover_url} alt={`Portada de ${fields.name}`} fill sizes="(min-width: 1024px) 760px, 100vw" className="object-cover" />
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Sin foto de portada.</p>
              )}
              {fields.description ? (
                <p className="text-sm leading-relaxed whitespace-pre-line text-on-surface-variant">{fields.description}</p>
              ) : (
                <p className="text-sm text-on-surface-variant">Sin descripción.</p>
              )}
              {tags.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag} className="rounded-full border border-outline-variant/60 bg-surface-container-low px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:col-span-4">
            <div className="rounded-2xl border border-outline-variant/80 bg-surface-container-lowest p-5 shadow-sm">
              <h2 className="mb-4 font-headline text-base font-bold">Decisión</h2>
              {route.review_note && (
                <p className="mb-4 rounded-lg bg-error/5 px-3 py-2 text-xs text-on-surface-variant">
                  <span className="font-semibold text-on-surface">{route.status === "rechazada" ? "Nota enviada: " : "La última vez no se publicó por: "}</span>
                  {route.review_note}
                </p>
              )}
              <ReviewActions route={{ id: route.id, slug: route.slug }} status={route.status} />
            </div>
            <Link
              href={`/rutas/${route.slug}/editar`}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold hover:border-primary-container hover:text-primary"
            >
              <PencilLine className="size-4" aria-hidden />
              Corregir datos antes de decidir
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
