import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { CalendarDays, Mountain } from "lucide-react";
import { DIFFICULTY, formatKm, selectInstead } from "@/lib/routes";
import { outingDateParts, spotsLabel, type OutingCardData } from "@/lib/outings";

export function OutingCard({
  outing,
  selected,
  onSelect,
  preview,
  tag,
  muted,
}: {
  outing: OutingCardData;
  selected?: boolean;
  /** Devuelve true si usó el clic (enfocar en el mapa); si no, el enlace abre la salida */
  onSelect?: () => boolean;
  /** Vista previa del formulario: sin enlace y sin hover */
  preview?: boolean;
  /** Etiqueta en la esquina de la foto, p. ej. "Organizas" o "Cancelada" */
  tag?: { label: string; tone: "primary" | "neutral" | "error" };
  /** Salidas pasadas o canceladas */
  muted?: boolean;
}) {
  const { route } = outing;
  const date = outingDateParts(outing.starts_at);
  const full = outing.members >= outing.capacity;
  const difficulty = DIFFICULTY[route.difficulty];
  const className = clsx(
    "group block rounded-2xl p-2 transition-colors",
    !preview && "hover:bg-surface-container/70 focus-visible:bg-surface-container/70 focus-visible:outline-none",
    muted && "opacity-70 grayscale-[40%] hover:opacity-100 hover:grayscale-0",
    selected && "bg-surface-container",
  );

  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface-container">
        {route.cover_url ? (
          <Image src={route.cover_url} alt={route.name} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
            <Mountain className="size-10" aria-hidden />
          </div>
        )}
        <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-2.5 py-1 text-[11px] font-semibold">
          <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
          {difficulty.label}
        </span>
        {tag && (
          <span
            className={clsx(
              "absolute top-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-bold",
              tag.tone === "primary" && "bg-primary text-on-primary",
              tag.tone === "neutral" && "bg-surface-container-lowest/95 text-on-surface-variant",
              tag.tone === "error" && "bg-error text-white",
            )}
          >
            {tag.label}
          </span>
        )}
        <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-2.5 py-1 text-xs font-bold">
          <CalendarDays className="size-3.5 text-secondary" aria-hidden />
          {date.weekday} {date.day} {date.month} · {date.time}
        </span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-headline text-base leading-snug font-semibold">{outing.title || "Ponle nombre a tu salida"}</h3>
          <p className="mt-1 truncate text-sm text-on-surface-variant">
            {route.name} · {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m
          </p>
          <p className="truncate text-sm text-on-surface-variant">{outing.meeting_point_label || "Punto de encuentro"}</p>
        </div>
        <div className="mt-0.5 shrink-0 text-right">
          <p className={clsx("text-sm font-semibold", full ? "text-outline" : "text-secondary")}>{spotsLabel(outing.capacity, outing.members)}</p>
          <p className="text-xs text-on-surface-variant">
            {outing.members}/{outing.capacity} van
          </p>
        </div>
      </div>
    </>
  );

  if (preview) return <article className={className}>{body}</article>;
  return (
    <Link href={`/salidas/${outing.id}`} onClick={onSelect && ((e) => selectInstead(e, onSelect))} className={className}>
      {body}
    </Link>
  );
}
