import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeftRight, CalendarPlus, Clock, Download, Map as MapIcon, MapPin, Megaphone, Mountain, Navigation, Ruler, TrendingUp, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { FavoriteButton } from "@/components/favorite-button";
import { StartPointMap } from "@/components/route-map-lazy";
import { RouteFeedback } from "@/components/route-feedback";
import { RoutePhotos } from "@/components/route-photos";
import { RouteTrack } from "@/components/route-track";
import { ShareButton } from "@/components/share-button";
import { TopNav } from "@/components/top-nav";
import { TrailConditions } from "@/components/trail-conditions";
import { DIFFICULTY, formatDuration, formatKm, googleMapsDirections, ROUTE_TYPE } from "@/lib/routes";
import { outingDateParts, spotsLabel, type OutingSummary } from "@/lib/outings";
import { listUpcomingOutings } from "@/lib/outings.server";
import { personName, profileHref } from "@/lib/profiles";
import { getProfile } from "@/lib/profiles.server";
import { getRoute, getRouteCommunity, getRouteShape } from "@/lib/routes.server";
import { createAnonClient } from "@/lib/supabase/server";

export const revalidate = 300;

// Ninguna ruta se genera en el build: cada una se renderiza en su primera visita y se cachea (ISR)
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const route = await getRoute((await params).slug);
  if (!route) return {};
  const summary = `${formatKm(route.distance_km)}, ↑ ${route.elevation_gain_m} m, ${DIFFICULTY[route.difficulty].label.toLowerCase()} · ${route.place_label}`;
  return {
    title: route.name,
    description: route.description?.slice(0, 160) ?? summary,
    openGraph: { title: route.name, description: summary, images: route.cover_url ? [route.cover_url] : undefined },
  };
}

