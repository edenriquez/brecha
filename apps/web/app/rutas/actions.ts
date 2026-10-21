"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth.server";
import { analyzeTrack, GpxError, toEWKT, unpackPoints, type TrackAnalysis } from "@/lib/gpx";
import { DIFFICULTY, ROUTE_TYPE, slugify, type RouteStatus } from "@/lib/routes";

export type RouteActionState = { error: string | null };
export type SuggestionState = { error: string | null; sent: boolean };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type ParsedRoute = {
  values: {
    name: string;
    place_label: string;
    description: string | null;
    difficulty: string;
    route_type: string;
    duration_min: number;
    tags: string[];
  };
  /** Solo si se subió un GPX nuevo */
  track: { analysis: TrackAnalysis; gpxPath: string } | null;
  coverPath: string | null;
};

/** Valida el formulario. El navegador sube los archivos a la carpeta del usuario; el trazo se vuelve a analizar aquí. */
function parseRouteForm(form: FormData, userId: string): { error: string } | ParsedRoute {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const name = text("name");
  const placeLabel = text("place_label");
  const description = text("description");
  const difficulty = text("difficulty");
  const routeType = text("route_type");
  const durationMin = Number(text("hours")) * 60 + Number(text("minutes"));
  const tags = [...new Set(text("tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const gpxPath = text("gpx_path");
  const coverPath = text("cover_path");

  if (name.length < 3 || name.length > 80) return { error: "El nombre de la ruta debe tener entre 3 y 80 caracteres." };
  if (placeLabel.length < 3 || placeLabel.length > 80) return { error: "Indica la zona de la ruta (3 a 80 caracteres)." };
  if (description.length > 3000) return { error: "La descripción no puede pasar de 3,000 caracteres." };
  if (!(difficulty in DIFFICULTY) || !(routeType in ROUTE_TYPE)) return { error: "Elige la dificultad y el tipo de ruta." };
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 48 * 60) return { error: "La duración debe ser de 15 minutos a 48 horas." };
  if (tags.length > 8 || tags.some((t) => t.length > 24)) return { error: "Usa hasta 8 etiquetas de máximo 24 caracteres." };
  // solo archivos que este usuario subió a su carpeta
  if (gpxPath && !new RegExp(`^${userId}/${UUID}\\.gpx$`).test(gpxPath)) return { error: "Vuelve a subir el archivo GPX." };
  if (coverPath && !new RegExp(`^${userId}/${UUID}\\.(jpg|png|webp)$`).test(coverPath)) return { error: "Vuelve a subir la foto." };

  let track: ParsedRoute["track"] = null;
  if (gpxPath) {
    try {
      track = { analysis: analyzeTrack(unpackPoints(JSON.parse(text("points"))), { resampled: true }), gpxPath };
    } catch (e) {
      return { error: e instanceof GpxError ? e.message : "El track llegó incompleto. Vuelve a subir el GPX." };
    }
  }

  return {
    values: { name, place_label: placeLabel, description: description || null, difficulty, route_type: routeType, duration_min: durationMin, tags },
    track,
    coverPath: coverPath || null,
  };
}

function trackColumns({ analysis, gpxPath }: NonNullable<ParsedRoute["track"]>) {
  const start = analysis.points[0];
  return {
    distance_km: Math.round(analysis.distanceKm * 10) / 10,
    elevation_gain_m: analysis.gainM ?? 0,
    start_point: `SRID=4326;POINT(${start.lng} ${start.lat})`,
    track: toEWKT(analysis.points),
    elevation_profile: analysis.profile,
    gpx_path: gpxPath,
  };
}

function coverUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from("route-photos").getPublicUrl(path).data.publicUrl;
}

type DbError = { code: string; message: string };
type Write = (slug: string) => PromiseLike<{ error: DbError | null }>;
type Written = { slug: string } | { error: DbError };

/** Slug libre a partir del nombre; si choca, le agrega un sufijo corto. */
async function withFreeSlug(name: string, write: Write): Promise<Written> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
    const { error } = await write(slug);
    if (!error) return { slug };
    if (error.code !== "23505") return { error };
  }
  return { error: { code: "23505", message: "Ya hay rutas con ese nombre. Prueba con uno más específico." } };
}

