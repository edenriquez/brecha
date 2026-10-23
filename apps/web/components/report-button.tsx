"use client";

import { useActionState, useEffect, useState } from "react";
import { keepValues } from "@/lib/forms";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Flag, Loader2, X } from "lucide-react";
import { reportContent, type ReportState } from "@/app/reportes/actions";
import { DETAILS_MAX, REASONS_FOR, REPORT_REASONS, TARGET_LABEL, type ReportTarget } from "@/lib/moderation";
import { useSessionUser } from "@/lib/use-session-user";

/** No aparece sobre lo propio. `tone="light"`: sobre fondo oscuro (visor de fotos). */
export function ReportButton({ target, ownerId, tone = "dark", className }: { target: ReportTarget; ownerId: string | null; tone?: "dark" | "light"; className?: string }) {
  const user = useSessionUser();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const classes = clsx(
    "inline-flex items-center gap-1.5 text-xs font-semibold transition-colors",
    tone === "light" ? "rounded-full px-3 py-1.5 text-white hover:bg-white/10" : "text-on-surface-variant hover:text-error",
    className,
  );

  if (user === undefined || (user && user.id === ownerId)) return null;
  if (!user) {
    return (
      <Link href={`/entrar?next=${encodeURIComponent(pathname)}`} className={classes}>
        <Flag className="size-3.5" aria-hidden />
        Reportar
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={classes}>
        <Flag className="size-3.5" aria-hidden />
        Reportar
      </button>
      {open && <ReportDialog target={{ ...target, back: pathname }} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ target, onClose }: { target: ReportTarget & { back: string }; onClose: () => void }) {
  const [state, send, pending] = useActionState<ReportState, FormData>(reportContent.bind(null, target), { error: null, done: false });
  const [details, setDetails] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-labelledby="report-title"
        className="w-full max-w-md space-y-4 rounded-2xl bg-surface-container-lowest p-5 text-on-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="report-title" className="font-headline text-lg font-bold">
              Reportar {TARGET_LABEL[target.type].toLowerCase()}
            </h2>
            <p className="text-xs text-on-surface-variant">Lo revisa la moderación. Quien lo publicó no sabe quién reportó.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {state.done ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-xl bg-primary-fixed/50 p-4 text-sm text-on-primary-fixed-variant">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
              Gracias por avisar. Si es urgente o alguien corre peligro, llama al 911.
            </p>
            <button type="button" onClick={onClose} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-container">
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={keepValues(send)} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">¿Qué pasa?</legend>
              {REASONS_FOR[target.type].map((reason) => (
                <label key={reason} className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant/70 px-3 py-2.5 text-sm has-checked:border-primary has-checked:bg-primary-fixed/30">
                  <input type="radio" name="reason" value={reason} required className="accent-primary" />
                  {REPORT_REASONS[reason]}
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="report-details" className="text-sm font-semibold">
                  Detalles <span className="font-normal text-on-surface-variant">(opcional)</span>
                </label>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {details.length}/{DETAILS_MAX}
                </span>
              </div>
              <textarea
                id="report-details"
                name="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={DETAILS_MAX}
                rows={3}
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-error">{state.error}</p>
              <button
                disabled={pending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-error px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Flag className="size-4" aria-hidden />}
                {pending ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
