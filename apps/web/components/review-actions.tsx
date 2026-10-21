"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { approveRoute, rejectRoute, type ReviewState } from "@/app/revision/actions";
import type { RouteStatus } from "@/lib/routes";

export function ReviewActions({ route, status }: { route: { id: string; slug: string }; status: RouteStatus }) {
  const [approval, approve, approving] = useActionState<ReviewState, FormData>(() => approveRoute(route), { error: null });
  const [rejection, reject, rejecting] = useActionState<ReviewState, FormData>(rejectRoute.bind(null, route), { error: null });
  const busy = approving || rejecting;

  return (
    <div className="space-y-4">
      {status !== "publicada" && (
        <form action={approve} className="space-y-2">
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-headline text-sm font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {approving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            Publicar en el mapa
          </button>
          {approval.error && <p className="text-xs font-semibold text-error">{approval.error}</p>}
        </form>
      )}
      {status !== "rechazada" && (
        <form action={reject} className="space-y-2 border-t border-outline-variant/50 pt-4">
          <label htmlFor="note" className="block font-headline text-sm font-bold">
            {status === "publicada" ? "Quitar del mapa" : "No publicar"}
          </label>
          <textarea
            id="note"
            name="note"
            required
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder="Qué hay que corregir: el trazo no coincide, faltan datos, la foto no es de la ruta…"
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
          />
          <p className="text-[11px] text-on-surface-variant">Quien la subió lo verá en Mis rutas para corregirla.</p>
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-error/40 px-4 py-2.5 font-headline text-sm font-bold text-error transition-colors hover:bg-error/5 disabled:opacity-60"
          >
            {rejecting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
            {status === "publicada" ? "Quitar del mapa" : "No publicar"}
          </button>
          {rejection.error && <p className="text-xs font-semibold text-error">{rejection.error}</p>}
        </form>
      )}
    </div>
  );
}
