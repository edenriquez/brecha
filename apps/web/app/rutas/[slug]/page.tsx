import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CalendarPlus, Clock, Download, MapPin, Mountain } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { DetailChip, DetailLayout } from "@/components/detail-layout";
import { FavoriteButton } from "@/components/favorite-button";
import { OfflineDownload } from "@/components/offline-download";
import { StartPointMap } from "@/components/route-map-lazy";
import { RouteFeedback } from "@/components/route-feedback";
import { RouteTrack } from "@/components/route-track";
import { ShareButton } from "@/components/share-button";
import { TrailConditions } from "@/components/trail-conditions";
import { mapHref } from "@/lib/route-filters";
import { ACTIVITY, DIFFICULTY, formatDuration, formatKm, ROUTE_TYPE } from "@/lib/routes";
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
    <DetailLayout
      actions={
        <>
          <ShareButton title={route.name} />
          <FavoriteButton routeId={route.id} slug={route.slug} variant="detail" />
        </>
      }
      header={
        <>
          <div className="flex flex-wrap gap-1.5">
            <DetailChip>{ACTIVITY[route.activity].label}</DetailChip>
            <DetailChip>
              <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
              {difficulty.label}
            </DetailChip>
          </div>
          <h1 className="mt-3 font-headline text-[26px] leading-tight font-bold lg:text-[34px]">{route.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-[15px] text-on-surface-variant">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {route.place_label}
          </p>
          {uploader && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
              <Avatar person={uploader} size={20} className="border-0" />
              Compartida por
              <Link href={profileHref(uploader.id)} className="font-semibold text-on-surface hover:text-primary">
                {personName(uploader)}
              </Link>
            </p>
          )}
          {/* lo primero que se ve: a esta página se llega desde "Descargar mapa" */}
          {shape && (
            <div className="mt-5 flex flex-wrap gap-2">
              <OfflineDownload
                route={{
                  slug: route.slug,
                  name: route.name,
                  place_label: route.place_label,
                  difficulty: route.difficulty,
                  distance_km: route.distance_km,
                  elevation_gain_m: route.elevation_gain_m,
                  duration_min: route.duration_min,
                  cover_url: route.cover_url,
                }}
                line={shape.line}
                profile={shape.profile}
              />
              {shape.gpxUrl && (
                <a href={shape.gpxUrl} className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-outline-variant px-4 font-headline text-sm font-semibold transition-colors hover:bg-surface-container">
                  <Download className="size-4" aria-hidden />
                  GPX
                </a>
              )}
            </div>
          )}
        </>
      }
      cover={
        <>
          {cover ? (
            <Image src={cover} alt={route.name} fill priority sizes="(min-width: 1024px) 720px, 100vw" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-container to-primary text-primary-fixed/50">
              <Mountain className="size-14" aria-hidden />
            </div>
          )}
          {/* los datos de la ruta van sobre la foto, con un degradado que los deja leer */}
          <dl className="absolute inset-x-0 bottom-0 flex flex-wrap gap-x-6 gap-y-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 pt-16 pb-4 text-white lg:px-6 lg:pb-5">
            <Stat label="Distancia" value={formatKm(route.distance_km)} />
            <Stat label="Desnivel" value={`↑ ${route.elevation_gain_m.toLocaleString("es-MX")} m`} />
            <Stat label="Duración" value={formatDuration(route.duration_min)} />
            <Stat label="Tipo" value={ROUTE_TYPE[route.route_type]} />
          </dl>
        </>
      }
      aside={
        <>
          <UpcomingOutings outings={outings} />
          <div>
            <Link
              href={`/rutas/${route.slug}/convocar`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 font-headline text-sm font-bold text-on-secondary transition-colors hover:bg-on-secondary-container"
            >
              <CalendarPlus className="size-5" aria-hidden />
              Convocar una salida
            </Link>
            <p className="mt-2 text-center text-[11px] text-outline">Es gratis y lo organiza la comunidad</p>
          </div>
        </>
      }
      lead={
        <section>
          <div className="mb-4">
            <h2 className="font-headline text-lg font-bold">{shape ? "Recorrido" : "Punto de inicio"}</h2>
            <p className="text-[13px] text-on-surface-variant">{shape ? "Recorre el perfil para ubicar cada punto en el mapa" : "Esta ruta todavía no tiene trazo GPX"}</p>
          </div>
          {shape ? (
            <RouteTrack line={shape.line} profile={shape.profile} mapHref={mapHref(route)} />
          ) : (
            <div className="relative h-80 overflow-hidden rounded-2xl border border-outline-variant/60 bg-[#e3e8e1] sm:h-96">
              <StartPointMap lat={route.lat} lng={route.lng} openHref={mapHref(route)} />
            </div>
          )}
        </section>
      }
    >
      {(route.description || route.tags.length > 0) && (
        <section>
          <h2 className="font-headline text-lg font-bold">Sobre la ruta</h2>
          {route.description?.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
              {p}
            </p>
          ))}
          {route.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {route.tags.map((tag) => (
                <li key={tag} className="rounded-full border border-outline-variant/60 px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <TrailConditions route={target} reports={community.reports} />

      <RouteFeedback route={{ id: route.id, slug: route.slug, created_by: route.created_by }} />
    </DetailLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold tracking-wider text-white/75 uppercase">{label}</dt>
      <dd className="font-headline text-lg leading-tight font-bold">{value}</dd>
    </div>
  );
}

function UpcomingOutings({ outings }: { outings: OutingSummary[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-headline text-base font-bold">Próximas salidas en grupo</h2>
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
        <p className="text-sm text-on-surface-variant">Nadie ha convocado una salida a esta ruta todavía.</p>
      )}
    </div>
  );
}
