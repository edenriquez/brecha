"use client";

import { useActionState, useState, useTransition } from "react";
import { keepValues } from "@/lib/forms";
import { Ban, Check, Loader2, Trash2, Undo2 } from "lucide-react";
import { dismissReports, liftSuspension, removeReportedContent, suspendUser, type ModerationState } from "@/app/admin/actions";
import { SUSPENSION_DAYS, type ReportTarget } from "@/lib/moderation";

const BUTTON = "flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold disabled:opacity-60";

/** `removeLabel` null: el contenido ya no existe y solo queda cerrar los reportes. */
export function ReportGroupActions({ target, removeLabel, author }: { target: ReportTarget; removeLabel: string | null; author: { id: string; suspended: boolean } | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);

  function run(action: () => Promise<ModerationState>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => setError((await action()).error));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {removeLabel && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => removeReportedContent(target), `¿${removeLabel}? No se puede deshacer.`)}
            className={`${BUTTON} border-error/40 text-error hover:bg-error/5`}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
            {removeLabel}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => dismissReports(target))} className={`${BUTTON} hover:border-primary-container hover:text-primary`}>
          <Check className="size-3.5" aria-hidden />
          {removeLabel ? "Descartar" : "Cerrar reportes"}
        </button>
        {author && !author.suspended && !suspending && (
          <button type="button" disabled={pending} onClick={() => setSuspending(true)} className={`${BUTTON} hover:border-error/40 hover:text-error`}>
            <Ban className="size-3.5" aria-hidden />
            Suspender cuenta
          </button>
        )}
      </div>
      {error && <p className="text-xs font-semibold text-error">{error}</p>}
      {author && suspending && <SuspendForm userId={author.id} onDone={() => setSuspending(false)} />}
    </div>
  );
}

function SuspendForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [state, send, pending] = useActionState<ModerationState, FormData>(
    async (prev, form) => {
      const result = await suspendUser(userId, prev, form);
      if (!result.error) onDone();
      return result;
    },
    { error: null },
  );
  return (
    <form onSubmit={keepValues(send)} className="space-y-2 rounded-xl border border-error/30 bg-error/5 p-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(SUSPENSION_DAYS).map(([value, label], i) => (
          <label key={value} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 text-xs font-semibold has-checked:border-error has-checked:text-error">
            <input type="radio" name="days" value={value} defaultChecked={i === 0} className="accent-error" />
            {label}
          </label>
        ))}
      </div>
      <label htmlFor={`reason-${userId}`} className="sr-only">
        Motivo
      </label>
      <input
        id={`reason-${userId}`}
        name="reason"
        required
        minLength={5}
        maxLength={500}
        placeholder="Motivo (la persona lo verá): acoso a otros senderistas en una salida"
        className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-error focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-error">{state.error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="px-2 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
            Cancelar
          </button>
          <button disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-error px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Suspender
          </button>
        </div>
      </div>
    </form>
  );
}

export function LiftSuspensionButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setError((await liftSuspension(userId)).error))}
        className={`${BUTTON} hover:border-primary-container hover:text-primary`}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Undo2 className="size-3.5" aria-hidden />}
        Levantar
      </button>
      {error && <p className="text-xs font-semibold text-error">{error}</p>}
    </div>
  );
}
