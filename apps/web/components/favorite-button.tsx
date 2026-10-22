"use client";

import Link from "next/link";
import clsx from "clsx";
import { Heart } from "lucide-react";
import { setFavorite, useFavorites } from "@/lib/use-favorites";
import { useSessionUser } from "@/lib/use-session-user";

/** `card`: corazón sobre la foto, solo con sesión. `detail`: botón junto a Compartir. */
export function FavoriteButton({ routeId, slug, variant }: { routeId: string; slug: string; variant: "card" | "detail" }) {
  const user = useSessionUser();
  const favorites = useFavorites(user);
  const saved = !!favorites?.has(routeId);
  const label = saved ? "Quitar de guardadas" : "Guardar ruta";

  if (variant === "card") {
    if (!favorites) return null;
    return (
      <button
        type="button"
        onClick={() => setFavorite(routeId, !saved)}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className="flex size-8 items-center justify-center rounded-full bg-surface-container-lowest/95 shadow-xs backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
      >
        <Heart className={clsx("size-4", saved ? "fill-secondary text-secondary" : "text-on-surface-variant")} aria-hidden />
      </button>
    );
  }

  const className =
    "inline-flex items-center gap-1.5 rounded-full border border-outline-variant/80 bg-surface-container-lowest px-3.5 py-2 text-xs font-semibold shadow-xs transition-all hover:bg-surface-container active:scale-95";
  if (user === null) {
    return (
      <Link href={`/entrar?next=/rutas/${slug}`} className={className}>
        <Heart className="size-4" aria-hidden />
        Guardar
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => setFavorite(routeId, !saved)} disabled={!favorites} aria-pressed={saved} className={clsx(className, "disabled:opacity-60")}>
      <Heart className={clsx("size-4", saved && "fill-secondary text-secondary")} aria-hidden />
      {saved ? "Guardada" : "Guardar"}
    </button>
  );
}
