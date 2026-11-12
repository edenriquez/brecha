import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { MapPin, Mountain } from "lucide-react";
import { FavoriteButton } from "@/components/favorite-button";
import { DIFFICULTY, formatDuration, formatKm, outingsLabel, selectInstead, type RouteSummary } from "@/lib/routes";

/**
 * `onSelect` devuelve true si usó el clic (enfocar en el mapa); si no, el enlace abre la ruta.
 * `compact` es para el panel junto al mapa, donde van tres por fila.
 */
export function RouteCard({
  route,
  selected,
  onSelect,
  priority,
  compact,
}: {
  route: RouteSummary;
  selected?: boolean;
  onSelect?: () => boolean;
  priority?: boolean;
  compact?: boolean;
}) {
  const difficulty = DIFFICULTY[route.difficulty];
  return (
    // el corazón va fuera del enlace: un botón dentro de <a> no es HTML válido
    <div className="relative">
      <Link
        href={`/rutas/${route.slug}`}
        onClick={onSelect && ((e) => selectInstead(e, onSelect))}
        className={clsx(
          "group flex h-full flex-col overflow-hidden rounded-xl bg-surface-container-lowest transition-all hover:shadow-md focus:outline-none",
          selected ? "border-2 border-primary-container shadow-sm ring-2 ring-primary-container/20" : "border border-outline-variant/60 shadow-xs hover:border-primary/50",
        )}
      >
        <div className={clsx("relative w-full overflow-hidden bg-surface-container", compact ? "aspect-[16/10]" : "aspect-[4/3]")}>
          {route.cover_url ? (
            <Image
              src={route.cover_url}
              alt={route.name}
              fill
              priority={priority}
              sizes={compact ? "(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw" : "(min-width: 1280px) 18vw, (min-width: 1024px) 26vw, (min-width: 640px) 50vw, 100vw"}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
              <Mountain className={compact ? "size-7" : "size-10"} aria-hidden />
              <span className={clsx("font-medium", compact ? "text-[11px]" : "text-xs")}>Sin foto todavía</span>
            </div>
          )}
          <span
            className={clsx(
              "absolute flex items-center gap-1 rounded-full bg-surface-container-lowest/95 font-semibold shadow-xs backdrop-blur-sm",
              compact ? "top-2 left-2 px-1.5 py-px text-[10px]" : "top-2.5 left-2.5 px-2 py-0.5 text-[11px]",
            )}
          >
            <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
            {difficulty.label}
          </span>
        </div>
        <div className={clsx("flex flex-1 flex-col justify-between", compact ? "p-2.5" : "p-3.5")}>
          <div>
            <p className={clsx("mb-1 flex items-center gap-1 font-medium text-on-surface-variant", compact ? "text-[11px]" : "text-xs")}>
              <MapPin className="size-3 shrink-0 text-outline" aria-hidden />
              <span className="truncate">{route.place_label}</span>
            </p>
            <h3
              className={clsx(
                "line-clamp-2 font-headline font-bold leading-snug transition-colors group-hover:text-primary",
                compact ? "text-[13px]" : "text-sm",
                selected ? "text-primary" : "text-on-surface",
              )}
            >
              {route.name}
            </h3>
          </div>
          <div className={clsx("border-t border-outline-variant/40", compact ? "mt-2 pt-2" : "mt-3 pt-2.5")}>
            <div className={clsx("flex items-center justify-between text-on-surface-variant", compact ? "text-[11px]" : "text-xs")}>
              <span className="font-medium text-on-surface">{formatKm(route.distance_km)}</span>
              <span aria-hidden>•</span>
              <span>↑ {route.elevation_gain_m.toLocaleString("es-MX")} m</span>
              <span aria-hidden>•</span>
              <span>{formatDuration(route.duration_min)}</span>
            </div>
            {route.upcoming_outings > 0 && (
              <p
                className={clsx(
                  "rounded-full bg-secondary-fixed/50 font-semibold text-on-secondary-container",
                  compact ? "mt-2 truncate px-2 py-0.5 text-[10px]" : "mt-2.5 px-2 py-1 text-[11px]",
                )}
              >
                {outingsLabel(route.upcoming_outings)}
              </p>
            )}
          </div>
        </div>
      </Link>
      <div className={clsx("absolute", compact ? "top-1.5 right-1.5 scale-90" : "top-2.5 right-2.5")}>
        <FavoriteButton routeId={route.id} slug={route.slug} variant="card" />
      </div>
    </div>
  );
}
