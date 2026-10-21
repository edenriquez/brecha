import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Route } from "lucide-react";
import { RouteUploader } from "@/components/route-uploader";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Sube una ruta" };

export default async function NewRoutePage() {
  const { user } = await requireUser("/rutas/nueva");

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver al mapa
        </Link>
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <Route className="size-4" aria-hidden />
            Comunidad Brecha · Rutas
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Sube una ruta</h1>
          <p className="mt-1.5 text-on-surface-variant">Comparte un sendero que conoces para que otros lo caminen y convoquen salidas.</p>
        </div>
        <RouteUploader userId={user.id} />
      </main>
    </div>
  );
}
