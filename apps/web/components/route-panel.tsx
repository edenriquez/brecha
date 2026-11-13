import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, CalendarPlus, ExternalLink, MapPin, Mountain, Ruler } from "lucide-react";
import { DIFFICULTY, formatDuration, formatKm, outingsLabel, ROUTE_TYPE, type RouteSummary } from "@/lib/routes";
import { outingDateParts, spotsLabel, type OutingCardData } from "@/lib/outings";

/**
 * Detalle de una ruta sin salir del mapa: en escritorio ocupa el lugar de la lista ("Volver a la lista" regresa).
 * La página completa tiene el trazo, el perfil y las condiciones.
 * `description`: undefined mientras se pide.
 */
export function RoutePanel({
  route,
  description,
  outings,
  onBack,
}: {
  route: RouteSummary;
  description: string | null | undefined;
  outings: OutingCardData[];
  onBack: () => void;
}) {
  const difficulty = DIFFICULTY[route.difficulty];
  const chip = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] text-on-surface-variant uppercase">
      <span className={clsx("size-1.5 rounded-full", difficulty.dot)} />
      {difficulty.label}
    </span>
  );
  const cover = (
    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface-container">
      {route.cover_url ? (
        <Image src={route.cover_url} alt={route.name} fill sizes="(min-width: 1024px) 720px, 100vw" className="object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary-fixed/50 to-surface-container text-primary-container/70">
          <Mountain className="size-12" aria-hidden />
          <span className="text-sm font-medium">Sin foto todavía</span>
        </div>
      )}
    </div>
  );

  return (
    <article className="space-y-7 px-1 pt-1 pb-12">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-[13px] font-semibold hover:bg-surface-container">
          <ArrowLeft className="size-[15px]" aria-hidden /> Volver a la lista
        </button>
        <Link href={`/rutas/${route.slug}`} className="flex items-center gap-1.5 text-[13px] font-medium text-on-surface-variant hover:text-on-surface">
          Página completa <ExternalLink className="size-[13px]" aria-hidden />
        </Link>
      </div>

      {cover}

      <div>
        {chip}
        <h1 className="mt-3 font-headline text-[28px] leading-tight font-bold">{route.name}</h1>
        <ul className="mt-5 space-y-4">
          <li className="flex gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-on-surface-variant" aria-hidden />
            <p className="text-[15px] font-medium">{route.place_label}</p>
          </li>
          <li className="flex gap-3">
            <Ruler className="mt-0.5 size-5 shrink-0 text-on-surface-variant" aria-hidden />
            <div>
              <p className="text-[15px] font-medium">
                {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m · {formatDuration(route.duration_min)}
              </p>
              <p className="text-[13px] text-on-surface-variant">{ROUTE_TYPE[route.route_type]}</p>
            </div>
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/70 p-4">
        <div>
          <p className="font-headline text-lg font-bold">{outings.length ? outingsLabel(outings.length) : "Sin salidas todavía"}</p>
          <p className="text-xs text-on-surface-variant">{outings.length ? "Súmate a un grupo" : "Organiza la primera"}</p>
        </div>
        <Link
          href={`/rutas/${route.slug}/convocar`}
          className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 font-headline text-sm font-bold text-on-secondary hover:bg-on-secondary-container"
        >
          <CalendarPlus className="size-[18px]" aria-hidden /> Convocar salida
        </Link>
      </div>

      {outings.length > 0 && (
        <section>
          <h2 className="font-headline text-lg font-bold">Próximas salidas</h2>
          <ul className="mt-2 divide-y divide-outline-variant/60">
            {outings.map((o) => {
              const date = outingDateParts(o.starts_at);
              return (
                <li key={o.id}>
                  <Link href={`/salidas/${o.id}`} className="flex justify-between gap-4 py-2.5 text-sm hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.title}</span>
                      <span className="block text-on-surface-variant">
                        {date.long} · {date.time}
                      </span>
                    </span>
                    <span className={clsx("shrink-0 text-right font-semibold", o.members >= o.capacity ? "text-outline" : "text-secondary")}>{spotsLabel(o.capacity, o.members)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(description || route.tags.length > 0) && (
        <section>
          <h2 className="font-headline text-lg font-bold">Sobre la ruta</h2>
          {description && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-on-surface-variant">{description}</p>}
          {route.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {route.tags.map((tag) => (
                <li key={tag} className="rounded-full border border-outline-variant/60 px-2.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Link href={`/rutas/${route.slug}`} className="flex items-center justify-center rounded-xl bg-primary py-3 font-headline text-sm font-bold text-on-primary hover:bg-primary-container">
        Ver trazo, perfil y condiciones
      </Link>
    </article>
  );
}
