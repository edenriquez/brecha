"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Regresa a donde venía (conserva scroll y filtros); si entró directo por un enlace, va al explorador. */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Volver"
      className={className}
      onClick={() => {
        const internal = document.referrer && new URL(document.referrer).origin === location.origin;
        if (internal && history.length > 1) router.back();
        else router.push("/");
      }}
    >
      <ArrowLeft className="size-5" aria-hidden />
    </button>
  );
}
