"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageSquareText, PencilLine, Send } from "lucide-react";
import { suggestCorrection, type SuggestionState } from "@/app/rutas/actions";
import { useSessionUser } from "@/lib/use-session-user";

/** Quien subió la ruta la edita; los demás sugieren correcciones a la moderación. */
export function RouteFeedback({ route }: { route: { id: string; slug: string; created_by: string | null } }) {
  const user = useSessionUser();
  const [open, setOpen] = useState(false);
  const [state, send, pending] = useActionState<SuggestionState, FormData>(suggestCorrection.bind(null, route), { error: null, sent: false });

  if (user === undefined) return null;

  if (user && user.id === route.created_by) {
    return (
      <Box
        icon={<PencilLine className="size-5" aria-hidden />}
        title="Subiste esta ruta"
        body="Puedes corregir la descripción, la foto y los datos cuando quieras."
        action={
          <Link href={`/rutas/${route.slug}/editar`} className="shrink-0 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary">
            Editar ruta
          </Link>
        }
      />
    );
  }

  if (state.sent) {
    return (
      <Box icon={<CheckCircle2 className="size-5" aria-hidden />} title="Gracias por avisar" body="La moderación revisará tu corrección y actualizará la ruta si hace falta." />
    );
  }

  return (
    <Box
      icon={<MessageSquareText className="size-5" aria-hidden />}
      title="¿Algo cambió en esta ruta?"
      body="Un acceso cerrado, un trazo distinto, datos que no cuadran: avísanos."
      action={
        !open &&
        (user ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary"
          >
            Sugerir corrección
          </button>
        ) : (
          <Link
            href={`/entrar?next=/rutas/${route.slug}`}
            className="shrink-0 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary"
          >
            Entra para sugerir
          </Link>
        ))
      }
    >
      {open && (
        <form action={send} className="space-y-2">
          <label htmlFor="suggestion" className="sr-only">
            Qué cambió
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
              <button
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
              >
                <Send className="size-3.5" aria-hidden />
                {pending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </form>
      )}
    </Box>
  );
}

/** `action` va a la derecha del texto; `children`, debajo. */
function Box({ icon, title, body, action, children }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-headline text-sm font-bold">{title}</p>
          <p className="text-xs text-on-surface-variant">{body}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
