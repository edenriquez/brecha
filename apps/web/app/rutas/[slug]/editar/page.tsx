import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquareWarning, PencilLine } from "lucide-react";
import { RouteForm } from "@/components/route-form";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import { ROUTE_STATUS } from "@/lib/routes";
import { getOwnRoute, getRouteShape } from "@/lib/routes.server";

export const metadata: Metadata = { title: "Editar ruta" };

type Props = { params: Promise<{ slug: string }> };

export default async function EditRoutePage({ params }: Props) {
  const { slug } = await params;
  const { supabase, user } = await requireUser(`/rutas/${slug}/editar`);
  const [route, shape, { data: admin }] = await Promise.all([getOwnRoute(supabase, slug), getRouteShape(supabase, slug), supabase.rpc("is_admin")]);
  const isAdmin = admin === true;
  if (!route || (route.created_by !== user.id && !isAdmin)) notFound();
  const back = route.status === "publicada" ? `/rutas/${route.slug}` : isAdmin && route.created_by !== user.id ? `/revision/${route.slug}` : "/mis-rutas";

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </Link>
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <PencilLine className="size-4" aria-hidden />
            {ROUTE_STATUS[route.status].label}
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Editar {route.fields.name}</h1>
        </div>
        {route.status === "rechazada" && route.review_note && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-error/30 bg-error/5 p-4">
            <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
            <div>
              <p className="font-headline text-sm font-bold">Qué hay que corregir</p>
              <p className="mt-0.5 text-sm whitespace-pre-line text-on-surface-variant">{route.review_note}</p>
            </div>
          </div>
        )}
        <RouteForm
          userId={user.id}
          editing={{
            id: route.id,
            slug: route.slug,
            status: route.status,
            fields: route.fields,
            canEditTrack: route.status !== "publicada" || isAdmin,
            track: shape && { line: shape.line, profile: shape.profile, distanceKm: route.distance_km, gainM: shape.profile ? route.elevation_gain_m : null },
          }}
        />
      </main>
    </div>
  );
}
