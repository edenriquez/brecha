"use client";

import { useActionState, useRef, useState } from "react";
import { keepValues } from "@/lib/forms";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { updateProfile, type ProfileState } from "@/app/perfil/actions";
import { AREA_MAX, BIO_MAX, NAME_MAX, NAME_MIN, type Profile } from "@/lib/profiles";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { createClient } from "@/lib/supabase/client";

const AVATAR_SIDE = 512;
const FILE_MAX = 25 * 1024 * 1024;
const FIELD = "w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none";
const BUTTON = "flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:border-primary-container hover:text-primary disabled:opacity-60";

/** "keep" y "remove" como en updateProfile; `path` es la foto nueva ya subida. */
type AvatarChoice = { kind: "keep" } | { kind: "remove" } | { kind: "new"; path: string; preview: string };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, save, saving] = useActionState<ProfileState, FormData>(updateProfile, { error: null });
  const [name, setName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState<AvatarChoice>({ kind: "keep" });
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const storage = () => createClient().storage.from("avatars");
  const shown = avatar.kind === "remove" ? { ...profile, display_name: name, avatar_path: null, avatar_url: null } : { ...profile, display_name: name };
  const hasPhoto = avatar.kind === "new" || (avatar.kind === "keep" && !!(profile.avatar_path || profile.avatar_url));

  /** La foto que se eligió antes y no se guardó no se queda en storage. */
  async function dropDraft() {
    if (avatar.kind !== "new") return;
    URL.revokeObjectURL(avatar.preview);
    await storage().remove([avatar.path]);
  }

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setPhotoError(null);
    if (file.size > FILE_MAX) return setPhotoError("La foto pesa más de 25 MB.");
    setUploading(true);
    try {
      const { blob } = await shrinkPhoto(file, AVATAR_SIDE, { square: true });
      const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await storage().upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      await dropDraft();
      setAvatar({ kind: "new", path, preview: URL.createObjectURL(blob) });
    } catch (e) {
      console.error("avatar:", e);
      setPhotoError("No pudimos subir la foto. Usa JPG, PNG o WebP e intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    await dropDraft();
    setAvatar({ kind: "remove" });
  }

  return (
    <form onSubmit={keepValues(save)} className="space-y-6 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs sm:p-8">
      <input type="hidden" name="avatar" value={avatar.kind === "new" ? avatar.path : avatar.kind} />

      <div className="flex items-center gap-5">
        {avatar.kind === "new" ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={avatar.preview} alt="" className="size-24 shrink-0 rounded-full object-cover ring-4 ring-primary-fixed" />
        ) : (
          <Avatar person={shown} size={96} className="ring-4 ring-primary-fixed" />
        )}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Foto de perfil</p>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={uploading || saving} className={BUTTON}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ImagePlus className="size-3.5" aria-hidden />}
              {uploading ? "Subiendo…" : hasPhoto ? "Cambiar foto" : "Subir foto"}
            </button>
            {hasPhoto && (
              <button type="button" onClick={remove} disabled={uploading || saving} className={`${BUTTON} hover:text-error`}>
                <Trash2 className="size-3.5" aria-hidden />
                Quitar
              </button>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">{photoError ? <span className="font-semibold text-error">{photoError}</span> : "Se recorta en cuadrado. Quitamos la ubicación y los datos de la cámara."}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="display_name" className="text-sm font-semibold">
          Nombre
        </label>
        <input
          id="display_name"
          name="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={NAME_MIN}
          maxLength={NAME_MAX}
          autoComplete="name"
          className={FIELD}
        />
        <p className="text-xs text-on-surface-variant">Como quieres que te reconozcan en las salidas.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="home_area" className="text-sm font-semibold">
          Dónde caminas <span className="font-normal text-on-surface-variant">(opcional)</span>
        </label>
        <input id="home_area" name="home_area" defaultValue={profile.home_area ?? ""} maxLength={AREA_MAX} placeholder="Coyoacán, CDMX" className={FIELD} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="bio" className="text-sm font-semibold">
            Sobre ti <span className="font-normal text-on-surface-variant">(opcional)</span>
          </label>
          <span className="font-mono text-[11px] text-on-surface-variant">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="Camino casi todos los domingos en el Ajusco. Me gustan las subidas largas y los desayunos al bajar."
          className={FIELD}
        />
      </div>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-outline-variant/40 pt-5 sm:flex-row sm:items-center">
        <p className="text-xs font-semibold text-error">{state.error}</p>
        <button
          disabled={saving || uploading}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Guardando…" : "Guardar perfil"}
        </button>
      </div>
    </form>
  );
}
