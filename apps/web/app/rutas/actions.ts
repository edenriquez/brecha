"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth.server";
import { analyzeTrack, GpxError, toEWKT, unpackPoints } from "@/lib/gpx";
import { DIFFICULTY, ROUTE_TYPE, slugify } from "@/lib/routes";

export type RouteActionState = { error: string | null };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Ruta nueva desde un GPX. El navegador sube los archivos a la carpeta del usuario; los números se recalculan aquí. */
export async function createRoute(_prev: RouteActionState, form: FormData): Promise<RouteActionState> {
  const { supabase, user } = await requireUser("/rutas/nueva");
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
  if (!new RegExp(`^${user.id}/${UUID}\\.gpx$`).test(gpxPath)) return { error: "Vuelve a subir el archivo GPX." };
  if (coverPath && !new RegExp(`^${user.id}/${UUID}\\.(jpg|png|webp)$`).test(coverPath)) return { error: "Vuelve a subir la foto." };

  let track;
  try {
    track = analyzeTrack(unpackPoints(JSON.parse(text("points"))), { resampled: true });
  } catch (e) {
    return { error: e instanceof GpxError ? e.message : "El track llegó incompleto. Vuelve a subir el GPX." };
  }
  const start = track.points[0];

  const row = {
    name,
    place_label: placeLabel,
    description: description || null,
    difficulty,
    route_type: routeType,
    duration_min: durationMin,
    tags,
    distance_km: Math.round(track.distanceKm * 10) / 10,
    elevation_gain_m: track.gainM ?? 0,
    start_point: `SRID=4326;POINT(${start.lng} ${start.lat})`,
    track: toEWKT(track.points),
    elevation_profile: track.profile,
    gpx_path: gpxPath,
    cover_url: coverPath ? supabase.storage.from("route-photos").getPublicUrl(coverPath).data.publicUrl : null,
    status: "revision",
    created_by: user.id,
  };

  const base = slugify(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
    const { error } = await supabase.from("routes").insert({ ...row, slug });
    if (!error) redirect(`/rutas/nueva/enviada?ruta=${slug}`);
    if (error.code !== "23505") {
      console.error("createRoute:", error.message);
      return { error: "No pudimos guardar la ruta. Intenta de nuevo." };
    }
  }
  return { error: "Ya hay rutas con ese nombre. Prueba con uno más específico." };
}
