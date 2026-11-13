"use client";

import { useActionState, useState } from "react";
import { keepValues } from "@/lib/forms";
import Link from "next/link";
import { Flag, PencilLine, Send } from "lucide-react";
import { suggestCorrection, type SuggestionState } from "@/app/rutas/actions";
import { useSessionUser } from "@/lib/use-session-user";

const LINK = "inline-flex items-center gap-1.5 text-[13px] text-on-surface-variant underline underline-offset-2 hover:text-on-surface";

/** Enlace discreto al final de la ruta: quien la subió la edita; los demás sugieren correcciones a la moderación. */
export function RouteFeedback({ route }: { route: { id: string; slug: string; created_by: string | null } }) {
  const user = useSessionUser();
  const [open, setOpen] = useState(false);
  const [state, send, pending] = useActionState<SuggestionState, FormData>(suggestCorrection.bind(null, route), { error: null, sent: false });

  if (user === undefined) return null;
  if (user && user.id === route.created_by) {
    return (
      <Link href={`/rutas/${route.slug}/editar`} className={LINK}>
        <PencilLine className="size-3.5" aria-hidden /> Editar esta ruta
      </Link>
    );
  }
  if (state.sent) return <p className="text-[13px] text-on-surface-variant">Gracias por avisar: la moderación revisará tu corrección.</p>;
  if (!user) {
    return (
      <Link href={`/entrar?next=/rutas/${route.slug}`} className={LINK}>
        <Flag className="size-3.5" aria-hidden /> Reportar un dato incorrecto
      </Link>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={LINK}>
        <Flag className="size-3.5" aria-hidden /> Reportar un dato incorrecto
      </button>
    );
  }
  return (
    <form onSubmit={keepValues(send)} className="space-y-2">
      <label htmlFor="suggestion" className="block font-headline text-sm font-bold">
        ¿Qué cambió en esta ruta?
      </label>
      <textarea
        id="suggestion"
        name="message"
        required
        minLength={10}
        maxLength={1000}
        rows={3}
        autoFocus
        placeholder="Desde octubre el acceso por San Juan está cerrado; hay que entrar por…"
        className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-error">{state.error}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
            Cancelar
          </button>
          <button disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60">
            <Send className="size-3.5" aria-hidden />
            {pending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </form>
  );
}
