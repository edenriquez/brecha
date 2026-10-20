import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { OutingForm } from "@/components/outing-form";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/lib/supabase/server";
import { getRoute } from "@/lib/routes.server";

export const metadata: Metadata = { title: "Convoca una salida" };

type Props = { params: Promise<{ slug: string }> };

export default async function ConvocarPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=/rutas/${slug}/convocar`);

  const route = await getRoute(slug);
  if (!route) notFound();
  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single();

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Link href={`/rutas/${route.slug}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver a {route.name}
        </Link>
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <Users className="size-4" aria-hidden />
            Comunidad Brecha · Convocatoria
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Convoca una salida</h1>
          <p className="mt-1.5 text-on-surface-variant">Invita a la comunidad a caminar contigo. Toma 2 minutos.</p>
        </div>
        <OutingForm route={route} organizer={profile ?? { display_name: null, avatar_url: null }} />
      </main>
    </div>
  );
}
