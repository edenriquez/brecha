import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { CalendarDays, MapPin, Mountain, Navigation } from "lucide-react";
import { DIFFICULTY, formatKm } from "@/lib/routes";
import { outingDateParts, spotsLabel, type OutingCardData } from "@/lib/outings";

export function OutingCard({
  outing,
  selected,
  onSelect,
  preview,
}: {
  outing: OutingCardData;
  selected?: boolean;
  onSelect?: () => void;
  /** Vista previa del formulario: sin enlace y sin hover */
  preview?: boolean;
}) {
  const { route } = outing;
  const date = outingDateParts(outing.starts_at);
  const full = outing.members >= outing.capacity;
  const difficulty = DIFFICULTY[route.difficulty];
  const className = clsx(
    "group flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest transition-all",
    !preview && "hover:shadow-md focus:outline-none",
    selected ? "border-2 border-primary-container shadow-sm ring-2 ring-primary-container/20" : "border border-outline-variant/60 shadow-xs",
  );

  const body = (
    <>
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-container">
        {route.cover_url ? (
          <Image src={route.cover_url} alt={route.name} fill sizes="(min-width: 1024px) 28vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
            <Mountain className="size-10" aria-hidden />
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-surface-container-lowest/95 px-2 py-0.5 text-[11px] font-semibold shadow-xs">
          <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
          {difficulty.label}
        </span>
        <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-md bg-surface-container-lowest/95 px-2.5 py-1 text-xs font-bold shadow-sm">
          <CalendarDays className="size-3.5 text-secondary" aria-hidden />
          {date.weekday} {date.day} {date.month} · {date.time}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div>
          <h3 className="line-clamp-2 font-headline text-sm leading-snug font-bold group-hover:text-primary">{outing.title || "Ponle nombre a tu salida"}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
            <MapPin className="size-3 text-outline" aria-hidden />
            {route.name} · {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m
          </p>
        </div>
        <p className="flex items-center gap-1.5 rounded-lg bg-surface-container px-2.5 py-1.5 text-xs text-on-surface-variant">
          <Navigation className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{outing.meeting_point_label || "Punto de encuentro"}</span>
        </p>
        <div className="mt-auto border-t border-outline-variant/40 pt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
            <span className="text-on-surface-variant">
              {outing.members}/{outing.capacity} senderistas
            </span>
            <span className={full ? "text-outline" : "text-secondary"}>{spotsLabel(outing.capacity, outing.members)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
            <div className="h-full rounded-full bg-secondary-container" style={{ width: `${Math.min((outing.members / outing.capacity) * 100, 100)}%` }} />
          </div>
        </div>
      </div>
    </>
  );

  if (preview) return <article className={className}>{body}</article>;
  return (
    <Link href={`/salidas/${outing.id}`} onMouseEnter={onSelect} onFocus={onSelect} className={className}>
      {body}
    </Link>
  );
}
