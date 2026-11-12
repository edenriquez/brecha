import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Route } from "lucide-react";
import { RouteForm } from "@/components/route-form";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import { ACTIVITY_KEY, parseActivity } from "@/lib/route-filters";

export const metadata: Metadata = { title: "Sube una ruta" };

type Props = { searchParams: Promise<{ [ACTIVITY_KEY]?: string }> };

export default async function NewRoutePage({ searchParams }: Props) {
  const activity = parseActivity((await searchParams)[ACTIVITY_KEY] ?? null);
  const { user } = await requireUser(activity === "hiking" ? "/rutas/nueva" : `/rutas/nueva?${ACTIVITY_KEY}=${activity}`);

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Link href={activity === "hiking" ? "/" : `/?${ACTIVITY_KEY}=${activity}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver al mapa
        </Link>
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <Route className="size-4" aria-hidden />
            Comunidad Brecha · Rutas
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Sube una ruta</h1>
          <p className="mt-1.5 text-on-surface-variant">
            {activity === "offroad"
              ? "Comparte una brecha o ruta 4x4 que conoces para que otros la recorran y convoquen salidas."
              : "Comparte un sendero que conoces para que otros lo caminen y convoquen salidas."}
          </p>
        </div>
        <RouteForm userId={user.id} activity={activity} />
      </main>
    </div>
  );
}
