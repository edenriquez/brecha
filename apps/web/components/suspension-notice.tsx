"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { isActiveSuspension } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/use-session-user";

const longDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

/** La base ya bloquea lo que una cuenta suspendida no puede hacer; esto solo le explica por qué. */
export function SuspensionNotice() {
  const user = useSessionUser();
  const [suspension, setSuspension] = useState<{ until: string | null; reason: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    createClient()
      .from("user_suspensions")
      .select("until, reason")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setSuspension(data && isActiveSuspension(data) ? data : null));
  }, [user]);

  if (!user || !suspension) return null;
  return (
    <div role="status" className="flex items-start gap-2.5 border-t border-error/20 bg-error/10 px-4 py-2.5 text-sm text-error sm:px-6 lg:px-8">
      <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong>Tu cuenta está suspendida {suspension.until ? `hasta el ${longDate.format(new Date(suspension.until))}` : "hasta nuevo aviso"}.</strong> Puedes ver rutas y
        salirte de salidas, pero no convocar, unirte, publicar ni editar tu perfil. Motivo: {suspension.reason}{" "}
        <Link href="/reglas" className="font-semibold underline">
          Reglas de la comunidad
        </Link>
      </p>
    </div>
  );
}
