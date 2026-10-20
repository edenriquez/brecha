import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, CalendarDays, Clock, Gauge, MapPin, Mountain, Navigation, NotebookText, Ruler, TrendingUp, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MembershipButton } from "@/components/membership-button";
import { ShareButton } from "@/components/share-button";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/lib/supabase/server";
import { DIFFICULTY, formatDuration, formatKm, googleMapsSearch } from "@/lib/routes";
import { LEVEL, outingDateParts, PACE, spotsLabel } from "@/lib/outings";
import { getOuting } from "@/lib/outings.server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const outing = await getOuting((await params).id);
  if (!outing) return {};
  const date = outingDateParts(outing.starts_at);
  const summary = `${date.long}, ${date.time} · ${outing.route.name} · ${spotsLabel(outing.capacity, outing.members)}`;
  return {
    title: outing.title,
    description: summary,
    openGraph: { title: outing.title, description: summary, images: outing.route.cover_url ? [outing.route.cover_url] : undefined },
  };
}

export default async function OutingPage({ params }: Props) {
  const outing = await getOuting((await params).id);
  if (!outing) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { route } = outing;
  const date = outingDateParts(outing.starts_at);
  const isPast = new Date(outing.starts_at) <= new Date();
  const closed = outing.status === "cancelada" || isPast;
  const joined = !!user && outing.attendees.some((p) => p.id === user.id);
  const isOrganizer = user?.id === outing.organizer.id;
  const full = outing.members >= outing.capacity;
  const target = { id: outing.id, slug: route.slug };

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Link href={`/rutas/${route.slug}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver a {route.name}
        </Link>

        <section className="mb-8 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-xs">
          <div className="relative h-[260px] sm:h-[340px]">
            {route.cover_url ? (
              <Image src={route.cover_url} alt={route.name} fill priority sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-fixed/60 to-primary-container/40 text-primary-container/70">
                <Mountain className="size-16" aria-hidden />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute top-4 right-4">
              <ShareButton title={outing.title} />
            </div>
            <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 sm:p-7">
              <span
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase",
                  closed ? "bg-surface-container-high text-on-surface-variant" : "bg-secondary-container text-on-secondary",
                )}
              >
                <CalendarDays className="size-3.5" aria-hidden />
                {outing.status === "cancelada" ? "Cancelada · " : isPast ? "Ya pasó · " : ""}
                {date.long} · {date.time}
              </span>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{outing.title}</h1>
              <p className="flex items-center gap-1.5 text-sm text-white/85">
                <MapPin className="size-4" aria-hidden />
                {route.place_label}
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold tracking-wider text-on-surface-variant uppercase">Ruta</span>
              <Link href={`/rutas/${route.slug}`} className="font-headline text-sm font-bold hover:text-primary">
                {route.name}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Ruler className="size-3.5" aria-hidden /> {formatKm(route.distance_km)}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="size-3.5" aria-hidden /> ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {formatDuration(route.duration_min)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={clsx("size-2 rounded-full", DIFFICULTY[route.difficulty].dot)} />
                {DIFFICULTY[route.difficulty].label}
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <section className="flex items-center gap-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-xs">
              <Avatar person={outing.organizer} size={52} />
              <div>
                <p className="text-[11px] font-bold tracking-wider text-on-surface-variant uppercase">Organiza</p>
                <p className="font-headline text-lg font-bold">{isOrganizer ? "Tú" : (outing.organizer.display_name ?? "Senderista de Brecha")}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
              <h2 className="mb-4 flex items-center gap-2 font-headline text-lg font-bold">
                <Gauge className="size-5 text-primary" aria-hidden />
                Ritmo y nivel
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Fact label="Nivel del grupo" value={LEVEL[outing.level]} />
                <Fact label="Ritmo" value={PACE[outing.pace]} />
              </div>
            </section>

            {outing.notes && (
              <section className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
                <h2 className="mb-3 flex items-center gap-2 font-headline text-lg font-bold">
                  <NotebookText className="size-5 text-primary" aria-hidden />
                  Notas de quien organiza
                </h2>
                {outing.notes.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="mb-2 text-sm leading-relaxed whitespace-pre-line text-on-surface-variant last:mb-0">
                    {p}
                  </p>
                ))}
              </section>
            )}

            <section className="flex flex-col justify-between gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 font-headline text-lg font-bold">
                  <Navigation className="size-5 text-primary" aria-hidden />
                  Punto de encuentro
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {date.time} · {outing.meeting_point_label}
                </p>
              </div>
              <a
                href={googleMapsSearch(outing.meeting_point_label)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 self-start rounded-lg bg-primary-container px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary"
              >
                Abrir en Google Maps
              </a>
            </section>
          </div>

          <aside className="space-y-4 rounded-2xl border border-outline-variant/80 bg-surface-container-lowest p-5 shadow-sm lg:sticky lg:top-24 lg:col-span-5">
            <div className="flex items-center justify-between">
              <span className="font-headline text-base font-bold">Cupo de la salida</span>
              <span className="text-xs font-semibold text-on-surface-variant">
                {outing.members} de {outing.capacity} confirmados
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
              <div className="h-full rounded-full bg-secondary-container" style={{ width: `${Math.min((outing.members / outing.capacity) * 100, 100)}%` }} />
            </div>
            <p className={clsx("text-sm font-semibold", full ? "text-outline" : "text-secondary")}>{spotsLabel(outing.capacity, outing.members)}</p>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                <Users className="size-4" aria-hidden />
                Senderistas confirmados
              </p>
              <ul className="flex flex-wrap gap-2">
                {outing.attendees.map((p) => (
                  <li key={p.id} title={p.display_name ?? undefined}>
                    <Avatar person={p} size={36} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-outline-variant/40 pt-4">
              {closed ? (
                <p className="text-center text-sm text-on-surface-variant">
                  {outing.status === "cancelada" ? "Esta salida se canceló." : "Esta salida ya pasó."}
                </p>
              ) : isOrganizer ? (
                <p className="rounded-xl bg-primary-fixed/50 px-4 py-3 text-center text-sm font-semibold text-on-primary-fixed-variant">
                  Tú organizas esta salida. Comparte el enlace para que se unan.
                </p>
              ) : user ? (
                <MembershipButton outing={target} joined={joined} full={full} />
              ) : (
                <Link
                  href={`/entrar?next=/salidas/${outing.id}`}
                  className="flex w-full items-center justify-center rounded-xl bg-secondary-container px-4 py-3 font-headline text-sm font-bold text-on-secondary shadow-sm hover:bg-secondary"
                >
                  Entra para unirte
                </Link>
              )}
              {joined && !isOrganizer && !closed && <p className="mt-2 text-center text-xs font-semibold text-primary">Ya estás en la lista. ¡Nos vemos en el sendero!</p>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3.5">
      <p className="text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}
