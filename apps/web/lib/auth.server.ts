import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Cliente con la sesión y su usuario; sin sesión manda a entrar y vuelve a `next`. */
export async function requireUser(next: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

/** Unirse a una salida o convocarla exige haber aceptado las reglas de la comunidad (lo verifica el trigger de inscripción). */
export async function hasAcceptedRules(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("rules_accepted_at").eq("id", userId).maybeSingle();
  return !!data?.rules_accepted_at;
}

/** Como requireUser, pero solo para la moderación; a los demás la página no existe. */
export async function requireAdmin(next: string) {
  const session = await requireUser(next);
  const { data } = await session.supabase.rpc("is_admin");
  if (data !== true) notFound();
  return session;
}
