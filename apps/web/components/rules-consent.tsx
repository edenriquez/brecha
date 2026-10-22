import Link from "next/link";

/** Casilla de las reglas y el aviso de responsabilidad; las acciones la leen como `accept_rules`. */
export function RulesConsent() {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-outline-variant/70 bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant">
      <input type="checkbox" name="accept_rules" required className="mt-0.5 size-4 shrink-0 accent-primary" />
      <span>
        Leí las{" "}
        <Link href="/reglas" target="_blank" className="font-semibold text-primary underline-offset-2 hover:underline">
          reglas de la comunidad
        </Link>{" "}
        y entiendo que participo bajo mi propio riesgo: Brecha conecta a senderistas, no organiza ni guía las salidas.
      </span>
    </label>
  );
}
