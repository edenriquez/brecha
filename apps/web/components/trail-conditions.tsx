"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Send, Signpost, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { deleteTrailReport, reportTrailConditions, type CommunityState } from "@/app/rutas/community-actions";
import { daysAgoLabel, RECENT_REPORT_DAYS, REPORT_WINDOW_DAYS, shiftDay, TRAIL_ISSUES, TRAIL_STATUS, type TrailIssue, type TrailReport, type TrailStatus } from "@/lib/community";
import { todayInMexicoCity } from "@/lib/outings";
import { personName, profileHref } from "@/lib/profiles";
import { useIsAdmin, useSessionUser } from "@/lib/use-session-user";

type Target = { id: string; slug: string };

const BUTTON = "shrink-0 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary";

export function TrailConditions({ route, reports }: { route: Target; reports: TrailReport[] }) {
  const user = useSessionUser();
  const admin = useIsAdmin(user);
  const [open, setOpen] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [latest, ...older] = reports;
  const canDelete = (r: TrailReport) => admin || r.author.id === user?.id;

  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-headline text-lg font-bold">
            <Signpost className="size-5 text-primary" aria-hidden />
            Condiciones del sendero
          </h2>
          <p className="text-xs text-on-surface-variant">Lo que reportan quienes caminaron la ruta hace poco</p>
        </div>
        {!open &&
          user !== undefined &&
          (user ? (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setThanks(false);
              }}
              className={BUTTON}
            >
              Reportar condiciones
            </button>
          ) : (
            <Link href={`/entrar?next=/rutas/${route.slug}`} className={BUTTON}>
              Entra para reportar
            </Link>
          ))}
      </div>

      {open && (
        <ReportForm
          route={route}
          onClose={(sent) => {
            setOpen(false);
            setThanks(sent);
          }}
        />
      )}
      {thanks && <p className="rounded-xl bg-primary-fixed/50 px-4 py-2.5 text-xs font-semibold text-on-primary-fixed-variant">Gracias: tu reporte ya ayuda a quien va después.</p>}

      {latest ? (
        <>
          <div className="space-y-2.5 rounded-xl border border-outline-variant/50 bg-surface-container-low p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", TRAIL_STATUS[latest.status].badge)}>{TRAIL_STATUS[latest.status].label}</span>
              <span className="text-xs text-on-surface-variant">Último reporte: visita de {daysAgoLabel(latest.visited_on)}</span>
            </div>
            <ReportBody report={latest} slug={route.slug} canDelete={canDelete(latest)} />
          </div>
          {older.length > 0 && (
            <ul className="divide-y divide-outline-variant/40">
              {older.map((r) => (
                <li key={r.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                  <p className="flex items-center gap-2 text-xs">
                    <span className={clsx("size-2 rounded-full", TRAIL_STATUS[r.status].dot)} />
                    <span className="font-semibold">{TRAIL_STATUS[r.status].label}</span>
                    <span className="text-on-surface-variant">· visita de {daysAgoLabel(r.visited_on)}</span>
                  </p>
                  <ReportBody report={r} slug={route.slug} canDelete={canDelete(r)} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        !open && <p className="text-sm text-on-surface-variant">Nadie ha reportado en los últimos {RECENT_REPORT_DAYS} días. Si fuiste hace poco, cuéntanos cómo estaba.</p>
      )}
    </section>
  );
}

function ReportBody({ report, slug, canDelete }: { report: TrailReport; slug: string; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm("¿Borrar este reporte?")) return;
    start(async () => setError((await deleteTrailReport({ id: report.id, slug })).error));
  }

  return (
    <div className="space-y-2">
      {report.issues.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {report.issues.map((issue) => (
            <li key={issue} className="rounded-full border border-outline-variant/60 bg-surface-container-lowest px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
              {TRAIL_ISSUES[issue]}
            </li>
          ))}
        </ul>
      )}
      {report.note && <p className="text-sm leading-relaxed whitespace-pre-line text-on-surface">{report.note}</p>}
      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
        <Link href={profileHref(report.author.id)} className="flex items-center gap-2 hover:text-primary">
          <Avatar person={report.author} size={20} className="border-0" />
          {personName(report.author)}
        </Link>
        {canDelete && (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto flex items-center gap-1 font-semibold hover:text-error disabled:opacity-50">
            <Trash2 className="size-3.5" aria-hidden />
            {pending ? "Borrando…" : "Borrar"}
          </button>
        )}
      </div>
      {error && <p className="text-xs font-semibold text-error">{error}</p>}
    </div>
  );
}

function ReportForm({ route, onClose }: { route: Target; onClose: (sent: boolean) => void }) {
  const today = todayInMexicoCity();
  const [status, setStatus] = useState<TrailStatus | null>(null);
  const [state, send, pending] = useActionState<CommunityState, FormData>(async (prev, form) => {
    const result = await reportTrailConditions(route, prev, form);
    if (result.done) onClose(true);
    return result;
  }, { error: null, done: false });

  return (
    <form action={send} className="space-y-4 rounded-xl border border-outline-variant/60 p-4">
      <fieldset>
        <legend className="mb-2 font-headline text-sm font-bold">¿Cómo estaba?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(TRAIL_STATUS) as TrailStatus[]).map((key) => (
            <label
              key={key}
              className={clsx(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors",
                status === key ? "border-primary bg-primary-fixed/40" : "border-outline-variant hover:border-primary",
              )}
            >
              <input type="radio" name="status" value={key} required checked={status === key} onChange={() => setStatus(key)} className="sr-only" />
              <span className={clsx("size-2.5 rounded-full", TRAIL_STATUS[key].dot)} />
              {TRAIL_STATUS[key].label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-headline text-sm font-bold">
          Detalles <span className="font-body font-normal text-on-surface-variant">(opcional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TRAIL_ISSUES) as TrailIssue[]).map((key) => (
            <label
              key={key}
              className="cursor-pointer rounded-full border border-outline-variant px-3 py-1 text-xs font-medium transition-colors hover:border-primary has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary"
            >
              <input type="checkbox" name="issues" value={key} className="sr-only" />
              {TRAIL_ISSUES[key]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <label htmlFor="visited_on" className="mb-1.5 block font-headline text-sm font-bold">
            Fecha de tu visita
          </label>
          <input
            id="visited_on"
            name="visited_on"
            type="date"
            required
            defaultValue={today}
            min={shiftDay(today, -REPORT_WINDOW_DAYS)}
            max={today}
            className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="note" className="mb-1.5 block font-headline text-sm font-bold">
            Nota <span className="font-body font-normal text-on-surface-variant">(opcional)</span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            maxLength={500}
            placeholder="Hay lodo después de la primera cascada; en la caseta cobran $30."
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-error">{state.error}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onClose(false)} className="px-2 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
            Cancelar
          </button>
          <button disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60">
            <Send className="size-3.5" aria-hidden />
            {pending ? "Publicando…" : "Publicar reporte"}
          </button>
        </div>
      </div>
    </form>
  );
}
