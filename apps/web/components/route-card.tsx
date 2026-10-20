import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { MapPin, Mountain } from "lucide-react";
import { DIFFICULTY, formatDuration, formatKm, outingsLabel, type RouteSummary } from "@/lib/routes";

export function RouteCard({
  route,
  selected,
  onSelect,
  priority,
}: {
  route: RouteSummary;
  selected: boolean;
  onSelect: () => void;
  priority?: boolean;
}) {
  const difficulty = DIFFICULTY[route.difficulty];
  return (
    <Link
      href={`/rutas/${route.slug}`}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      className={clsx(
        "group flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest transition-all hover:shadow-md focus:outline-none",
        selected
          ? "border-2 border-primary-container shadow-sm ring-2 ring-primary-container/20"
          : "border border-outline-variant/60 shadow-xs hover:border-primary/50",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container">
        {route.cover_url ? (
          <Image
            src={route.cover_url}
            alt={route.name}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 26vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
            <Mountain className="size-10" aria-hidden />
            <span className="text-xs font-medium">Sin foto todavía</span>
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-surface-container-lowest/95 px-2 py-0.5 text-[11px] font-semibold shadow-xs backdrop-blur-sm">
          <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
          {difficulty.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-on-surface-variant">
            <MapPin className="size-3 text-outline" aria-hidden />
            {route.place_label}
          </p>
          <h3
            className={clsx(
              "line-clamp-2 font-headline text-sm font-bold leading-snug transition-colors group-hover:text-primary",
              selected ? "text-primary" : "text-on-surface",
            )}
          >
            {route.name}
          </h3>
        </div>
        <div className="mt-3 border-t border-outline-variant/40 pt-2.5">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span className="font-medium text-on-surface">{formatKm(route.distance_km)}</span>
            <span aria-hidden>•</span>
            <span>↑ {route.elevation_gain_m.toLocaleString("es-MX")} m</span>
            <span aria-hidden>•</span>
            <span>{formatDuration(route.duration_min)}</span>
          </div>
          {route.upcoming_outings > 0 && (
            <p className="mt-2.5 rounded-full bg-secondary-fixed/50 px-2 py-1 text-[11px] font-semibold text-on-secondary-container">
              {outingsLabel(route.upcoming_outings)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