/** Ruta nueva desde un GPX; queda en revisión. */
export async function createRoute(_prev: RouteActionState, form: FormData): Promise<RouteActionState> {
  const { supabase, user } = await requireUser("/rutas/nueva");
  const parsed = parseRouteForm(form, user.id);
  if ("error" in parsed) return parsed;
  if (!parsed.track) return { error: "Sube el archivo GPX de la ruta." };

  const row = {
    ...parsed.values,
    ...trackColumns(parsed.track),
    cover_url: parsed.coverPath ? coverUrl(supabase, parsed.coverPath) : null,
    status: "revision",
    created_by: user.id,
  };
  const result = await withFreeSlug(parsed.values.name, (slug) => supabase.from("routes").insert({ ...row, slug }));
  if ("error" in result) {
    if (result.error.code === "23505") return { error: result.error.message };
    console.error("createRoute:", result.error.message);
    return { error: "No pudimos guardar la ruta. Intenta de nuevo." };
  }
  revalidatePath("/mis-rutas");
  redirect(`/rutas/nueva/enviada?ruta=${result.slug}`);
}

/**
 * Edita una ruta propia (o cualquiera, si modera). Una publicada conserva su trazo y su dirección;
 * una sin publicar cambia de slug con el nombre, y si estaba rechazada vuelve a revisión (trigger en la base).
 */
export async function updateRoute(route: { id: string; slug: string }, _prev: RouteActionState, form: FormData): Promise<RouteActionState> {
  const { supabase, user } = await requireUser(`/rutas/${route.slug}/editar`);
  const parsed = parseRouteForm(form, user.id);
  if ("error" in parsed) return parsed;

  const { data: current } = await supabase.from("routes").select("status, name, created_by").eq("id", route.id).maybeSingle();
  if (!current) return { error: "No encontramos la ruta." };
  const status = current.status as RouteStatus;
  if (status === "publicada" && parsed.track) {
    const { data: admin } = await supabase.rpc("is_admin");
    if (admin !== true) return { error: "El trazo de una ruta publicada no se puede cambiar." };
  }

  const patch: Record<string, unknown> = { ...parsed.values };
  if (parsed.track) Object.assign(patch, trackColumns(parsed.track));
  if (parsed.coverPath) patch.cover_url = coverUrl(supabase, parsed.coverPath);
  else if (form.get("remove_cover")) patch.cover_url = null;

  const write: Write = async (slug) => {
    const { data, error } = await supabase.from("routes").update({ ...patch, slug }).eq("id", route.id).select("id");
    if (!error && !data.length) return { error: { code: "42501", message: "Solo quien subió la ruta puede editarla." } };
    return { error };
  };
  const renamed = status !== "publicada" && parsed.values.name !== current.name;
  const result: Written = renamed
    ? await withFreeSlug(parsed.values.name, write)
    : await write(route.slug).then(({ error }) => (error ? { error } : { slug: route.slug }));

  if ("error" in result) {
    const { code, message } = result.error;
    if (code === "23514" || code === "23505" || code === "42501") return { error: message };
    console.error("updateRoute:", message);
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }
  const { slug } = result;
  revalidatePath(`/rutas/${route.slug}`);
  revalidatePath(`/rutas/${slug}`);
  revalidatePath("/");
  revalidatePath("/mis-rutas");
  revalidatePath("/revision");
  // la moderación, al corregir una ruta ajena, vuelve a decidir sobre ella
  redirect(current.created_by === user.id ? `/rutas/nueva/enviada?ruta=${slug}` : `/revision/${slug}`);
}

/** Corrección que cualquiera con sesión propone a una ruta publicada; la ve la moderación. */
export async function suggestCorrection(route: { id: string; slug: string }, _prev: SuggestionState, form: FormData): Promise<SuggestionState> {
  const { supabase } = await requireUser(`/rutas/${route.slug}`);
  const message = String(form.get("message") ?? "").trim();
  if (message.length < 10 || message.length > 1000) return { error: "Cuéntanos qué cambió en 10 a 1,000 caracteres.", sent: false };
  const { error } = await supabase.from("route_suggestions").insert({ route_id: route.id, message });
  if (error) {
    console.error("suggestCorrection:", error.message);
    return { error: "No pudimos enviar la sugerencia. Intenta de nuevo.", sent: false };
  }
  revalidatePath("/revision");
  return { error: null, sent: true };
}
