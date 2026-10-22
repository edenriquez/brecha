"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Image from "next/image";
import clsx from "clsx";
import { ArrowDown, ArrowUp, CheckCircle2, FileUp, ImagePlus, Loader2, Mountain, Ruler, Send, TriangleAlert, X } from "lucide-react";
import { createRoute, updateRoute, type RouteActionState } from "@/app/rutas/actions";
import { ElevationProfile } from "@/components/elevation-profile";
import { TrackMap } from "@/components/route-map-lazy";
import { fillElevationFromDem } from "@/lib/dem";
import { analyzeTrack, GpxError, packPoints, parseGpx, parseGpxName, suggestDifficulty, type ProfilePoint, type TrackAnalysis } from "@/lib/gpx";
import type { LineCoords } from "@/lib/maplibre";
import { DIFFICULTY, formatKm, ROUTE_TYPE, type Difficulty, type RouteFields, type RouteStatus, type RouteSummary } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

const input =
  "w-full rounded-lg border border-outline bg-surface-container-lowest px-3.5 py-2.5 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none";
const label = "mb-1.5 block font-headline text-sm font-bold";
const hint = "mt-1.5 text-xs text-on-surface-variant";

const GPX_MAX = 5 * 1024 * 1024;
const PHOTO_MAX = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const EMPTY: RouteFields = { name: "", place_label: "", difficulty: "moderada", route_type: "ida_vuelta", duration_min: 0, description: "", tags: "", cover_url: null };

export type TrackPreview = {
  line: LineCoords;
  profile: ProfilePoint[] | null;
  distanceKm: number;
  gainM: number | null;
};

export type EditingRoute = {
  id: string;
  slug: string;
  status: RouteStatus;
  fields: RouteFields;
  track: TrackPreview | null;
  /** Una ruta publicada conserva su trazo; la moderación sí puede cambiarlo */
  canEditTrack: boolean;
};

type Loaded = { file: File; analysis: TrackAnalysis; demElevation: boolean };
type RouteType = RouteSummary["route_type"];

