import type { Metadata } from "next";
import { Mountain } from "lucide-react";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-container-low px-4">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-8 shadow-sm">
        <Link href="/" className="mb-6 flex items-center gap-2 font-headline text-2xl font-bold text-primary">
          <Mountain className="size-7 fill-primary-container text-primary-container" aria-hidden />
          brecha
        </Link>
        <h1 className="font-headline text-xl font-bold">Únete a la comunidad</h1>
        <p className="mt-1 mb-6 text-sm text-on-surface-variant">Guarda rutas y únete a salidas en grupo.</p>
        {error && (
          <p className="mb-4 rounded-lg bg-secondary-fixed/60 px-3 py-2 text-sm text-on-secondary-container">
            No pudimos iniciar tu sesión. Intenta de nuevo.
          </p>
        )}
        <LoginForm next={next?.startsWith("/") ? next : "/"} />
      </div>
    </main>
  );
}
