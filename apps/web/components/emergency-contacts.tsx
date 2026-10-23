import Link from "next/link";
import { LockKeyhole, Phone, ShieldPlus } from "lucide-react";
import { EMERGENCY_DAYS_AFTER, EMERGENCY_DAYS_BEFORE, type GroupEmergencyContact } from "@/lib/moderation";
import { personName, profileHref } from "@/lib/profiles";

/** Para quien organiza. `opensOn`: fecha legible desde la que se ven, si todavía no es tiempo. */
export function EmergencyContacts({ contacts, opensOn }: { contacts: GroupEmergencyContact[] | null; opensOn: string | null }) {
  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
      <div>
        <h2 className="flex items-center gap-2 font-headline text-lg font-bold">
          <ShieldPlus className="size-5 text-secondary" aria-hidden />
          Contactos de emergencia del grupo
        </h2>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-on-surface-variant">
          <LockKeyhole className="mt-px size-3.5 shrink-0" aria-hidden />
          Solo tú los ves, desde {EMERGENCY_DAYS_BEFORE} días antes hasta {EMERGENCY_DAYS_AFTER} día después de la salida. Úsalos solo si pasa algo.
        </p>
      </div>
      {opensOn ? (
        <p className="rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">Podrás verlos a partir del {opensOn}.</p>
      ) : contacts?.length ? (
        <ul className="divide-y divide-outline-variant/40">
          {contacts.map((c) => (
            <li key={c.user_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <Link href={profileHref(c.user_id)} className="text-sm font-semibold hover:text-primary">
                {personName(c)}
              </Link>
              {c.phone ? (
                <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary">
                  <Phone className="size-3.5" aria-hidden />
                  {c.contact_name}
                  {c.relationship && ` (${c.relationship})`} · <span className="font-mono font-semibold text-on-surface">{c.phone}</span>
                </a>
              ) : (
                <span className="text-xs text-outline">Sin contacto registrado</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">Todavía nadie más se ha unido.</p>
      )}
    </section>
  );
}

/** Para quien se unió y no ha registrado su contacto. */
export function EmergencyContactHint() {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-secondary/30 bg-secondary-fixed/30 p-3 text-xs text-on-surface-variant">
      <ShieldPlus className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
      <p>
        ¿Y si pasa algo en el sendero?{" "}
        <Link href="/perfil#emergencia" className="font-semibold text-secondary hover:underline">
          Agrega un contacto de emergencia
        </Link>
        ; quien organiza lo verá desde {EMERGENCY_DAYS_BEFORE} días antes.
      </p>
    </div>
  );
}
