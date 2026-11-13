"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LineString } from "geojson";
import clsx from "clsx";
import { Bike, CalendarDays, CarFront, CircleCheck, Footprints, List, Map as MapIcon, Navigation, Route, Search, X } from "lucide-react";
import { Island, ISLAND_ACTION, islandHiddenAfter } from "@/components/island";
import { MountainLoader } from "@/components/mountain-loader";
import { OutingCard } from "@/components/outing-card";
import type { Position } from "@/components/place-sheet";
import { RouteCard } from "@/components/route-card";
import { RouteMap } from "@/components/route-map-lazy";
import { RoutePanel } from "@/components/route-panel";
import { SearchBox } from "@/components/search-box";
import { TopNav } from "@/components/top-nav";
import {
  ACTIVITY_KEY,
  AREA_KEY,
  CATEGORIES,
  CATEGORY_KEY,
  countPanelFilters,
  DIFFICULTY_KEY,
  formatArea,
  matchesCategory,
  matchesFilters,
  matchesQuery,
  parseActivity,
  parseArea,
  PLACE_KEY,
  QUERY_KEY,
  RANGE_KEYS,
  ROUTE_KEY,
  routeHaystack,
  TYPE_KEY,
  type Area,
} from "@/lib/route-filters";
import { ACTIVITY, type Activity, type RouteSummary } from "@/lib/routes";
import type { ProfilePoint } from "@/lib/gpx";
import type { LineCoords } from "@/lib/maplibre";
import type { OutingCardData } from "@/lib/outings";
import { areaAround, describePlace, findState, inPlace, MY_LOCATION } from "@/lib/places";
import { createClient } from "@/lib/supabase/client";
import { useUrlParams } from "@/lib/use-url-params";

/** El breakpoint `lg` de Tailwind: desde ahí la lista y el mapa se ven lado a lado. */
const SIDE_BY_SIDE = "(min-width: 1024px)";
const CLEARED = Object.fromEntries([QUERY_KEY, CATEGORY_KEY, DIFFICULTY_KEY, TYPE_KEY, AREA_KEY, PLACE_KEY, ...RANGE_KEYS].map((k) => [k, null]));
const ACTIVITY_ICON: Record<Activity, React.ReactNode> = {
  hiking: <Footprints className="size-5" />,
  bici: <Bike className="size-5" />,
  offroad: <CarFront className="size-5" />,
};

type Details = { line: LineCoords | null; profile: ProfilePoint[] | null; description: string | null };

/**
 * Lista y mapa, con el modelo de entrelugares: en escritorio la lista va a la izquierda y el mapa fijo a la derecha;
 * elegir una ruta (tarjeta o pin) abre su detalle en el lugar de la lista. En móvil se ve la lista o el mapa.
 * Con una ruta elegida el mapa es solo de ella y "Descargar mapa" lleva a su página.
 */
