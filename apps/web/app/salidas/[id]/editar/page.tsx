import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { OutingForm } from "@/components/outing-form";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/lib/supabase/server";
import { isOutingOpen, mexicoCityFields } from "@/lib/outings";
import { getOuting } from "@/lib/outings.server";

export const metadata: Metadata = { title: "Editar salida" };

type Props = { params: Promise<{ id: string }> };

export default async function EditarSalidaPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=/salidas/${id}/editar`);

  const outing = await getOuting(id);
  if (!outing) notFound();
  if (outing.organizer.id !== user.id || !isOutingOpen(outing)) redirect(`/salidas/${id}`);

  const { date, time } = mexicoCityFields(outing.starts_at);
  const fields = {
    title: outing.title,
    date,
    time,
    meeting_point_label: outing.meeting_point_label,
    capacity: outing.capacity,
    level: outing.level,
    pace: outing.pace,
    notes: outing.notes ?? "",
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Link href={`/salidas/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
          <ArrowLeft className="size-4" aria-hidden />
          Volver a la salida
        </Link>
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary-container uppercase">
            <PencilLine className="size-4" aria-hidden />
            Tu convocatoria
          </p>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Editar salida</h1>
          <p className="mt-1.5 text-on-surface-variant">La ruta no cambia; si cambias de plan, cancela y convoca otra.</p>
        </div>
        <OutingForm route={outing.route} organizer={outing.organizer} editing={{ id, members: outing.members, fields }} />
      </main>
    </div>
  );
}
