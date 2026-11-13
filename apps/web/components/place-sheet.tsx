"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, LocateFixed, MapPin, Mountain, Search, X } from "lucide-react";
import { MY_LOCATION, searchPlaces, STATES, type Place, type PlaceState } from "@/lib/places";
import { AREA_KEY, boxAround, formatArea, matchesQuery, PLACE_KEY, QUERY_KEY, routeHaystack } from "@/lib/route-filters";
import type { RouteSummary } from "@/lib/routes";

/** Margen de la zona alrededor del centro de un municipio, de los municipios de un estado y de tu ubicación. */
const KM = { municipio: 12, estado: 15, gps: 15 };

export type SearchChanges = Record<string, string | null>;

/**
 * Hoja del buscador: escribe y sugiere estados, municipios y rutas (sin servicios externos). Un estado se
 * elige completo o se abre para ver sus municipios. Elegir un lugar fija su zona; Enter busca el texto.
 * `routes`: solo en el explorador, que ya tiene la lista; sin ella no hay grupo de rutas.
 */
export function PlaceSheet({
  query,
  place,
  routes,
  onChange,
  onClose,
}: {
  query: string;
  place: string | null;
  routes?: RouteSummary[];
  onChange: (changes: SearchChanges) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(query);
  const [drill, setDrill] = useState<PlaceState | null>(null);
  const [geo, setGeo] = useState<"idle" | "locating" | "error">("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    if (!text.trim()) return null;
    return { ...searchPlaces(text), routes: (routes ?? []).filter((r) => matchesQuery(routeHaystack(r), text)).slice(0, 6) };
  }, [text, routes]);

  function pick(points: { lat: number; lng: number }[], km: number, code: string) {
    onChange({ [AREA_KEY]: formatArea(boxAround(points, km)), [PLACE_KEY]: code, [QUERY_KEY]: null });
    onClose();
  }
  const pickState = (s: PlaceState) => pick(s.places, KM.estado, s.cve);
  const pickPlace = (p: Place) => pick([p], KM.municipio, p.cvegeo);

  // sin cookie ni GPS al cargar: solo se pide al tocar el botón
  function locateMe() {
    if (!navigator.geolocation) return setGeo("error");
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => pick([{ lat: pos.coords.latitude, lng: pos.coords.longitude }], KM.gps, MY_LOCATION),
      () => setGeo("error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  const current = <span className="ml-auto shrink-0 text-xs font-semibold text-primary">Actual</span>;
  const badge = "grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold";
  const row = "flex w-full min-w-0 items-center gap-3 py-3 text-left";

  const stateRow = (s: PlaceState) => (
    <li key={s.cve} className="flex items-center">
      <button type="button" onClick={() => pickState(s)} className={`${row} flex-1`}>
        <span className={`${badge} bg-surface-container text-on-surface-variant`}>{s.name.slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{s.name}</span>
          <span className="block text-xs text-on-surface-variant">Estado · {s.places.length} municipios</span>
        </span>
        {place === s.cve && current}
      </button>
      <button
        type="button"
        onClick={() => {
          setDrill(s);
          setText("");
        }}
        aria-label={`Ver municipios de ${s.name}`}
        className="grid size-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container"
      >
        <ChevronRight className="size-[18px]" aria-hidden />
      </button>
    </li>
  );
  const placeRow = (p: Place) => (
    <li key={p.cvegeo}>
      <button type="button" onClick={() => pickPlace(p)} className={row}>
        <MapPin className="size-[18px] shrink-0 text-on-surface-variant" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{p.name}</span>
          <span className="block truncate text-xs text-on-surface-variant">{p.state}</span>
        </span>
        {place === p.cvegeo && current}
      </button>
    </li>
  );
  const routeRow = (r: RouteSummary) => (
    <li key={r.id}>
      <Link href={`/rutas/${r.slug}`} onClick={onClose} className={row}>
        <Mountain className="size-[18px] shrink-0 text-primary-container" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{r.name}</span>
          <span className="block truncate text-xs text-on-surface-variant">{r.place_label}</span>
        </span>
      </Link>
    </li>
  );
  const group = (title: string, items: React.ReactNode[]) =>
    items.length > 0 && (
      <>
        <p className="pt-4 text-xs font-semibold tracking-[0.04em] text-on-surface-variant uppercase">{title}</p>
        <ul className="divide-y divide-outline-variant/60">{items}</ul>
      </>
    );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar un lugar"
        className="flex h-[88dvh] w-full max-w-screen-sm flex-col rounded-t-[20px] bg-surface-container-lowest text-on-surface shadow-lg sm:h-auto sm:max-h-[80dvh] sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          role="search"
          className="flex items-center gap-2 border-b border-outline-variant p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ [QUERY_KEY]: text.trim() || null });
            onClose();
          }}
        >
          {drill && (
            <button type="button" onClick={() => setDrill(null)} aria-label="Volver" className="grid size-10 shrink-0 place-items-center rounded-full border border-outline-variant">
              <ChevronLeft className="size-[18px]" aria-hidden />
            </button>
          )}
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-on-surface px-4 py-2.5 focus-within:border-primary">
            <Search className="size-[18px] shrink-0 text-primary" aria-hidden />
            <input
              autoFocus
              type="search"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDrill(null);
              }}
              placeholder={drill ? `Buscar en ${drill.name}` : "Estado, municipio o cerro"}
              aria-label="Buscar un estado, municipio o ruta"
              enterKeyHint="search"
              // 16px: con menos, iOS hace zoom al enfocar
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-on-surface-variant [&::-webkit-search-cancel-button]:hidden"
            />
            {text && (
              <button type="button" onClick={() => setText("")} aria-label="Borrar texto" className="grid size-6 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-high">
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </label>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-10 shrink-0 place-items-center rounded-full border border-outline-variant">
            <X className="size-[18px]" aria-hidden />
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {results ? (
            results.states.length + results.places.length + results.routes.length ? (
              <>
                {group("Estados", results.states.map(stateRow))}
                {group("Municipios", results.places.map(placeRow))}
                {group("Rutas", results.routes.map(routeRow))}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-on-surface-variant">
                No encontramos “{text.trim()}”. Prueba con otro municipio, un estado o el nombre de un cerro.
              </p>
            )
          ) : drill ? (
            <ul className="divide-y divide-outline-variant/60">
              <li>
                <button type="button" onClick={() => pickState(drill)} className={row}>
                  <span className={`${badge} bg-primary text-on-primary`}>{drill.name.slice(0, 2).toUpperCase()}</span>
                  <span className="text-[15px] font-semibold">Todo {drill.name}</span>
                  {place === drill.cve && current}
                </button>
              </li>
              {drill.places.map(placeRow)}
            </ul>
          ) : (
            group("Estados", STATES.map(stateRow))
          )}
        </div>

        <div className="border-t border-outline-variant px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <button
            type="button"
            onClick={locateMe}
            disabled={geo === "locating"}
            className="flex items-center gap-2 text-[13px] font-medium text-on-surface-variant hover:text-primary"
          >
            {geo === "locating" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LocateFixed className="size-3.5" aria-hidden />}
            {geo === "error" ? "No pudimos leer tu ubicación; elige un lugar arriba" : "Usar mi ubicación actual"}
            {place === MY_LOCATION && current}
          </button>
        </div>
      </div>
    </div>
  );
}
