"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LEVEL, mexicoCityISO, PACE } from "@/lib/outings";

export type ActionState = { error: string | null };

type Target = { id: string; slug: string };

async function requireUser(next: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

function refreshListings(slug: string) {
  revalidatePath(`/rutas/${slug}`);
  revalidatePath("/");
}

type OutingValues = {
  title: string;
  starts_at: string;
  meeting_point_label: string;
  capacity: number;
  level: string;
  pace: string;
  notes: string | null;
};

function parseOutingForm(form: FormData): { error: string } | { values: OutingValues } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const title = text("title");
  const meetingPoint = text("meeting_point_label");
  const notes = text("notes");
  const capacity = Number(text("capacity"));
  const level = text("level");
  const pace = text("pace");
  const startsAt = new Date(mexicoCityISO(text("date"), text("time")));

  if (title.length < 3 || title.length > 80) return { error: "El nombre de la salida debe tener entre 3 y 80 caracteres." };
  if (Number.isNaN(startsAt.getTime())) return { error: "Elige la fecha y la hora de la salida." };
  if (startsAt <= new Date()) return { error: "La salida tiene que ser en el futuro." };
  if (meetingPoint.length < 3 || meetingPoint.length > 120) return { error: "Indica el punto de encuentro (3 a 120 caracteres)." };
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100) return { error: "El cupo debe ser de 2 a 100 personas." };
  if (!(level in LEVEL) || !(pace in PACE)) return { error: "Elige el nivel y el ritmo del grupo." };
  if (notes.length > 1000) return { error: "Las notas no pueden pasar de 1,000 caracteres." };

  return {
    values: {
      title,
      starts_at: startsAt.toISOString(),
      meeting_point_label: meetingPoint,
      capacity,
      level,
      pace,
      notes: notes || null,
    },
  };
}

export async function createOuting(route: Target, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser(`/rutas/${route.slug}/convocar`);
  const parsed = parseOutingForm(form);
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await supabase
    .from("outings")
    .insert({ ...parsed.values, route_id: route.id, organizer_id: user.id })
    .select("id")
    .single();
  if (error) {
    console.error("createOuting:", error.message);
    return { error: "No pudimos publicar la salida. Intenta de nuevo." };
  }

  refreshListings(route.slug);
  redirect(`/salidas/${data.id}`);
}

export async function updateOuting(outing: Target, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser(`/salidas/${outing.id}/editar`);
  const parsed = parseOutingForm(form);
  if ("error" in parsed) return { error: parsed.error };

  // organizer_id en el filtro: si no es mía, RLS no actualiza nada y data llega vacía
  const { data, error } = await supabase.from("outings").update(parsed.values).eq("id", outing.id).eq("organizer_id", user.id).select("id");
  if (error) {
    // 23514: guard_outing_update (cupo menor a los inscritos, cancelada o ya pasó)
    if (error.code === "23514") return { error: error.message };
    console.error("updateOuting:", error.message);
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }
  if (!data.length) return { error: "Solo quien organiza puede editar esta salida." };

  refreshListings(outing.slug);
  revalidatePath(`/salidas/${outing.id}`);
  redirect(`/salidas/${outing.id}`);
}

export async function cancelOuting(outing: Target): Promise<ActionState> {
  const { supabase, user } = await requireUser(`/salidas/${outing.id}`);
  const { data, error } = await supabase
    .from("outings")
    .update({ status: "cancelada" })
    .eq("id", outing.id)
    .eq("organizer_id", user.id)
    .select("id");
  if (error) {
    if (error.code === "23514") return { error: error.message };
    console.error("cancelOuting:", error.message);
    return { error: "No pudimos cancelar la salida. Intenta de nuevo." };
  }
  if (!data.length) return { error: "Solo quien organiza puede cancelar esta salida." };

  refreshListings(outing.slug);
  revalidatePath(`/salidas/${outing.id}`);
  return { error: null };
}

export async function joinOuting(outing: Target): Promise<ActionState> {
  const { supabase, user } = await requireUser(`/salidas/${outing.id}`);
  const { error } = await supabase.from("outing_members").insert({ outing_id: outing.id, user_id: user.id });
  // 23505: ya estaba inscrito. 23514: el trigger de cupo (llena o cerrada) con su mensaje en español
  if (error && error.code !== "23505") {
    if (error.code === "23514") return { error: error.message };
    console.error("joinOuting:", error.message);
    return { error: "No pudimos inscribirte. Intenta de nuevo." };
  }
  refreshListings(outing.slug);
  revalidatePath(`/salidas/${outing.id}`);
  return { error: null };
}

export async function leaveOuting(outing: Target): Promise<ActionState> {
  const { supabase, user } = await requireUser(`/salidas/${outing.id}`);
  const { data } = await supabase.from("outings").select("organizer_id").eq("id", outing.id).single();
  if (data?.organizer_id === user.id) return { error: "Quien organiza no puede salirse de su propia salida." };

  const { error } = await supabase.from("outing_members").delete().eq("outing_id", outing.id).eq("user_id", user.id);
  if (error) {
    console.error("leaveOuting:", error.message);
    return { error: "No pudimos sacarte de la salida. Intenta de nuevo." };
  }
  refreshListings(outing.slug);
  revalidatePath(`/salidas/${outing.id}`);
  return { error: null };
}