export default async function RoutePage({ params }: Props) {
  const route = await getRoute((await params).slug);
  if (!route) notFound();
  const [outings, shape, community, uploader] = await Promise.all([
    listUpcomingOutings(route.id),
    getRouteShape(createAnonClient(), route.slug),
    getRouteCommunity(route.id),
    route.created_by ? getProfile(route.created_by) : null,
  ]);
  const difficulty = DIFFICULTY[route.difficulty];
  const target = { id: route.id, slug: route.slug };
  // sin portada, la foto más reciente de la comunidad
  const cover = route.cover_url ?? community.photos[0]?.url ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <nav aria-label="Ruta de navegación" className="mb-4 flex items-center gap-2 text-xs font-medium text-on-surface-variant">
          <Link href="/" className="transition-colors hover:text-primary">
            Mapa
          </Link>
          <span className="text-outline-variant">/</span>
          <span>{route.place_label}</span>
          <span className="text-outline-variant">/</span>
          <span className="truncate font-semibold text-on-surface">{route.name}</span>
        </nav>

        <section className="flex flex-col justify-between gap-4 pb-6 md:flex-row md:items-end">
          <div className="space-y-2">
            <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">{route.name}</h1>
            <p className="flex items-center gap-1.5 text-sm text-on-surface-variant">
              <MapPin className="size-4 text-outline" aria-hidden />
              {route.place_label}
            </p>
            {uploader && (
              <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <Avatar person={uploader} size={20} className="border-0" />
                Compartida por
                <Link href={profileHref(uploader.id)} className="font-semibold text-on-surface hover:text-primary">
                  {personName(uploader)}
                </Link>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <FavoriteButton routeId={route.id} slug={route.slug} variant="detail" />
            <ShareButton title={route.name} />
          </div>
        </section>

        <section className="relative mb-8 h-[280px] overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container shadow-xs sm:h-[380px] md:h-[460px]">
          {cover ? (
            <Image src={cover} alt={route.name} fill priority sizes="(min-width: 1280px) 1216px, 100vw" className="object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
              <Mountain className="size-14" aria-hidden />
              <span className="text-sm font-medium">Sin foto todavía</span>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-8">
            <div className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-xs">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                <Stat icon={<Ruler className="size-5" />} label="Distancia" value={formatKm(route.distance_km)} />
                <Stat icon={<TrendingUp className="size-5" />} label="Desnivel" value={`↑ ${route.elevation_gain_m.toLocaleString("es-MX")} m`} />
                <Stat icon={<Clock className="size-5" />} label="Duración" value={formatDuration(route.duration_min)} />
                <Stat
                  icon={<Mountain className="size-5" />}
                  label="Dificultad"
                  value={
                    <span className="flex items-center gap-1.5">
                      <span className={clsx("size-2.5 rounded-full", difficulty.dot)} />
                      {difficulty.label}
                    </span>
                  }
                />
                <Stat icon={<ArrowLeftRight className="size-5" />} label="Tipo" value={ROUTE_TYPE[route.route_type]} />
              </dl>
            </div>

            <TrailConditions route={target} reports={community.reports} />

            <div className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 font-headline text-lg font-bold">
                    <MapIcon className="size-5 text-primary" aria-hidden />
                    {shape ? "Recorrido" : "Punto de inicio"}
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    {shape ? "Recorre el perfil para ubicar cada punto en el mapa" : "Esta ruta todavía no tiene trazo GPX"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 self-start">
                  {shape?.gpxUrl && (
                    <a
                      href={shape.gpxUrl}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary-container hover:text-primary"
                    >
                      <Download className="size-4" aria-hidden />
                      Descargar GPX
                    </a>
                  )}
                  <a
                    href={googleMapsDirections(route.lat, route.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-container px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary"
                  >
                    <Navigation className="size-4" aria-hidden />
                    Cómo llegar
                  </a>
                </div>
              </div>
              {shape ? (
                <RouteTrack line={shape.line} profile={shape.profile} />
              ) : (
                <div className="relative h-80 overflow-hidden rounded-xl border border-outline-variant/60 bg-[#e3e8e1] sm:h-96">
                  <StartPointMap lat={route.lat} lng={route.lng} />
                </div>
              )}
            </div>

            {(route.description || route.tags.length > 0) && (
              <div className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs sm:p-8">
                <h2 className="font-headline text-xl font-bold">Sobre la ruta</h2>
                {route.description?.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-on-surface-variant">
                    {p}
                  </p>
                ))}
                {route.tags.length > 0 && (
                  <ul className="flex flex-wrap gap-2 pt-1">
                    {route.tags.map((tag) => (
                      <li key={tag} className="rounded-full border border-outline-variant/60 bg-surface-container-low px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <RoutePhotos route={target} photos={community.photos} />

            <RouteFeedback route={{ id: route.id, slug: route.slug, created_by: route.created_by }} />
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:col-span-4">
            <UpcomingOutings outings={outings} />
            <div className="space-y-3 rounded-2xl border border-outline-variant/80 bg-gradient-to-br from-surface-container-lowest to-surface-container-low p-5 text-center shadow-sm">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary-fixed text-secondary">
                <Megaphone className="size-6" aria-hidden />
              </div>
              <div>
                <h3 className="font-headline text-base font-bold">¿No encuentras una fecha?</h3>
                <p className="mt-1 text-xs text-on-surface-variant">Organiza tu propio grupo y los senderistas locales se unirán</p>
              </div>
              <Link
                href={`/rutas/${route.slug}/convocar`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 font-headline text-sm font-bold text-on-secondary shadow-md transition-all hover:bg-on-secondary-container active:scale-95"
              >
                <CalendarPlus className="size-5" aria-hidden />
                Convocar una salida
              </Link>
              <p className="text-[11px] text-outline">Es gratis y lo organiza la comunidad</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">{icon}</div>
      <div>
        <dt className="text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">{label}</dt>
        <dd className="font-headline text-lg font-bold">{value}</dd>
      </div>
    </div>
  );
}

function UpcomingOutings({ outings }: { outings: OutingSummary[] }) {
  return (
    <div className="space-y-4 rounded-2xl border border-outline-variant/80 bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
        <div>
          <h3 className="font-headline text-base font-bold">Próximas salidas en grupo</h3>
          <p className="text-xs text-on-surface-variant">Súmate a grupos que van a esta ruta</p>
        </div>
        {outings.length > 0 && (
          <span className="rounded-full bg-primary-fixed/80 px-2 py-0.5 text-[11px] font-bold text-on-primary-fixed-variant">
            {outings.length === 1 ? "1 abierta" : `${outings.length} abiertas`}
          </span>
        )}
      </div>
      {outings.length ? (
        <ul className="space-y-3">
          {outings.map((o) => {
            const date = outingDateParts(o.starts_at);
            const full = o.members >= o.capacity;
            return (
              <li key={o.id}>
                <Link
                  href={`/salidas/${o.id}`}
                  className="block space-y-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low/40 p-3.5 transition-colors hover:border-primary-container"
                >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-2.5 py-1.5 text-center">
                    <p className="text-[10px] font-bold text-secondary uppercase">{date.weekday}</p>
                    <p className="font-headline text-base leading-tight font-extrabold">{date.day}</p>
                    <p className="text-[9px] font-medium text-outline uppercase">{date.month}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-headline text-xs font-bold">{o.title}</h4>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-on-surface-variant">
                      <Clock className="size-3" aria-hidden />
                      {date.time} · {o.meeting_point_label}
                    </p>
                    <p className={clsx("mt-1.5 text-[11px] font-semibold", full ? "text-outline" : "text-secondary")}>{spotsLabel(o.capacity, o.members)}</p>
                  </div>
                </div>
                <div className="border-t border-outline-variant/30 pt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                    <div className="h-full rounded-full bg-secondary-container" style={{ width: `${Math.min((o.members / o.capacity) * 100, 100)}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-outline">
                    {o.members}/{o.capacity} senderistas
                  </p>
                </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Users className="size-8 text-outline-variant" aria-hidden />
          <p className="text-sm text-on-surface-variant">Nadie ha convocado una salida a esta ruta todavía.</p>
        </div>
      )}
    </div>
  );
}
