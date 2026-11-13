"use client";

import { Mountain } from "lucide-react";

// sin TopNav: si falló un chunk, mejor no depender de más
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface-container-low px-4 text-center">
      <Mountain className="size-12 text-outline-variant" aria-hidden />
      <h1 className="font-headline text-2xl font-bold">No pudimos cargar esta pantalla</h1>
      <p className="text-sm text-on-surface-variant">Puede que no tengas señal.</p>
      <button type="button" onClick={() => retry()} className="mt-2 rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary hover:bg-primary-container">
        Reintentar
      </button>
      <a href="/descargas" className="font-headline text-sm font-semibold text-primary">
        Rutas sin conexión
      </a>
    </main>
  );
}
