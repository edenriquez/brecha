import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Camera, Footprints, MapPin, Megaphone, Route, Signpost } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { OutingCard } from "@/components/outing-card";
import { OwnProfileLink } from "@/components/own-profile-link";
import { ReportButton } from "@/components/report-button";
import { RouteCard } from "@/components/route-card";
import { ShareButton } from "@/components/share-button";
import { TopNav } from "@/components/top-nav";
import { listUpcomingOutingsBy } from "@/lib/outings.server";
import { avatarSrc, personName } from "@/lib/profiles";
import { getProfile, getProfileActivity } from "@/lib/profiles.server";

export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getProfile((await params).id);
  if (!profile) return {};
  const name = personName(profile);
  const description = profile.bio ?? `${name} camina con la comunidad de Brecha${profile.home_area ? ` en ${profile.home_area}` : ""}.`;
  const image = avatarSrc(profile);
  return { title: name, description, openGraph: { title: name, description, images: image ? [image] : undefined } };
}

const since = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", month: "long", year: "numeric" });

export default async function ProfilePage({ params }: Props) {
  const profile = await getProfile((await params).id);
  if (!profile) notFound();
  const [activity, outings] = await Promise.all([getProfileActivity(profile.id), listUpcomingOutingsBy(profile.id)]);
  const { counts } = activity;
  const name = personName(profile);
  const empty = !outings.length && !activity.routes.length && !activity.photos.length;

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar person={profile} size={96} className="ring-4 ring-primary-fixed" />
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="font-headline text-3xl font-extrabold tracking-tight">{name}</h1>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant">
                {profile.home_area && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4 text-outline" aria-hidden />
                    {profile.home_area}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4 text-outline" aria-hidden />
                  En Brecha desde {since.format(new Date(profile.created_at))}
                </span>
              </p>
              {profile.bio && <p className="max-w-2xl pt-1 text-sm leading-relaxed whitespace-pre-line text-on-surface">{profile.bio}</p>}
            </div>
            <div className="flex items-center gap-3 self-start">
              <OwnProfileLink profileId={profile.id} />
              <ShareButton title={name} />
              <ReportButton target={{ type: "perfil", id: profile.id }} ownerId={profile.id} />
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-outline-variant/40 pt-6 sm:grid-cols-4">
            <Stat icon={<Footprints className="size-5" />} label="Salidas caminadas" value={counts.walked} />
            <Stat icon={<Megaphone className="size-5" />} label="Salidas convocadas" value={counts.organized} />
            <Stat icon={<Route className="size-5" />} label="Rutas compartidas" value={counts.routes} />
            <Stat icon={<Camera className="size-5" />} label="Fotos y reportes" value={counts.photos + counts.reports} />
          </dl>
        </section>

        {outings.length > 0 && (
          <Section icon={<Megaphone className="size-5" />} title="Próximas salidas que convoca">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {outings.map((o) => (
                <OutingCard key={o.id} outing={o} />
              ))}
            </div>
          </Section>
        )}

        {activity.routes.length > 0 && (
          <Section icon={<Route className="size-5" />} title="Rutas que compartió" count={counts.routes}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {activity.routes.map((r) => (
                <RouteCard key={r.id} route={r} />
              ))}
            </div>
          </Section>
        )}

        {activity.photos.length > 0 && (
          <Section icon={<Camera className="size-5" />} title="Fotos recientes" count={counts.photos}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {activity.photos.map((p) => (
                <li key={p.id}>
                  <Link href={`/rutas/${p.route.slug}`} className="group block overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
                    <div className="relative aspect-square">
                      <Image src={p.url} alt={p.caption ?? `Foto de ${p.route.name}`} fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover transition-transform group-hover:scale-105" />
                    </div>
                    <p className="truncate px-2.5 py-2 text-xs font-semibold group-hover:text-primary">{p.route.name}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {empty && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest/60 px-6 py-14 text-center">
            <Signpost className="size-10 text-outline-variant" aria-hidden />
            <p className="text-sm text-on-surface-variant">{name} todavía no ha compartido rutas, fotos ni salidas.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">{icon}</div>
      <div className="flex flex-col-reverse">
        <dt className="text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">{label}</dt>
        <dd className="font-headline text-xl font-bold">{value.toLocaleString("es-MX")}</dd>
      </div>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 font-headline text-xl font-bold">
        <span className="text-primary">{icon}</span>
        {title}
        {count !== undefined && <span className="text-sm font-semibold text-on-surface-variant">{count}</span>}
      </h2>
      {children}
    </section>
  );
}
