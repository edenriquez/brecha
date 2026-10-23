import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { Ban, CalendarDays, ChevronRight, ClipboardCheck, Flag, MessageSquareText, Route, ShieldCheck, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LiftSuspensionButton, ReportGroupActions } from "@/components/moderation-actions";
import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth.server";
import { isActiveSuspension, REMOVE_LABEL, REPORT_REASONS, TARGET_LABEL, type ReportGroup, type Suspension } from "@/lib/moderation";
import { listReportGroups, listSuspensions, moderationStats } from "@/lib/moderation.server";
import { personName, profileHref } from "@/lib/profiles";

export const metadata: Metadata = { title: "Moderación" };

const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });

export default async function AdminPage() {
  const { supabase } = await requireAdmin("/admin");
  const [stats, groups, suspensions] = await Promise.all([moderationStats(supabase), listReportGroups(supabase), listSuspensions(supabase)]);
  const active = suspensions.filter(isActiveSuspension);
  const suspended = new Set(active.map((s) => s.user_id));
  const openReports = groups.reduce((n, g) => n + g.reports.length, 0);

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-10 px-4 py-8 sm:px-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <ShieldCheck className="size-4" aria-hidden />
            Moderación
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Panel de moderación</h1>
          <p className="mt-1.5 text-on-surface-variant">Reportes de la comunidad, rutas por revisar y cuentas suspendidas.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat icon={<Flag className="size-5" />} label="Reportes abiertos" value={openReports} alert={openReports > 0} href="#reportes" />
          <Stat icon={<ClipboardCheck className="size-5" />} label="Rutas por revisar" value={stats.pending} alert={stats.pending > 0} href="/revision" />
          <Stat icon={<MessageSquareText className="size-5" />} label="Correcciones" value={stats.suggestions} alert={stats.suggestions > 0} href="/revision" />
          <Stat icon={<Ban className="size-5" />} label="Suspendidas" value={active.length} href="#suspensiones" />
          <Stat icon={<Route className="size-5" />} label="Rutas publicadas" value={stats.published} />
          <Stat icon={<Users className="size-5" />} label="Personas" value={stats.people} />
        </div>

        <section id="reportes" className="scroll-mt-24">
          <h2 className="mb-3 font-headline text-lg font-bold">
            Reportes abiertos <span className="text-on-surface-variant">({groups.length})</span>
          </h2>
          {groups.length ? (
            <ul className="space-y-4">
              {groups.map((g) => (
                <li key={`${g.type}:${g.id}`}>
                  <ReportCard group={g} suspended={!!g.content?.author && suspended.has(g.content.author.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No hay reportes abiertos.</Empty>
          )}
        </section>

        <section id="suspensiones" className="scroll-mt-24">
          <h2 className="mb-3 font-headline text-lg font-bold">
            Cuentas suspendidas <span className="text-on-surface-variant">({active.length})</span>
          </h2>
          {active.length ? (
            <ul className="space-y-3">
              {active.map((s) => (
                <li key={s.user_id}>
                  <SuspensionRow suspension={s} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ninguna cuenta está suspendida.</Empty>
          )}
        </section>

        <Link
          href="/revision"
          className="flex items-center gap-4 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs transition-colors hover:border-primary-container"
        >
          <ClipboardCheck className="size-6 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="font-headline text-sm font-bold">Revisión de rutas</p>
            <p className="text-xs text-on-surface-variant">
              {stats.pending} por revisar · {stats.suggestions} correcciones sugeridas · {stats.outings} salidas próximas
            </p>
          </div>
          <ChevronRight className="size-4 text-outline" aria-hidden />
        </Link>
      </main>
    </div>
  );
}

function ReportCard({ group, suspended }: { group: ReportGroup; suspended: boolean }) {
  const { content } = group;
  return (
    <article className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-xs">
      <div className="flex items-start gap-4">
        {content?.image && <Image src={content.image} alt="" width={80} height={80} className="size-20 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-bold text-on-surface-variant">{TARGET_LABEL[group.type]}</span>
            <span className="rounded-full bg-error/10 px-2 py-0.5 font-bold text-error">{group.reports.length === 1 ? "1 reporte" : `${group.reports.length} reportes`}</span>
          </p>
          {content ? (
            <>
              <p className="flex items-center gap-2">
                <Link href={content.href} className="font-headline text-base font-bold hover:text-primary">
                  {content.title}
                </Link>
                {group.type === "perfil" && suspended && <SuspendedBadge />}
              </p>
              {content.text && <p className="line-clamp-3 text-sm whitespace-pre-line text-on-surface-variant">{content.text}</p>}
              {content.author && group.type !== "perfil" && (
                <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <Avatar person={content.author} size={20} className="border-0" />
                  <Link href={profileHref(content.author.id)} className="font-semibold text-on-surface hover:text-primary">
                    {personName(content.author)}
                  </Link>
                  {suspended && <SuspendedBadge />}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">Este contenido ya se borró.</p>
          )}
        </div>
      </div>

      <ul className="space-y-2 border-t border-outline-variant/40 pt-3">
        {group.reports.map((r) => (
          <li key={r.id} className="text-xs">
            <p>
              <span className="font-semibold">{REPORT_REASONS[r.reason]}</span>
              <span className="text-on-surface-variant">
                {" "}
                · {personName(r.reporter)} · {shortDate.format(new Date(r.created_at))}
              </span>
            </p>
            {r.details && <p className="mt-0.5 whitespace-pre-line text-on-surface-variant">{r.details}</p>}
          </li>
        ))}
      </ul>

      <ReportGroupActions
        target={{ type: group.type, id: group.id }}
        removeLabel={content ? REMOVE_LABEL[group.type] : null}
        author={content?.author ? { id: content.author.id, suspended } : null}
      />
    </article>
  );
}

function SuspensionRow({ suspension: s }: { suspension: Suspension }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
      <Avatar person={s.person} size={36} />
      <div className="min-w-0 flex-1">
        <Link href={profileHref(s.user_id)} className="font-headline text-sm font-bold hover:text-primary">
          {personName(s.person)}
        </Link>
        <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <CalendarDays className="size-3.5" aria-hidden />
          {s.until ? `Hasta el ${shortDate.format(new Date(s.until))}` : "Hasta que se levante"} · desde el {shortDate.format(new Date(s.created_at))}
        </p>
        <p className="mt-1 text-sm">{s.reason}</p>
      </div>
      <LiftSuspensionButton userId={s.user_id} />
    </div>
  );
}

function Stat({ icon, label, value, alert, href }: { icon: React.ReactNode; label: string; value: number; alert?: boolean; href?: string }) {
  const body = (
    <>
      <span className={clsx("flex size-9 items-center justify-center rounded-lg", alert ? "bg-error/10 text-error" : "bg-surface-container text-primary")}>{icon}</span>
      <p className="flex flex-col">
        <span className="font-headline text-2xl font-bold">{value.toLocaleString("es-MX")}</span>
        <span className="text-[11px] font-semibold text-on-surface-variant">{label}</span>
      </p>
    </>
  );
  const className = "flex flex-col gap-2 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs";
  return href ? (
    <Link href={href} className={clsx(className, "transition-colors hover:border-primary-container")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function SuspendedBadge() {
  return <span className="rounded-full bg-error px-2 py-0.5 text-[10px] font-bold text-white">Suspendida</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center text-sm text-on-surface-variant">{children}</p>;
}
