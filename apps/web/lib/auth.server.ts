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

/** Como requireUser, pero solo para la moderación; a los demás la página no existe. */
export async function requireAdmin(next: string) {
  const session = await requireUser(next);
  const { data } = await session.supabase.rpc("is_admin");
  if (data !== true) notFound();
  return session;
}
