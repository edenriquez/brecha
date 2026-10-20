"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Hoja de compartir del sistema en móvil; en escritorio copia el enlace. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/80 bg-surface-container-lowest px-3.5 py-2 text-xs font-semibold shadow-xs transition-all hover:bg-surface-container active:scale-95"
    >
      {copied ? <Check className="size-4 text-primary" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
      {copied ? "Enlace copiado" : "Compartir"}
    </button>
  );
}
