"use client";

import { useActionState } from "react";
import { LogOut, UserPlus } from "lucide-react";
import { RulesConsent } from "@/components/rules-consent";
import { joinOuting, leaveOuting, type ActionState } from "@/app/salidas/actions";

type Target = { id: string; slug: string };

/** `askRules`: aún no acepta las reglas de la comunidad; se piden antes de unirse. */
export function MembershipButton({ outing, joined, full, askRules }: { outing: Target; joined: boolean; full: boolean; askRules: boolean }) {
  const action = joined ? leaveOuting.bind(null, outing) : joinOuting.bind(null, outing);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { error: null });

  return (
    <form action={formAction} className="space-y-2">
      {!joined && !full && askRules && <RulesConsent />}
      {joined ? (
        <button
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-headline text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden />
          {pending ? "Saliendo…" : "Ya no puedo ir"}
        </button>
      ) : (
        <button
          disabled={pending || full}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 py-3 font-headline text-sm font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-outline"
        >
          <UserPlus className="size-4" aria-hidden />
          {full ? "Salida llena" : pending ? "Inscribiendo…" : "Unirme a la salida"}
        </button>
      )}
      {state.error && <p className="text-center text-xs text-error">{state.error}</p>}
    </form>
  );
}
