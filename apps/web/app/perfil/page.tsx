import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, UserRound } from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { TopNav } from "@/components/top-nav";
import { requireUser } from "@/lib/auth.server";
import { PERSON_COLUMNS, profileHref, type Profile } from "@/lib/profiles";

export const metadata: Metadata = { title: "Editar perfil" };

export default async function EditProfilePage() {
  const { supabase, user } = await requireUser("/perfil");
  const { data, error } = await supabase.from("profiles").select(`${PERSON_COLUMNS}, bio, home_area, created_at`).eq("id", user.id).single();
  if (error) throw new Error(`perfil: ${error.message}`);

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <Link href={profileHref(user.id)} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Ver mi perfil
        </Link>
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <UserRound className="size-4" aria-hidden />
            Comunidad Brecha
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Editar perfil</h1>
          <p className="mt-1.5 text-on-surface-variant">Así te ven quienes caminan contigo. Tu correo nunca se muestra.</p>
        </div>
        <ProfileForm profile={data as Profile} />
      </main>
    </div>
  );
}
