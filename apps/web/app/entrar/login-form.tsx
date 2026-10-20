"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return (
      <p className="rounded-lg bg-primary-fixed/60 px-3 py-3 text-sm text-on-primary-fixed-variant">
        Te mandamos un enlace a <strong>{email}</strong>. Ábrelo en este dispositivo para entrar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={google}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold shadow-xs transition-colors hover:bg-surface-container"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
        </svg>
        Continuar con Google
      </button>
      <div className="flex items-center gap-3 text-xs text-outline">
        <span className="h-px flex-1 bg-outline-variant/60" />o<span className="h-px flex-1 bg-outline-variant/60" />
      </div>
      <form onSubmit={magicLink} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          disabled={state === "sending"}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 font-headline text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          <Mail className="size-4" aria-hidden />
          {state === "sending" ? "Enviando…" : "Mandarme un enlace"}
        </button>
        {state === "error" && <p className="text-sm text-error">No pudimos mandar el enlace. Revisa el correo e intenta de nuevo.</p>}
      </form>
    </div>
  );
}
