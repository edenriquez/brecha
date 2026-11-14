import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPinned } from "lucide-react";
import { AnnotationEditor } from "@/components/annotation-editor";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import { ROUTE_STATUS } from "@/lib/routes";
import { getOwnRoute, getRouteAnnotations, getRouteShape } from "@/lib/routes.server";

export const metadata: Metadata = { title: "Anotar ruta" };

type Props = { params: Promise<{ slug: string }> };

export default async function AnnotateRoutePage({ params }: Props) {
  const { slug } = await params;
  const { supabase, user } = await requireUser(`/rutas/${slug}/anotaciones`);
  const [route, shape, { data: admin }] = await Promise.all([getOwnRoute(supabase, slug), getRouteShape(supabase, slug), supabase.rpc("is_admin")]);
  if (!route || (route.created_by !== user.id && admin !== true)) notFound();
  const annotations = await getRouteAnnotations(supabase, route.id);
  const back = route.status === "publicada" ? `/rutas/${route.slug}` : `/rutas/${route.slug}/editar`;

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
            <MapPinned className="size-4" aria-hidden />
            {ROUTE_STATUS[route.status].label}
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Anotar {route.fields.name}</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Lo que verá quien abra tu ruta: tramos por tracción y avisos en el camino. Cada cambio se guarda al momento.</p>
        </div>
        {shape ? (
          <AnnotationEditor route={{ id: route.id, slug: route.slug, distanceKm: Number(route.distance_km) }} line={shape.line} profile={shape.profile} annotations={annotations} />
        ) : (
          <p className="text-sm text-on-surface-variant">Esta ruta todavía no tiene trazo GPX: súbelo desde Editar para poder anotarla.</p>
        )}
      </main>
    </div>
  );
}
