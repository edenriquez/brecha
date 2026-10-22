"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { addRoutePhotos, deleteRoutePhoto, type CommunityState } from "@/app/rutas/community-actions";
import { PHOTOS_PER_UPLOAD, type RoutePhoto } from "@/lib/community";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { createClient } from "@/lib/supabase/client";
import { useIsAdmin, useSessionUser } from "@/lib/use-session-user";

type Target = { id: string; slug: string };
type Draft = { key: string; blob: Blob; url: string; width: number; height: number; caption: string };

const PREVIEW_COUNT = 8;
const FILE_MAX = 25 * 1024 * 1024;
const BUTTON = "shrink-0 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary";

export function RoutePhotos({ route, photos }: { route: Target; photos: RoutePhoto[] }) {
  const user = useSessionUser();
  const admin = useIsAdmin(user);
  const [showAll, setShowAll] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reading, setReading] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = showAll ? photos : photos.slice(0, PREVIEW_COUNT);

  async function pick(files: FileList | null) {
    setPickError(null);
    const list = [...(files ?? [])].slice(0, PHOTOS_PER_UPLOAD - drafts.length);
    if (input.current) input.current.value = "";
    if (!list.length) return;
    setReading(true);
    const next: Draft[] = [];
    for (const file of list) {
      if (file.size > FILE_MAX) {
        setPickError("Alguna foto pesa más de 25 MB y no la agregamos.");
        continue;
      }
      try {
        const { blob, width, height } = await shrinkPhoto(file);
        next.push({ key: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), width, height, caption: "" });
      } catch {
        setPickError("No pudimos leer alguna foto. Usa JPG, PNG o WebP.");
      }
    }
    setDrafts((d) => [...d, ...next]);
    setReading(false);
  }

  function discard(key?: string) {
    setDrafts((d) =>
      d.filter((draft) => {
        if (key && draft.key !== key) return true;
        URL.revokeObjectURL(draft.url);
        return false;
      }),
    );
  }

  const canDelete = (p: RoutePhoto) => admin || p.author.id === user?.id;

  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-headline text-lg font-bold">
            <Camera className="size-5 text-primary" aria-hidden />
            Fotos de la comunidad
            {photos.length > 0 && <span className="text-sm font-semibold text-on-surface-variant">{photos.length}</span>}
          </h2>
          <p className="text-xs text-on-surface-variant">Cómo se ve la ruta según quienes la caminaron</p>
        </div>
        {user !== undefined &&
          (user ? (
            <>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick(e.target.files)} />
              {drafts.length < PHOTOS_PER_UPLOAD && (
                <button type="button" onClick={() => input.current?.click()} disabled={reading} className={`${BUTTON} flex items-center gap-1.5 disabled:opacity-60`}>
                  {reading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ImagePlus className="size-3.5" aria-hidden />}
                  {reading ? "Preparando…" : drafts.length ? "Agregar más" : "Subir fotos"}
                </button>
              )}
            </>
          ) : (
            <Link href={`/entrar?next=/rutas/${route.slug}`} className={BUTTON}>
              Entra para subir fotos
            </Link>
          ))}
      </div>

      {pickError && <p className="text-xs font-semibold text-error">{pickError}</p>}
      {user && drafts.length > 0 && (
        <Uploader
          route={route}
          userId={user.id}
          drafts={drafts}
          onCaption={(key, caption) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, caption } : x)))}
          onDiscard={discard}
        />
      )}

      {photos.length ? (
        <>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {shown.map((photo, i) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setViewing(i)}
                  className="relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-container focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <Image src={photo.url} alt={photo.caption ?? "Foto de la ruta"} fill sizes="(min-width: 1024px) 200px, 33vw" className="object-cover transition-transform hover:scale-105" />
                </button>
              </li>
            ))}
          </ul>
          {photos.length > PREVIEW_COUNT && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs font-semibold text-primary hover:underline">
              {showAll ? "Ver menos" : `Ver las ${photos.length} fotos`}
            </button>
          )}
        </>
      ) : (
        drafts.length === 0 && (
          <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
            Todavía no hay fotos. ¿Caminaste esta ruta? Comparte cómo se ve.
          </p>
        )
      )}

      {viewing !== null && photos[viewing] && (
        <Lightbox photos={photos} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} slug={route.slug} canDelete={canDelete} />
      )}
    </section>
  );
}

