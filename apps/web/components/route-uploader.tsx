"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, CheckCircle2, FileUp, ImagePlus, Loader2, Mountain, Ruler, Send, TriangleAlert, X } from "lucide-react";
import { createRoute, type RouteActionState } from "@/app/rutas/actions";
import { ElevationProfile } from "@/components/elevation-profile";
import { TrackMap } from "@/components/route-map-lazy";
import { fillElevationFromDem } from "@/lib/dem";
import { analyzeTrack, GpxError, packPoints, parseGpx, parseGpxName, suggestDifficulty, type TrackAnalysis } from "@/lib/gpx";
import { DIFFICULTY, formatKm, ROUTE_TYPE, type Difficulty, type RouteSummary } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

const input =
  "w-full rounded-lg border border-outline bg-surface-container-lowest px-3.5 py-2.5 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none";
const label = "mb-1.5 block font-headline text-sm font-bold";
const hint = "mt-1.5 text-xs text-on-surface-variant";

const GPX_MAX = 5 * 1024 * 1024;
const PHOTO_MAX = 10 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Loaded = { file: File; track: TrackAnalysis; demElevation: boolean };
type RouteType = RouteSummary["route_type"];

export function RouteUploader({ userId }: { userId: string }) {
  const [state, formAction, saving] = useActionState<RouteActionState, FormData>(createRoute, { error: null });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("moderada");
  const [suggested, setSuggested] = useState<Difficulty | null>(null);
  const [routeType, setRouteType] = useState<RouteType>("ida_vuelta");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  // un reintento tras un error de validación no vuelve a subir los mismos archivos
  const uploaded = useRef(new Map<File, string>());

  useEffect(() => {
    if (photo) return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const line = useMemo(() => loaded?.track.points.map((p) => [p.lng, p.lat] as [number, number]) ?? [], [loaded]);
  const profile = loaded?.track.profile ?? null;
  const point = active !== null && profile ? profile[active] : null;

  async function readGpx(file: File) {
    setFileError(null);
    if (file.size > GPX_MAX) return setFileError("El archivo pesa más de 5 MB.");
    setReading("Leyendo el GPX…");
    try {
      const xml = await file.text();
      let track = analyzeTrack(parseGpx(xml));
      let demElevation = false;
      if (!track.profile) {
        setReading("El GPX no trae altitud: la calculamos con el modelo de elevación…");
        try {
          track = analyzeTrack(await fillElevationFromDem(track.points), { resampled: true });
          demElevation = true;
        } catch {
          // sin modelo de elevación la ruta se guarda sin perfil ni desnivel
        }
      }
      setLoaded({ file, track, demElevation });
      setActive(null);
      setName((n) => n || (parseGpxName(xml) ?? file.name.replace(/\.gpx$/i, "").replace(/[-_]+/g, " ")).slice(0, 80));
      const level = suggestDifficulty(track.distanceKm, track.gainM ?? 0, track.maxEle);
      setDifficulty(level);
      setSuggested(level);
      setRouteType(track.routeType);
      setHours(Math.floor(track.durationMin / 60));
      setMinutes(track.durationMin % 60);
    } catch (e) {
      setFileError(e instanceof GpxError ? e.message : "No pudimos leer el archivo. ¿Es un GPX?");
    } finally {
      setReading(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readGpx(file);
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
    if (!loaded) return;
    const form = new FormData(e.currentTarget);
    setUploading(true);
    setUploadError(null);
    try {
      form.set("gpx_path", await upload("route-tracks", loaded.file, "gpx", "application/gpx+xml"));
      if (photo) form.set("cover_path", await upload("route-photos", photo.file, PHOTO_TYPES[photo.file.type], photo.file.type));
    } catch (err) {
      console.error("upload:", err);
      setUploadError("No pudimos subir los archivos. Revisa tu conexión e intenta de nuevo.");
      return;
    } finally {
      setUploading(false);
    }
    form.set("points", JSON.stringify(packPoints(loaded.track.points)));
    startTransition(() => formAction(form));
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            "flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-surface-container-lowest px-6 py-14 text-center transition-colors",
            dragging ? "border-primary bg-primary-fixed/20" : "border-outline-variant hover:border-primary-container",
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-fixed/60 text-primary">
            {reading ? <Loader2 className="size-7 animate-spin" aria-hidden /> : <FileUp className="size-7" aria-hidden />}
          </span>
          <span>
            <span className="block font-headline text-lg font-bold">{reading ?? "Arrastra aquí el GPX de la ruta"}</span>
            {!reading && <span className="mt-1 block text-sm text-on-surface-variant">o haz clic para elegirlo · máximo 5 MB</span>}
          </span>
          <input
            type="file"
            accept=".gpx,application/gpx+xml"
            disabled={!!reading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) readGpx(file);
            }}
            className="sr-only"
          />
        </label>
        {fileError && (
          <p role="alert" className="flex items-center gap-2 rounded-lg bg-error/10 px-3.5 py-2.5 text-sm font-semibold text-error">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {fileError}
          </p>
        )}
        <p className="text-center text-xs text-on-surface-variant">
          Exporta el track desde Wikiloc, Strava, AllTrails, Komoot o tu reloj. Calculamos distancia, desnivel, tipo y duración a partir del archivo.
        </p>
      </div>
    );
  }

  const { track } = loaded;
  const busy = uploading || saving;
  const error = uploadError ?? state.error;

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <form onSubmit={onSubmit} className="space-y-6 lg:col-span-7">
        <section className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm sm:p-7">
          <div>
            <label className={label} htmlFor="name">
              Nombre de la ruta
            </label>
            <input id="name" name="name" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cerro del Tepozteco" className={input} />
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
            <p className={hint}>La sugerimos por distancia, desnivel y altura; ajústala si conoces el terreno.</p>
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
            <p className={hint}>Estimada con el método MIDE (4 km/h en plano, 400 m/h de subida), sin contar paradas.</p>
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
            {photo ? (
              <div className="relative h-44 overflow-hidden rounded-xl border border-outline-variant">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={photo.url} alt="Foto de portada elegida" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
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
            {error ? <span className="font-semibold text-error">{error}</span> : "La ruta aparece en el mapa cuando la revisemos."}
          </p>
          <button
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-secondary-container px-5 py-2.5 font-headline text-sm font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {uploading ? "Subiendo archivos…" : saving ? "Guardando…" : "Enviar a revisión"}
          </button>
        </div>
      </form>

      <aside className="order-first lg:order-none lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="flex items-center justify-between px-1">
            <span className="flex min-w-0 items-center gap-2 font-headline text-xs font-bold tracking-wider uppercase">
              <span className="size-2.5 shrink-0 rounded-full bg-primary-container" />
              <span className="truncate">{loaded.file.name}</span>
            </span>
            <button
              type="button"
              onClick={() => setLoaded(null)}
              disabled={busy}
              className="shrink-0 text-xs font-semibold text-on-surface-variant hover:text-primary disabled:opacity-50"
            >
              Cambiar archivo
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest shadow-sm">
            <div className="relative h-64 bg-[#e3e8e1] sm:h-72">
              <TrackMap line={line} hover={point ? [point[2], point[3]] : null} />
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-outline-variant/50 p-4 sm:grid-cols-4">
              <Stat icon={<Ruler className="size-3.5" />} label="Distancia" value={formatKm(Math.round(track.distanceKm * 10) / 10)} />
              <Stat icon={<ArrowUp className="size-3.5" />} label="Subida" value={track.gainM === null ? "—" : `${track.gainM.toLocaleString("es-MX")} m`} />
              <Stat icon={<ArrowDown className="size-3.5" />} label="Bajada" value={track.lossM === null ? "—" : `${track.lossM.toLocaleString("es-MX")} m`} />
              <Stat icon={<Mountain className="size-3.5" />} label="Máxima" value={track.maxEle === null ? "—" : `${track.maxEle.toLocaleString("es-MX")} m`} />
            </dl>
            <div className="border-t border-outline-variant/50 p-4">
              {profile ? (
                <>
                  <ElevationProfile profile={profile} active={active} onActive={setActive} />
                  {loaded.demElevation && <p className="mt-2 text-[11px] text-on-surface-variant">El GPX no traía altitud: la tomamos del modelo de elevación del terreno.</p>}
                </>
              ) : (
                <p className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <TriangleAlert className="size-4 shrink-0 text-secondary" aria-hidden />
                  El GPX no trae altitud y no pudimos calcularla: la ruta se guardará sin perfil ni desnivel.
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>
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