/** Sin `editing` sube una ruta nueva desde un GPX; con él edita una existente. */
export function RouteForm({ userId, editing }: { userId: string; editing?: EditingRoute }) {
  const action = editing ? updateRoute.bind(null, { id: editing.id, slug: editing.slug }) : createRoute;
  const [state, formAction, saving] = useActionState<RouteActionState, FormData>(action, { error: null });
  const initial = editing?.fields ?? EMPTY;
  const canEditTrack = editing?.canEditTrack ?? true;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const [name, setName] = useState(initial.name);
  const [placeLabel, setPlaceLabel] = useState(initial.place_label);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty);
  const [suggested, setSuggested] = useState<Difficulty | null>(null);
  const [routeType, setRouteType] = useState<RouteType>(initial.route_type);
  const [hours, setHours] = useState(Math.floor(initial.duration_min / 60));
  const [minutes, setMinutes] = useState(initial.duration_min % 60);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(initial.tags);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  // un reintento tras un error de validación no vuelve a subir los mismos archivos
  const uploaded = useRef(new Map<File, string>());

  useEffect(() => {
    if (photo) return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const preview = useMemo<TrackPreview | null>(() => {
    if (!loaded) return editing?.track ?? null;
    const { analysis } = loaded;
    return { line: analysis.points.map((p) => [p.lng, p.lat] as [number, number]), profile: analysis.profile, distanceKm: analysis.distanceKm, gainM: analysis.gainM };
  }, [loaded, editing]);
  const point = active !== null && preview?.profile ? preview.profile[active] : null;
  const eles = preview?.profile?.map((p) => p[1]);

  async function readGpx(file: File) {
    setFileError(null);
    if (file.size > GPX_MAX) return setFileError("El archivo pesa más de 5 MB.");
    setReading("Leyendo el GPX…");
    try {
      const xml = await file.text();
      let analysis = analyzeTrack(parseGpx(xml));
      let demElevation = false;
      if (!analysis.profile) {
        setReading("El GPX no trae altitud: la calculamos con el modelo de elevación…");
        try {
          analysis = analyzeTrack(await fillElevationFromDem(analysis.points), { resampled: true });
          demElevation = true;
        } catch {
          // sin modelo de elevación la ruta se guarda sin perfil ni desnivel
        }
      }
      setLoaded({ file, analysis, demElevation });
      setReplacing(false);
      setActive(null);
      setName((n) => n || (parseGpxName(xml) ?? file.name.replace(/\.gpx$/i, "").replace(/[-_]+/g, " ")).slice(0, 80));
      const level = suggestDifficulty(analysis.distanceKm, analysis.gainM ?? 0, analysis.maxEle);
      setSuggested(level);
      setRouteType(analysis.routeType);
      // al editar, lo que ya escribió quien la subió manda sobre la estimación
      if (!editing) {
        setDifficulty(level);
        setHours(Math.floor(analysis.durationMin / 60));
        setMinutes(analysis.durationMin % 60);
      }
    } catch (e) {
      setFileError(e instanceof GpxError ? e.message : "No pudimos leer el archivo. ¿Es un GPX?");
    } finally {
      setReading(null);
    }
  }

  function pickPhoto(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    if (!PHOTO_TYPES[file.type]) return setUploadError("La foto debe ser JPG, PNG o WebP.");
    if (file.size > PHOTO_MAX) return setUploadError("La foto pesa más de 10 MB.");
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  async function upload(bucket: string, file: File, ext: string, contentType: string) {
    const cached = uploaded.current.get(file);
    if (cached) return cached;
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from(bucket).upload(path, file, { contentType });
    if (error) throw error;
    uploaded.current.set(file, path);
    return path;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing && !loaded) return;
    const form = new FormData(e.currentTarget);
    setUploading(true);
    setUploadError(null);
    try {
      if (loaded) {
        form.set("gpx_path", await upload("route-tracks", loaded.file, "gpx", "application/gpx+xml"));
        form.set("points", JSON.stringify(packPoints(loaded.analysis.points)));
      }
      if (photo) form.set("cover_path", await upload("route-photos", photo.file, PHOTO_TYPES[photo.file.type], photo.file.type));
      else if (removeCover) form.set("remove_cover", "1");
    } catch (err) {
      console.error("upload:", err);
      setUploadError("No pudimos subir los archivos. Revisa tu conexión e intenta de nuevo.");
      return;
    } finally {
      setUploading(false);
    }
    startTransition(() => formAction(form));
  }

  if (!editing && !loaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Dropzone reading={reading} error={fileError} onFile={readGpx} />
        <p className="text-center text-xs text-on-surface-variant">
          Exporta el track desde Wikiloc, Strava, AllTrails, Komoot o tu reloj. Calculamos distancia, desnivel, tipo y duración a partir del archivo.
        </p>
      </div>
    );
  }

  const busy = uploading || saving;
  const error = uploadError ?? state.error;
  const cover = photo?.url ?? (removeCover ? null : initial.cover_url);
  const submitLabel = !editing ? "Enviar a revisión" : editing.status === "rechazada" ? "Guardar y enviar a revisión" : "Guardar cambios";
  const footnote = !editing
    ? "La ruta aparece en el mapa cuando la revisemos."
    : editing.status === "publicada"
      ? "Los cambios se ven en la ruta al guardar."
      : editing.status === "rechazada"
        ? "Al guardar, la ruta vuelve a revisión."
        : "La ruta sigue en revisión.";

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <form onSubmit={onSubmit} className="space-y-6 lg:col-span-7">
        <section className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm sm:p-7">
          <div>
            <label className={label} htmlFor="name">
              Nombre de la ruta
            </label>
            <input id="name" name="name" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cerro del Tepozteco" className={input} />
            {editing?.status === "publicada" && <p className={hint}>La dirección de la página no cambia aunque cambies el nombre.</p>}
          </div>

          <div>
            <label className={label} htmlFor="place_label">
              Zona
            </label>
            <input
              id="place_label"
              name="place_label"
              required
              minLength={3}
              maxLength={80}
              value={placeLabel}
              onChange={(e) => setPlaceLabel(e.target.value)}
              placeholder="Tepoztlán, Morelos"
              className={input}
            />
            <p className={hint}>Pueblo, parque o sierra donde empieza la ruta.</p>
          </div>

          <fieldset>
            <legend className={label}>Dificultad</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
                <label
                  key={key}
                  className={clsx(
                    "relative flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs transition-all",
                    difficulty === key
                      ? "border-primary-container bg-primary-container font-bold text-on-primary shadow-sm"
                      : "border-outline-variant bg-surface-container-lowest font-semibold hover:border-primary",
                  )}
                >
                  <input type="radio" name="difficulty" value={key} checked={difficulty === key} onChange={() => setDifficulty(key)} className="sr-only" />
                  <span className={clsx("size-2 rounded-full", DIFFICULTY[key].dot)} />
                  {DIFFICULTY[key].label}
                  {suggested === key && (
                    <span className="absolute -top-2 right-1.5 rounded-full bg-secondary-fixed px-1.5 text-[9px] font-bold text-secondary uppercase">Sugerida</span>
                  )}
                </label>
              ))}
            </div>
            {suggested && <p className={hint}>La sugerimos por distancia, desnivel y altura; ajústala si conoces el terreno.</p>}
          </fieldset>

          <fieldset>
            <legend className={label}>Tipo de ruta</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(ROUTE_TYPE) as RouteType[]).map((key) => (
                <label
                  key={key}
                  className={clsx(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs transition-all",
                    routeType === key
                      ? "border-primary-container bg-primary-container font-bold text-on-primary shadow-sm"
                      : "border-outline-variant bg-surface-container-lowest font-semibold hover:border-primary",
                  )}
                >
                  <input type="radio" name="route_type" value={key} checked={routeType === key} onChange={() => setRouteType(key)} className="sr-only" />
                  {routeType === key && <CheckCircle2 className="size-4" aria-hidden />}
                  {ROUTE_TYPE[key]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={label}>Duración caminando</legend>
            <div className="flex items-center gap-2">
              <input name="hours" type="number" aria-label="Horas" required min={0} max={48} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={clsx(input, "max-w-20")} />
              <span className="text-sm text-on-surface-variant">h</span>
              <input name="minutes" type="number" aria-label="Minutos" required min={0} max={45} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={clsx(input, "max-w-20")} />
              <span className="text-sm text-on-surface-variant">min</span>
            </div>
            {loaded && !editing && <p className={hint}>Estimada con el método MIDE (4 km/h en plano, 400 m/h de subida), sin contar paradas.</p>}
          </fieldset>

          <div>
            <label className={label} htmlFor="description">
              Descripción <span className="font-body font-normal text-on-surface-variant">(opcional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={5}
              maxLength={3000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cómo es el camino, qué se ve, dónde hay agua o sombra, cuándo conviene ir…"
              className={input}
            />
          </div>

          <div>
            <label className={label} htmlFor="tags">
              Etiquetas <span className="font-body font-normal text-on-surface-variant">(opcional)</span>
            </label>
            <input id="tags" name="tags" maxLength={220} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bosque, cascada, mirador" className={input} />
            <p className={hint}>Separadas por comas, hasta 8.</p>
          </div>

          <div>
            <span className={label}>
              Foto de portada <span className="font-body font-normal text-on-surface-variant">(opcional)</span>
            </span>
            {cover ? (
              <div className="relative h-44 overflow-hidden rounded-xl border border-outline-variant">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                  <img src={photo.url} alt="Foto de portada elegida" className="h-full w-full object-cover" />
                ) : (
                  <Image src={cover} alt="Foto de portada actual" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => (photo ? setPhoto(null) : setRemoveCover(true))}
                  aria-label="Quitar foto"
                  className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-on-surface/70 text-surface hover:bg-on-surface"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-outline-variant px-4 py-4 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary">
                <ImagePlus className="size-5" aria-hidden />
                Elegir una foto (JPG, PNG o WebP, máximo 10 MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pickPhoto(e.target.files?.[0])} className="sr-only" />
              </label>
            )}
          </div>
        </section>

        <div className="flex flex-col items-stretch gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-on-surface-variant" role={error ? "alert" : undefined}>
            {error ? <span className="font-semibold text-error">{error}</span> : footnote}
          </p>
          <button
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-secondary-container px-5 py-2.5 font-headline text-sm font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {uploading ? "Subiendo archivos…" : saving ? "Guardando…" : submitLabel}
          </button>
        </div>
      </form>

      <aside className="order-first lg:order-none lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="flex min-w-0 items-center gap-2 font-headline text-xs font-bold tracking-wider uppercase">
              <span className="size-2.5 shrink-0 rounded-full bg-primary-container" />
              <span className="truncate">{loaded?.file.name ?? (preview ? "Trazo actual" : "Sin trazo")}</span>
            </span>
            {canEditTrack && (preview || replacing) && (
              <button
                type="button"
                onClick={() => {
                  setFileError(null);
                  setReplacing((r) => !r);
                }}
                disabled={busy || !!reading}
                className="shrink-0 text-xs font-semibold text-on-surface-variant hover:text-primary disabled:opacity-50"
              >
                {replacing ? "Cancelar" : "Cambiar GPX"}
              </button>
            )}
          </div>

          {replacing || !preview ? (
            canEditTrack ? (
              <Dropzone reading={reading} error={fileError} onFile={readGpx} compact />
            ) : (
              <p className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">Esta ruta no tiene trazo GPX.</p>
            )
          ) : (
            <div className="overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest shadow-sm">
              <div className="relative h-64 bg-[#e3e8e1] sm:h-72">
                <TrackMap line={preview.line} hover={point ? [point[2], point[3]] : null} />
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t border-outline-variant/50 p-4 sm:grid-cols-4">
                <Stat icon={<Ruler className="size-3.5" />} label="Distancia" value={formatKm(Math.round(preview.distanceKm * 10) / 10)} />
                <Stat icon={<ArrowUp className="size-3.5" />} label="Desnivel" value={preview.gainM === null ? "—" : `${preview.gainM.toLocaleString("es-MX")} m`} />
                <Stat icon={<Mountain className="size-3.5" />} label="Máxima" value={eles ? `${Math.max(...eles).toLocaleString("es-MX")} m` : "—"} />
                <Stat icon={<ArrowDown className="size-3.5" />} label="Mínima" value={eles ? `${Math.min(...eles).toLocaleString("es-MX")} m` : "—"} />
              </dl>
              <div className="border-t border-outline-variant/50 p-4">
                {preview.profile ? (
                  <>
                    <ElevationProfile profile={preview.profile} active={active} onActive={setActive} />
                    {loaded?.demElevation && <p className="mt-2 text-[11px] text-on-surface-variant">El GPX no traía altitud: la tomamos del modelo de elevación del terreno.</p>}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <TriangleAlert className="size-4 shrink-0 text-secondary" aria-hidden />
                    El GPX no trae altitud y no pudimos calcularla: la ruta se guardará sin perfil ni desnivel.
                  </p>
                )}
              </div>
            </div>
          )}
          {editing && !canEditTrack && <p className="px-1 text-[11px] text-on-surface-variant">El trazo de una ruta publicada ya no cambia: su dirección y sus salidas dependen de él.</p>}
        </div>
      </aside>
    </div>
  );
}

function Dropzone({ reading, error, onFile, compact }: { reading: string | null; error: string | null; onFile: (file: File) => void; compact?: boolean }) {
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          "flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-surface-container-lowest px-6 text-center transition-colors",
          compact ? "py-10" : "py-14",
          dragging ? "border-primary bg-primary-fixed/20" : "border-outline-variant hover:border-primary-container",
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-fixed/60 text-primary">
          {reading ? <Loader2 className="size-7 animate-spin" aria-hidden /> : <FileUp className="size-7" aria-hidden />}
        </span>
        <span>
          <span className={clsx("block font-headline font-bold", compact ? "text-base" : "text-lg")}>{reading ?? "Arrastra aquí el GPX de la ruta"}</span>
          {!reading && <span className="mt-1 block text-sm text-on-surface-variant">o haz clic para elegirlo · máximo 5 MB</span>}
        </span>
        <input
          type="file"
          accept=".gpx,application/gpx+xml"
          disabled={!!reading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
          className="sr-only"
        />
      </label>
      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-error/10 px-3.5 py-2.5 text-sm font-semibold text-error">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">
        {icon}
        {label}
      </dt>
      <dd className="font-headline text-sm font-bold">{value}</dd>
    </div>
  );
}