function Uploader({
  route,
  userId,
  drafts,
  onCaption,
  onDiscard,
}: {
  route: Target;
  userId: string;
  drafts: Draft[];
  onCaption: (key: string, caption: string) => void;
  onDiscard: (key?: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, formAction, saving] = useActionState<CommunityState, FormData>(async (prev, form) => {
    const result = await addRoutePhotos(route, prev, form);
    if (result.done) onDiscard();
    return result;
  }, { error: null, done: false });

  async function publish() {
    setUploading(true);
    setUploadError(null);
    const storage = createClient().storage.from("route-photos");
    try {
      const photos = [];
      for (const d of drafts) {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error } = await storage.upload(path, d.blob, { contentType: "image/jpeg" });
        if (error) throw error;
        photos.push({ path, caption: d.caption.trim(), width: d.width, height: d.height });
      }
      const form = new FormData();
      form.set("photos", JSON.stringify(photos));
      startTransition(() => formAction(form));
    } catch (e) {
      console.error("upload:", e);
      setUploadError("No pudimos subir las fotos. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || saving;
  return (
    <div className="space-y-3 rounded-xl border border-outline-variant/60 p-4">
      <ul className="space-y-3">
        {drafts.map((d) => (
          <li key={d.key} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
            <img src={d.url} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
            <input
              value={d.caption}
              onChange={(e) => onCaption(d.key, e.target.value)}
              maxLength={140}
              disabled={busy}
              aria-label="Descripción de la foto"
              placeholder="Descripción (opcional): la vista desde la cumbre"
              className="min-w-0 flex-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
            />
            <button type="button" onClick={() => onDiscard(d.key)} disabled={busy} aria-label="Quitar foto" className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-error">
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-on-surface-variant">
          {uploadError ?? state.error ? (
            <span className="font-semibold text-error">{uploadError ?? state.error}</span>
          ) : (
            "Solo fotos tuyas de la ruta. Quitamos la ubicación y los datos de la cámara."
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onDiscard()} disabled={busy} className="px-2 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {busy ? "Publicando…" : drafts.length === 1 ? "Publicar foto" : `Publicar ${drafts.length} fotos`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  slug,
  canDelete,
}: {
  photos: RoutePhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  slug: string;
  canDelete: (p: RoutePhoto) => boolean;
}) {
  const photo = photos[index];
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (step: number) => onIndex((index + step + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, photos.length, onIndex, onClose]);

  function remove() {
    if (!window.confirm("¿Borrar esta foto?")) return;
    start(async () => {
      const result = await deleteRoutePhoto({ id: photo.id, path: photo.path, slug });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div role="dialog" aria-modal aria-label="Foto de la ruta" className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold">
          {index + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2">
          {canDelete(photo) && (
            <button type="button" onClick={remove} disabled={pending} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
              <Trash2 className="size-4" aria-hidden />
              {pending ? "Borrando…" : "Borrar"}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-2 hover:bg-white/10">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14">
        <Image
          key={photo.id}
          src={photo.url}
          alt={photo.caption ?? "Foto de la ruta"}
          width={photo.width}
          height={photo.height}
          sizes="100vw"
          className="max-h-full w-auto max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Foto anterior"
              className="absolute left-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Foto siguiente"
              className="absolute right-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <Avatar person={photo.author} size={32} className="border-0" />
        <div className="min-w-0">
          {photo.caption && <p className="text-sm">{photo.caption}</p>}
          <p className="text-xs text-white/70">
            {photo.author.display_name ?? "Senderista de Brecha"} ·{" "}
            {new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric" }).format(new Date(photo.created_at))}
          </p>
          {error && <p className="text-xs font-semibold text-red-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
