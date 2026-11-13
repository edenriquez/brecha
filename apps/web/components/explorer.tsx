"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LineString } from "geojson";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Bike,
  CalendarDays,
  CarFront,
  ChevronRight,
  CircleCheck,
  Footprints,
  List,
  Map as MapIcon,
  MapPinned,
  Mountain,
  Navigation,
  Route,
  Search,
  X,
} from "lucide-react";
import { OutingCard } from "@/components/outing-card";
import { RouteCard } from "@/components/route-card";
import { RouteMap } from "@/components/route-map-lazy";
import type { Position } from "@/components/place-sheet";
import { SearchBox } from "@/components/search-box";
import { TopNav } from "@/components/top-nav";
import { UserMenu } from "@/components/user-menu";
import {
  ACTIVITY_KEY,
  AREA_KEY,
  countPanelFilters,
  DIFFICULTY_KEY,
  formatArea,
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
import { ACTIVITY, DIFFICULTY, formatDuration, formatKm, type Activity, type Difficulty, type RouteSummary } from "@/lib/routes";
import type { ProfilePoint } from "@/lib/gpx";
import type { LineCoords } from "@/lib/maplibre";
import type { OutingCardData } from "@/lib/outings";
import { areaAround, describePlace, findState, inPlace, MY_LOCATION } from "@/lib/places";
import { createClient } from "@/lib/supabase/client";
import { useUrlParams } from "@/lib/use-url-params";

const DIFFICULTIES: Difficulty[] = ["facil", "moderada", "dificil"];
/** El breakpoint `lg` de Tailwind: desde ahí la lista y el mapa se ven lado a lado. */
const SIDE_BY_SIDE = "(min-width: 1024px)";
const CLEARED = Object.fromEntries([QUERY_KEY, DIFFICULTY_KEY, TYPE_KEY, AREA_KEY, PLACE_KEY, ...RANGE_KEYS].map((k) => [k, null]));
const ACTIVITY_ICON: Record<Activity, React.ReactNode> = {
  hiking: <Footprints className="size-5" />,
  bici: <Bike className="size-5" />,
  offroad: <CarFront className="size-5" />,
};

export function Explorer({ routes: allRoutes, outings: allOutings }: { routes: RouteSummary[]; outings: OutingCardData[] }) {
  const [params, setParams] = useUrlParams();
  const activity = parseActivity(params.get(ACTIVITY_KEY));
  const routes = useMemo(() => allRoutes.filter((r) => r.activity === activity), [allRoutes, activity]);
  const outings = useMemo(() => {
    const ids = new Set(routes.map((r) => r.id));
    return allOutings.filter((o) => ids.has(o.route.id));
  }, [allOutings, routes]);
  const query = params.get(QUERY_KEY) ?? "";
  const difficulty = params.get(DIFFICULTY_KEY);
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
  // rangos y tipo no tienen controles aquí, pero un enlace puede traerlos
  const filtering = Boolean(query.trim() || difficulty || countPanelFilters(params) || area);
  // lo que se ve tras mover el mapa a mano; con él aparece "Buscar en esta zona"
  const [moved, setMoved] = useState<Area | null>(null);
  const canSearchArea = moved !== null && (!area || formatArea(moved) !== formatArea(area));

  const [view, setView] = useState<"lista" | "mapa">("lista");
  // la isla inferior se esconde al bajar por la lista y vuelve al subir; arriba del todo y en el mapa siempre se ve
  const [islandHidden, setIslandHidden] = useState(false);
  const lastScroll = useRef(0);
  // en ambas pestañas la selección es una ruta: es lo que tiene pin en el mapa
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const router = useRouter();

  // el trazo y el perfil de la ruta elegida se piden al seleccionarla: el listado no carga los de todas
  const [shapes, setShapes] = useState<Record<string, { line: LineCoords; profile: ProfilePoint[] | null } | null>>({});
  useEffect(() => {
    if (!selectedId || selectedId in shapes) return;
    createClient()
      .from("route_shapes")
      .select("track, elevation_profile")
      .eq("id", selectedId)
      .maybeSingle()
      .then(({ data }) => {
        const line = (data?.track as LineString | undefined)?.coordinates as LineCoords | undefined;
        const profile = data?.elevation_profile as ProfilePoint[] | null | undefined;
        setShapes((s) => ({ ...s, [selectedId]: line ? { line, profile: profile && profile.length > 1 ? profile : null } : null }));
      });
  }, [selectedId, shapes]);
  const shape = selected ? shapes[selected.id] : null;
  const [touring, setTouring] = useState(false);

  // primer clic en un pin lo selecciona; el segundo abre la ruta
  function selectOrOpen(id: string) {
    if (id !== selectedId) return setSelectedId(id);
    const route = routes.find((r) => r.id === id);
    if (route) router.push(`/rutas/${route.slug}`);
  }

  // igual desde las tarjetas: el primer clic enfoca la ruta en el mapa y el segundo la abre.
  // En móvil la lista tapa el mapa, así que ahí la tarjeta abre directo.
  function focusOnMap(id: string) {
    if (id === selectedId || !window.matchMedia(SIDE_BY_SIDE).matches) return false;
    setSelectedId(id);
    return true;
  }

  function toggle(key: string, value: string) {
    setParams({ [key]: params.get(key) === value ? null : value });
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
          className={clsx(
            "@container h-full w-full overflow-y-auto bg-surface-container-low px-4 py-4 sm:px-6 lg:block lg:w-[560px] lg:shrink-0 lg:px-4 xl:w-[620px]",
            view === "mapa" && "hidden",
          )}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop;
            // umbral de 12 px para que el temblor del dedo no la haga parpadear
            if (top > 0 && Math.abs(top - lastScroll.current) < 12) return;
            setIslandHidden(top > 0 && top > lastScroll.current);
            lastScroll.current = top;
          }}
        >
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
                  setSelectedId(null);
                  setParams({ [ACTIVITY_KEY]: a === "hiking" ? null : a });
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

          <div className="no-scrollbar mb-3 flex items-center gap-2 overflow-x-auto py-1">
            {area && (
              <>
                <Chip active onClick={() => setParams({ [AREA_KEY]: null, [PLACE_KEY]: null })}>
                  <MapPinned className="size-3.5" aria-hidden />
                  {place?.label ?? "Zona del mapa"}
                  <X className="size-3.5" aria-label="Quitar" />
                </Chip>
                <span className="mx-1 h-5 w-px shrink-0 bg-outline-variant" aria-hidden />
              </>
            )}
            <Chip active={!difficulty} onClick={() => setParams({ [DIFFICULTY_KEY]: null })}>
              Todo
            </Chip>
            {DIFFICULTIES.map((d) => (
              <Chip key={d} active={difficulty === d} onClick={() => toggle(DIFFICULTY_KEY, d)}>
                <span className={clsx("size-2 rounded-full", DIFFICULTY[d].dot)} />
                {DIFFICULTY[d].label}
              </Chip>
            ))}
          </div>

          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-headline text-sm font-bold">
              {tab === "rutas" ? routesHeading(visible.length, routes.length, filtering) : outingsHeading(visibleOutings.length, outings.length, filtering)}
            </h2>
            {filtering && (
              <button type="button" onClick={() => setParams(CLEARED)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>

          {tab === "rutas" ? (
            <div className="space-y-4 pb-24 lg:pb-6">
              {visible.length ? (
                <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
                  {visible.map((route, i) => (
                    <RouteCard key={route.id} route={route} compact priority={i < 4} selected={route.id === selectedId} onSelect={() => focusOnMap(route.id)} />
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
              )}
            </div>
          ) : visibleOutings.length ? (
            <div className="grid grid-cols-1 gap-3 pb-24 @xl:grid-cols-2 lg:pb-6">
              {visibleOutings.map((outing) => (
                <OutingCard key={outing.id} outing={outing} selected={outing.route.id === selectedId} onSelect={() => focusOnMap(outing.route.id)} />
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
        </section>

        <section
          className={clsx(
            "relative h-full w-full overflow-hidden bg-[#e3e8e1] lg:block lg:w-auto lg:flex-1 lg:border-l lg:border-outline-variant/50",
            view === "lista" && "hidden",
          )}
        >
          <RouteMap
            routes={mapRoutes}
            selectedId={selectedId}
            onSelect={selectOrOpen}
            track={shape === undefined ? undefined : (shape?.line ?? null)}
            profile={shape?.profile ?? null}
            area={area}
            me={me}
            onUserMove={setMoved}
            onTourChange={setTouring}
          />
          {canSearchArea && !touring && (
            <button
              type="button"
              onClick={() => {
                if (!moved) return;
                setParams({ [AREA_KEY]: formatArea(moved), [PLACE_KEY]: null });
                setMoved(null);
                setView("lista");
              }}
              className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 font-headline text-sm font-semibold text-on-surface shadow-lg ring-1 ring-outline-variant/60 transition-transform hover:scale-105 active:scale-95"
            >
              <Search className="size-4 text-primary" aria-hidden />
              Buscar en esta zona
            </button>
          )}
          {selected && !touring && <MapPeek route={selected} />}
        </section>

        {/* isla: con el menú del perfil abierto (aria-expanded) no se esconde */}
        <div
          className={clsx(
            "absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-on-surface p-1 shadow-lg transition-transform duration-300 motion-reduce:transition-none lg:hidden",
            islandHidden && view === "lista" && "translate-y-[calc(100%+1.5rem)] has-[[aria-expanded=true]]:translate-y-0",
          )}
        >
          <button
            type="button"
            onClick={() => {
              setView((v) => (v === "lista" ? "mapa" : "lista"));
              setIslandHidden(false);
            }}
            className="flex items-center gap-2 rounded-full px-4 py-2 font-headline text-sm font-semibold text-surface active:scale-95"
          >
            {view === "lista" ? <MapIcon className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
            {view === "lista" ? "Ver mapa" : "Ver lista"}
          </button>
          {/* desde md el perfil ya está en el encabezado */}
          <div className="md:hidden">
            <UserMenu island />
          </div>
        </div>
      </main>
    </>
  );
}

function routesHeading(shown: number, total: number, filtering: boolean) {
  if (filtering) return `${shown} de ${total} ${total === 1 ? "ruta" : "rutas"}`;
  return shown === 1 ? "1 ruta popular en la región" : `${shown} rutas populares en la región`;
}

function outingsHeading(shown: number, total: number, filtering: boolean) {
  if (filtering) return `${shown} de ${total} ${total === 1 ? "salida" : "salidas"}`;
  return shown === 1 ? "1 salida próxima" : `${shown} salidas próximas`;
}

/** Ficha de la ruta seleccionada sobre el mapa; solo en móvil, donde no hay lista al lado. */
function MapPeek({ route }: { route: RouteSummary }) {
  return (
    <Link
      href={`/rutas/${route.slug}`}
      className="absolute inset-x-3 bottom-24 z-10 flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-2.5 shadow-lg ring-1 ring-outline-variant/50 lg:hidden"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-container">
        {route.cover_url ? (
          <Image src={route.cover_url} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <Mountain className="absolute inset-0 m-auto size-6 text-primary-container/70" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-on-surface-variant">{route.place_label}</p>
        <p className="truncate font-headline text-sm font-bold">{route.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span className={clsx("size-1.5 rounded-full", DIFFICULTY[route.difficulty].dot)} />
          {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m · {formatDuration(route.duration_min)}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-outline" aria-hidden />
    </Link>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
        active
          ? "bg-primary font-headline font-semibold text-on-primary shadow-xs"
          : "border border-outline-variant/70 bg-surface-container-lowest font-medium hover:border-primary",
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
  return <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">{children}</p>;
}
