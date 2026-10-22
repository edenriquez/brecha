"use client";

import Link from "next/link";
import { PencilLine } from "lucide-react";
import { useSessionUser } from "@/lib/use-session-user";

/** El perfil se cachea igual para todos; el botón de editar se decide en el navegador. */
export function OwnProfileLink({ profileId }: { profileId: string }) {
  const user = useSessionUser();
  if (user?.id !== profileId) return null;
  return (
    <Link
      href="/perfil"
      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary shadow-xs transition-all hover:bg-primary-container active:scale-95"
    >
      <PencilLine className="size-4" aria-hidden />
      Editar perfil
    </Link>
  );
}
