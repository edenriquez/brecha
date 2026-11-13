import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { Mountain } from "lucide-react";
import { FavoriteButton } from "@/components/favorite-button";
import { DIFFICULTY, formatDuration, formatKm, outingsLabel, selectInstead, type RouteSummary } from "@/lib/routes";

/** `onSelect` devuelve true si usó el clic (abrir la ruta junto al mapa); si no, el enlace abre su página. */
export function RouteCard({ route, selected, onSelect, priority }: { route: RouteSummary; selected?: boolean; onSelect?: () => boolean; priority?: boolean }) {
  const difficulty = DIFFICULTY[route.difficulty];
  return (
    // el corazón va fuera del enlace: un botón dentro de <a> no es HTML válido
    <div className="relative">
      <Link
        href={`/rutas/${route.slug}`}
        onClick={onSelect && ((e) => selectInstead(e, onSelect))}
        className={clsx("group block rounded-2xl p-2 transition-colors hover:bg-surface-container/70 focus-visible:bg-surface-container/70 focus-visible:outline-none", selected && "bg-surface-container")}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-container">
          {route.cover_url ? (
            <Image src={route.cover_url} alt={route.name} fill priority={priority} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
              <Mountain className="size-10" aria-hidden />
              <span className="text-xs font-medium">Sin foto todavía</span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-2.5 py-1 text-[11px] font-semibold">
              <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
              {difficulty.label}
            </span>
            {route.upcoming_outings > 0 && (
              <span className="rounded-full bg-on-surface/85 px-2 py-1 text-[11px] font-semibold text-surface">{outingsLabel(route.upcoming_outings)}</span>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-headline text-base leading-snug font-semibold">{route.name}</h3>
            <p className="mt-1 truncate text-sm text-on-surface-variant">{route.place_label}</p>
            <p className="text-sm text-on-surface-variant">
              {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m
            </p>
          </div>
          <span className="mt-0.5 shrink-0 text-[15px] font-semibold">{formatDuration(route.duration_min)}</span>
        </div>
      </Link>
      <div className="absolute top-5 right-5">
        <FavoriteButton routeId={route.id} slug={route.slug} variant="card" />
      </div>
    </div>
  );
}
