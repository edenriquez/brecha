import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, History } from "lucide-react";
import { OutingCard } from "@/components/outing-card";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/lib/supabase/server";
import { isOutingOpen, type MyOuting } from "@/lib/outings";
import { listMyOutings } from "@/lib/outings.server";

export const metadata: Metadata = { title: "Mis salidas" };

export default async function MisSalidasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/mis-salidas");

  const outings = await listMyOutings(supabase, user.id);
  const upcoming = outings.filter(isOutingOpen);
  const past = outings.filter((o) => !isOutingOpen(o)).reverse();
  const organizing = upcoming.filter((o) => o.organizer_id === user.id).length;

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Mis salidas</h1>
          <p className="mt-1.5 text-on-surface-variant">
            {upcoming.length
              ? `${upcoming.length === 1 ? "Tienes 1 salida próxima" : `Tienes ${upcoming.length} salidas próximas`}${organizing ? ` · organizas ${organizing}` : ""}.`
              : "Las salidas que organizas o a las que te unes aparecen aquí."}
          </p>
        </div>

        <Section icon={<CalendarCheck className="size-5 text-primary" aria-hidden />} title="Próximas">
          {upcoming.length ? (
            <Grid outings={upcoming} userId={user.id} />
          ) : (
            <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
              No tienes salidas próximas.{" "}
              <Link href="/?ver=salidas" className="font-semibold text-primary underline-offset-2 hover:underline">
                Únete a una
              </Link>{" "}
              o{" "}
              <Link href="/" className="font-semibold text-primary underline-offset-2 hover:underline">
                elige una ruta
              </Link>{" "}
              y convoca la tuya.
            </p>
          )}
        </Section>

        {past.length > 0 && (
          <Section icon={<History className="size-5 text-on-surface-variant" aria-hidden />} title="Anteriores y canceladas">
            <Grid outings={past} userId={user.id} muted />
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 font-headline text-lg font-bold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ outings, userId, muted }: { outings: MyOuting[]; userId: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {outings.map((o) => (
        <OutingCard key={o.id} outing={o} muted={muted} tag={tagFor(o, userId)} />
      ))}
    </div>
  );
}

function tagFor(outing: MyOuting, userId: string) {
  if (outing.status === "cancelada") return { label: "Cancelada", tone: "error" } as const;
  const open = isOutingOpen(outing);
  if (outing.organizer_id === userId) return { label: open ? "Organizas" : "Organizaste", tone: "primary" } as const;
  return { label: open ? "Vas" : "Fuiste", tone: "neutral" } as const;
}