export function Explorer({ routes: allRoutes, outings: allOutings }: { routes: RouteSummary[]; outings: OutingCardData[] }) {
  const [params, setParams] = useUrlParams();
  const activity = parseActivity(params.get(ACTIVITY_KEY));
  const routes = useMemo(() => allRoutes.filter((r) => r.activity === activity), [allRoutes, activity]);
  const outings = useMemo(() => {
    const ids = new Set(routes.map((r) => r.id));
    return allOutings.filter((o) => ids.has(o.route.id));
  }, [allOutings, routes]);
  const query = params.get(QUERY_KEY) ?? "";
  const category = CATEGORIES.find((c) => c.id === params.get(CATEGORY_KEY))?.id ?? null;
  // solo las categorías que tienen alguna ruta
  const categories = useMemo(() => CATEGORIES.filter((c) => routes.some((r) => matchesCategory(r, c.id))), [routes]);
  const tab = params.get("ver") === "salidas" ? "salidas" : "rutas";
  const areaParam = params.get(AREA_KEY);
  const placeParam = params.get(PLACE_KEY);
  // un estado sin `zona` (enlace escrito a mano) usa la caja de su límite
  const area = useMemo(() => parseArea(areaParam) ?? findState(placeParam)?.bbox ?? null, [areaParam, placeParam]);
  // el lugar del buscador nombra la zona; si es un estado, la lista se recorta a su límite
  const place = area ? describePlace(placeParam) : null;

  // tu posición para el punto azul: solo vale mientras el lugar sea "gps"
  const [position, setPosition] = useState<Position | null>(null);
  const me = placeParam === MY_LOCATION ? position : null;
  // al recargar o llegar con `lugar=gps` no hay posición: se pide una vez; si no llega, queda la zona sin punto
  const askedPosition = useRef(false);
  useEffect(() => {
    if (placeParam !== MY_LOCATION || position || askedPosition.current || !navigator.geolocation) return;
    askedPosition.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const current = new URLSearchParams(window.location.search);
        if (current.get(PLACE_KEY) !== MY_LOCATION) return;
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(at);
        if (!parseArea(current.get(AREA_KEY))) setParams({ [AREA_KEY]: areaAround(at) });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }, [placeParam, position, setParams]);
  // dificultad, rangos y tipo no tienen controles aquí, pero un enlace puede traerlos
  const filtering = Boolean(query.trim() || category || params.get(DIFFICULTY_KEY) || countPanelFilters(params) || area);
  // lo que se ve tras mover el mapa a mano; con él aparece "Buscar en esta zona"
  const [moved, setMoved] = useState<Area | null>(null);
  const canSearchArea = moved !== null && (!area || formatArea(moved) !== formatArea(area));

  const [view, setView] = useState<"lista" | "mapa">("lista");
  // la isla inferior se esconde al bajar por la lista y vuelve al subir; arriba del todo y en el mapa siempre se ve
  const [islandHidden, setIslandHidden] = useState(false);
  const lastScroll = useRef(0);
  // en ambas pestañas la selección es una ruta: es lo que tiene pin en el mapa
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // la lista y el detalle comparten columna: al cerrar el detalle la lista vuelve a donde estaba
  const pane = useRef<HTMLElement>(null);
  const listScroll = useRef(0);
  function select(id: string | null) {
    if (!selectedId && pane.current) listScroll.current = pane.current.scrollTop;
    setSelectedId(id);
  }
  useEffect(() => {
    if (pane.current) pane.current.scrollTop = selectedId ? 0 : listScroll.current;
  }, [selectedId]);

  // llega desde "Abrir en el mapa" de una ruta: la elige (en móvil enseña el mapa) y limpia la URL
  const routeParam = params.get(ROUTE_KEY);
  const [arrivedFor, setArrivedFor] = useState<string | null>(null);
  if (routeParam && routeParam !== arrivedFor) {
    setArrivedFor(routeParam);
    const route = routes.find((r) => r.slug === routeParam);
    if (route) {
      setSelectedId(route.id);
      setView("mapa");
    }
  }
  useEffect(() => {
    if (routeParam) setParams({ [ROUTE_KEY]: null });
  }, [routeParam, setParams]);

  // la zona solo recorta el listado: el mapa sigue mostrando los pines de fuera para poder ir hacia ellos
  const filtered = useMemo(() => routes.filter((r) => matchesFilters(r, params)), [routes, params]);
  const matching = useMemo(() => filtered.filter((r) => matchesQuery(routeHaystack(r), query)), [filtered, query]);
  const visible = useMemo(() => (area ? matching.filter((r) => inPlace(r, area, placeParam)) : matching), [matching, area, placeParam]);
  const matchingOutings = useMemo(() => {
    const byId = new Map(filtered.map((r) => [r.id, r]));
    return outings.filter((o) => {
      const route = byId.get(o.route.id);
      return route && matchesQuery([...routeHaystack(route), o.title, o.meeting_point_label], query);
    });
  }, [filtered, outings, query]);
  const visibleOutings = useMemo(() => {
    if (!area) return matchingOutings;
    const ids = new Set(filtered.filter((r) => inPlace(r, area, placeParam)).map((r) => r.id));
    return matchingOutings.filter((o) => ids.has(o.route.id));
  }, [matchingOutings, area, placeParam, filtered]);
  const mapRoutes = useMemo(() => {
    if (tab === "rutas") return matching;
    const withOutings = new Set(matchingOutings.map((o) => o.route.id));
    return filtered.filter((r) => withOutings.has(r.id));
  }, [tab, matching, filtered, matchingOutings]);
  const selected = mapRoutes.find((r) => r.id === selectedId) ?? null;

  // el trazo, el perfil y la descripción de la ruta elegida se piden al seleccionarla: el listado no carga los de todas
  const [details, setDetails] = useState<Record<string, Details>>({});
  const requested = useRef(new Set<string>());
  // también se adelanta al pasar el cursor por la tarjeta o el pin, para que el recorrido arranque sin esperar
  const loadDetails = useCallback((id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    const supabase = createClient();
    Promise.all([
      supabase.from("route_shapes").select("track, elevation_profile").eq("id", id).maybeSingle(),
      supabase.from("routes_feed").select("description").eq("id", id).maybeSingle(),
    ]).then(([shape, route]) => {
      const line = (shape.data?.track as LineString | undefined)?.coordinates as LineCoords | undefined;
      const profile = shape.data?.elevation_profile as ProfilePoint[] | null | undefined;
      setDetails((d) => ({
        ...d,
        [id]: { line: line ?? null, profile: line && profile && profile.length > 1 ? profile : null, description: (route.data?.description as string | null | undefined) ?? null },
      }));
    });
  }, []);
  useEffect(() => {
    if (selectedId) loadDetails(selectedId);
  }, [selectedId, loadDetails]);
  const detail = selected ? details[selected.id] : undefined;

  // las tarjetas abren el detalle junto al mapa; en móvil la lista tapa el mapa, así que ahí abren la página
  function openBesideMap(id: string) {
    if (!window.matchMedia(SIDE_BY_SIDE).matches) return false;
    select(id);
    return true;
  }

  // "Descargar mapa": la montaña se dibuja un instante y sigue en pantalla hasta que la página de la ruta está lista
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [, startNavigation] = useTransition();
  useEffect(() => {
    if (selected) router.prefetch(`/rutas/${selected.slug}`);
  }, [selected, router]);
  function openRoutePage() {
    if (!selected || leaving) return;
    setLeaving(true);
    const href = `/rutas/${selected.slug}`;
    setTimeout(() => startNavigation(() => router.push(href)), 450);
  }

  return (
    <>
      <TopNav
        search={
          <SearchBox
            query={query}
            place={place ? placeParam : null}
            routes={routes}
            onChange={(changes, at) => {
              // la zona elegida reemplaza a la que se veía tras mover el mapa
              if (AREA_KEY in changes) setMoved(null);
              // elegir un lugar deja entrada en el historial (atrás regresa al anterior); el texto solo reemplaza
              const picked = PLACE_KEY in changes;
              if (picked) setPosition(at ?? null);
              setParams(changes, { push: picked });
            }}
          />
        }
      />
      <main className="relative flex flex-1 overflow-hidden">
        <section
          ref={pane}
          className={clsx("@container h-full w-full overflow-y-auto bg-surface px-3 py-4 sm:px-4 lg:block lg:w-auto lg:min-w-0 lg:flex-1", view === "mapa" && "hidden")}
          onScroll={(e) => {
            const hidden = islandHiddenAfter(e.currentTarget.scrollTop, lastScroll);
            if (hidden !== null) setIslandHidden(hidden);
          }}
        >
          {selected && (
            <div className="hidden lg:block">
              <RoutePanel route={selected} description={detail?.description} outings={outings.filter((o) => o.route.id === selected.id)} onBack={() => select(null)} />
            </div>
          )}
          <div className={clsx(selected && "lg:hidden")}>
            <div className="px-2">
              <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-container">
                <Navigation className="size-3.5 fill-primary-container" aria-hidden />
                {place ? `Rutas ${place.where}` : "Rutas cerca de Ciudad de México"}
              </p>

              <div className="mb-3 grid grid-cols-3 gap-2">
                {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
                  <ActivityTile
                    key={a}
                    icon={ACTIVITY_ICON[a]}
                    title={ACTIVITY[a].label}
                    subtitle={ACTIVITY[a].subtitle}
                    enabled={ACTIVITY[a].enabled}
                    active={a === activity}
                    onClick={() => {
                      select(null);
                      setParams({ [ACTIVITY_KEY]: a === "hiking" ? null : a, [CATEGORY_KEY]: null });
                    }}
                  />
                ))}
              </div>

              <div role="tablist" className="mb-3 flex items-center rounded-full border border-outline-variant/50 bg-surface-container p-1">
                <Tab active={tab === "rutas"} onClick={() => setParams({ ver: null })}>
                  <Route className="size-4" aria-hidden />
                  Rutas
                </Tab>
                <Tab active={tab === "salidas"} onClick={() => setParams({ ver: "salidas" })}>
                  <CalendarDays className="size-4" aria-hidden />
                  Salidas próximas
                  {outings.length > 0 && <span className="rounded-full bg-secondary px-1.5 text-[10px] font-bold text-on-secondary">{outings.length}</span>}
                </Tab>
              </div>

              <div className="no-scrollbar -mx-2 flex items-center gap-2 overflow-x-auto px-2 py-1">
                {area && (
                  <>
                    <Chip active onClick={() => setParams({ [AREA_KEY]: null, [PLACE_KEY]: null })}>
                      <span aria-hidden>📍</span>
                      {place?.label ?? "Zona del mapa"}
                      <X className="size-4" aria-label="Quitar" />
                    </Chip>
                    <span className="mx-1 h-5 w-px shrink-0 bg-outline-variant" aria-hidden />
                  </>
                )}
                <Chip active={!category} onClick={() => setParams({ [CATEGORY_KEY]: null })}>
                  <span aria-hidden>🧭</span>
                  Todo
                </Chip>
                {categories.map((c) => (
                  <Chip key={c.id} active={category === c.id} onClick={() => setParams({ [CATEGORY_KEY]: category === c.id ? null : c.id })}>
                    <span aria-hidden>{c.emoji}</span>
                    {c.label}
                  </Chip>
                ))}
              </div>

              <div className="flex items-end justify-between gap-3 pt-5 pb-2">
                <div>
                  <h2 className="font-headline text-[22px] leading-tight font-bold">{tab === "rutas" ? "Rutas" : "Salidas próximas"}</h2>
                  <p className="mt-0.5 text-[13px] text-on-surface-variant">
                    {tab === "rutas" ? routesHeading(visible.length, routes.length, filtering) : outingsHeading(visibleOutings.length, outings.length, filtering)}
                  </p>
                </div>
                {filtering && (
                  <button type="button" onClick={() => setParams(CLEARED)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {tab === "rutas" ? (
              visible.length ? (
                <div className={CARDS}>
                  {visible.map((route, i) => (
                    <div key={route.id} onPointerEnter={() => loadDetails(route.id)}>
                      <RouteCard route={route} priority={i < 2} onSelect={() => openBesideMap(route.id)} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>
                  {area && matching.length
                    ? place
                      ? `Todavía no hay rutas ${place.where}. Prueba con otro lugar o aléjate en el mapa.`
                      : "No hay rutas en esta zona del mapa. Aléjate un poco y busca de nuevo."
                    : filtering
                      ? "Ninguna ruta coincide con tu búsqueda."
                      : activity === "hiking"
                        ? "Todavía no hay rutas publicadas."
                        : `Todavía no hay rutas ${ACTIVITY[activity].label.toLowerCase()} publicadas.`}{" "}
                  {filtering && <ClearLink onClick={() => setParams(CLEARED)} />}
                </Empty>
              )
            ) : visibleOutings.length ? (
              <div className={CARDS}>
                {visibleOutings.map((outing) => (
                  <OutingCard key={outing.id} outing={outing} onSelect={() => openBesideMap(outing.route.id)} />
                ))}
              </div>
            ) : (
              <Empty>
                {filtering ? (
                  <>
                    Ninguna salida coincide con tu búsqueda. <ClearLink onClick={() => setParams(CLEARED)} />
                  </>
                ) : (
                  <>
                    Nadie ha convocado una salida todavía.{" "}
                    <button type="button" onClick={() => setParams({ ver: null })} className="font-semibold text-primary underline-offset-2 hover:underline">
                      Elige una ruta
                    </button>{" "}
                    y convoca la primera.
                  </>
                )}
              </Empty>
            )}
          </div>
        </section>

        <section
          className={clsx(
            "relative h-full w-full overflow-hidden bg-[#e3e8e1] lg:block lg:w-[42%] lg:min-w-[440px] lg:shrink-0 lg:border-l lg:border-outline-variant/50",
            view === "lista" && "hidden",
          )}
        >
          <RouteMap
            routes={mapRoutes}
            selectedId={selectedId}
            onSelect={select}
            track={detail ? detail.line : undefined}
            profile={detail?.profile ?? null}
            area={area}
            me={me}
            onUserMove={setMoved}
            mode={tab}
            onMode={(mode) => setParams({ ver: mode === "salidas" ? "salidas" : null })}
            outingCount={outings.length}
            onBack={() => select(null)}
            onDownload={openRoutePage}
            onPeek={loadDetails}
          />
          {canSearchArea && !selected && (
            <button
              type="button"
              onClick={() => {
                if (!moved) return;
                setParams({ [AREA_KEY]: formatArea(moved), [PLACE_KEY]: null });
                setMoved(null);
                setView("lista");
              }}
              // debajo del selector Rutas / Salidas del mapa
              className="absolute top-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 font-headline text-sm font-semibold whitespace-nowrap text-on-surface shadow-lg ring-1 ring-outline-variant/60 transition-transform hover:scale-105 active:scale-95"
            >
              <Search className="size-4 text-primary" aria-hidden />
              Buscar en esta zona
            </button>
          )}
        </section>

        {/* isla: con el menú del perfil abierto (aria-expanded) no se esconde. Con una ruta elegida el mapa es solo de ella: se vuelve con su botón de regreso */}
        {!(selected && view === "mapa") && (
          <Island hidden={islandHidden && view === "lista"} className="lg:hidden">
            <button
              type="button"
              onClick={() => {
                setView((v) => (v === "lista" ? "mapa" : "lista"));
                setIslandHidden(false);
              }}
              className={ISLAND_ACTION}
            >
              {view === "lista" ? <MapIcon className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
              {view === "lista" ? "Ver mapa" : "Ver lista"}
            </button>
          </Island>
        )}
      </main>
      {leaving && <MountainLoader />}
    </>
  );
}

/** Una columna en teléfono; dos o tres según el ancho de la columna de la lista. */
const CARDS = "grid grid-cols-1 gap-x-1 gap-y-2 pb-24 @xl:grid-cols-2 @5xl:grid-cols-3 lg:pb-6";

function routesHeading(shown: number, total: number, filtering: boolean) {
  if (filtering) return `${shown} de ${total} ${total === 1 ? "ruta" : "rutas"}`;
  return shown === 1 ? "1 ruta popular en la región" : `${shown} rutas populares en la región`;
}

function outingsHeading(shown: number, total: number, filtering: boolean) {
  if (filtering) return `${shown} de ${total} ${total === 1 ? "salida" : "salidas"}`;
  return shown === 1 ? "1 salida convocada" : `${shown} salidas convocadas`;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        active ? "border-on-surface bg-on-surface text-surface" : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-on-surface",
      )}
    >
      {children}
    </button>
  );
}

function ActivityTile({
  icon,
  title,
  subtitle,
  enabled,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  enabled: boolean;
  active: boolean;
  onClick: () => void;
}) {
  if (!enabled) {
    return (
      <div aria-disabled className="relative cursor-not-allowed rounded-xl border-2 border-outline-variant/40 bg-surface-container px-2.5 py-2 opacity-75">
        <div className="mb-1 flex items-start justify-between text-outline">
          {icon}
          <span className="hidden rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant @lg:inline">Próximamente</span>
        </div>
        <p className="font-headline text-[13px] font-semibold text-on-surface-variant">{title}</p>
        <p className="truncate text-[11px] text-outline">
          <span className="@lg:hidden">Próximamente</span>
          <span className="hidden @lg:inline">{subtitle}</span>
        </p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "relative rounded-xl border-2 px-2.5 py-2 text-left transition-colors",
        active ? "border-primary-container bg-surface-container-lowest shadow-xs" : "border-outline-variant/40 bg-surface-container-lowest hover:border-primary/50",
      )}
    >
      <div className={clsx("mb-1 flex items-start justify-between", active ? "text-primary-container" : "text-on-surface-variant")}>
        {icon}
        {active && <CircleCheck className="size-4 fill-primary-container text-surface-container-lowest" aria-hidden />}
      </div>
      <p className={clsx("font-headline text-[13px]", active ? "font-bold text-primary" : "font-semibold text-on-surface")}>{title}</p>
      <p className="truncate text-[11px] text-on-surface-variant">{subtitle}</p>
    </button>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 font-headline text-xs whitespace-nowrap transition-colors sm:px-4",
        active ? "bg-primary font-bold text-on-primary shadow-sm" : "font-semibold text-on-surface-variant hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function ClearLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-primary underline-offset-2 hover:underline">
      Limpiar filtros
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mx-2 rounded-xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">{children}</p>;
}
