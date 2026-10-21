"use client";

import { useActionState, useState } from "react";
import { cancelOuting, type ActionState } from "@/app/salidas/actions";

/** Dos pasos: cancelar no se puede deshacer y deja sin plan a quienes se unieron. */
export function CancelOutingButton({ outing, others }: { outing: { id: string; slug: string }; others: number }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState>(cancelOuting.bind(null, outing), { error: null });

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="w-full py-1 text-xs font-semibold text-error hover:underline">
        Cancelar salida
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-xl border border-error/30 bg-error/5 p-3 text-center">
      <p className="text-xs text-on-surface">
        {others > 0
          ? `${others === 1 ? "1 persona ya se unió" : `${others} personas ya se unieron`}. La salida quedará como cancelada y no se puede reabrir.`
          : "La salida quedará como cancelada y no se puede reabrir."}
      </p>
      {state.error && <p className="text-xs font-semibold text-error">{state.error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold hover:bg-surface-container">
          No, mantenerla
        </button>
        <button disabled={pending} className="flex-1 rounded-lg bg-error px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
          {pending ? "Cancelando…" : "Sí, cancelar"}
        </button>
      </div>
    </form>
  );
}
