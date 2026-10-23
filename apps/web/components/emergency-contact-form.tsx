"use client";

import { useActionState, useState, useTransition } from "react";
import { keepValues } from "@/lib/forms";
import { CheckCircle2, Loader2, LockKeyhole, Save, ShieldPlus, Trash2 } from "lucide-react";
import { deleteEmergencyContact, saveEmergencyContact, type EmergencyState } from "@/app/perfil/actions";
import { EMERGENCY_DAYS_AFTER, EMERGENCY_DAYS_BEFORE, type EmergencyContact } from "@/lib/moderation";

const FIELD = "w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none";

export function EmergencyContactForm({ contact }: { contact: EmergencyContact | null }) {
  const [state, save, saving] = useActionState<EmergencyState, FormData>(saveEmergencyContact, { error: null, saved: false });
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const error = state.error ?? deleteError;

  function remove() {
    if (!window.confirm("¿Borrar tu contacto de emergencia?")) return;
    startDelete(async () => setDeleteError((await deleteEmergencyContact()).error));
  }

  return (
    <section id="emergencia" className="scroll-mt-24 space-y-5 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-secondary">
          <ShieldPlus className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-headline text-lg font-bold">Contacto de emergencia</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-on-surface-variant">
            <LockKeyhole className="mt-px size-3.5 shrink-0" aria-hidden />
            Privado. Solo lo ve quien organiza una salida a la que te uniste, desde {EMERGENCY_DAYS_BEFORE} días antes hasta {EMERGENCY_DAYS_AFTER} día después. No aparece en tu perfil ni
            lo ve la moderación.
          </p>
        </div>
      </div>

      {/* key: al guardar o borrar, los campos toman los valores nuevos */}
      <form key={JSON.stringify(contact)} onSubmit={keepValues(save)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="ec-name" className="text-sm font-semibold">
              Nombre
            </label>
            <input id="ec-name" name="name" defaultValue={contact?.name ?? ""} required minLength={2} maxLength={60} placeholder="Carmen Ramírez" className={FIELD} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ec-phone" className="text-sm font-semibold">
              Teléfono
            </label>
            <input
              id="ec-phone"
              name="phone"
              type="tel"
              defaultValue={contact?.phone ?? ""}
              required
              pattern="\+?[0-9][0-9 ()\-]{6,18}[0-9]"
              placeholder="+52 55 1234 5678"
              autoComplete="off"
              className={FIELD}
            />
          </div>
        </div>
        <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
          <label htmlFor="ec-relationship" className="text-sm font-semibold">
            Parentesco <span className="font-normal text-on-surface-variant">(opcional)</span>
          </label>
          <input id="ec-relationship" name="relationship" defaultValue={contact?.relationship ?? ""} maxLength={30} placeholder="Mamá, pareja, amigo…" className={FIELD} />
        </div>

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-outline-variant/40 pt-4 sm:flex-row sm:items-center">
          <p className="text-xs font-semibold">
            {error ? (
              <span className="text-error">{error}</span>
            ) : (
              state.saved && (
                <span className="flex items-center gap-1.5 text-primary">
                  <CheckCircle2 className="size-4" aria-hidden />
                  Guardado
                </span>
              )
            )}
          </p>
          <div className="flex gap-2">
            {contact && (
              <button
                type="button"
                onClick={remove}
                disabled={deleting || saving}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:text-error disabled:opacity-60"
              >
                <Trash2 className="size-4" aria-hidden />
                Borrar
              </button>
            )}
            <button
              disabled={saving || deleting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {saving ? "Guardando…" : "Guardar contacto"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
