"use client";

import { useEffect, useMemo, useState } from "react";
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
  FilePlus2,
  Footprints,
  List,
  Map as MapIcon,
  Mountain,
  Navigation,
  Route,
  SlidersHorizontal,
} from "lucide-react";
import { OutingCard } from "@/components/outing-card";
import { RouteCard } from "@/components/route-card";
import { RouteMap } from "@/components/route-map-lazy";
import { SearchBox } from "@/components/search-box";
import { TopNav } from "@/components/top-nav";
import {
  countPanelFilters,
  DIFFICULTY_KEY,
  matchesFilters,
  matchesQuery,
  QUERY_KEY,
  RANGE_KEYS,
  RANGES,
  routeHaystack,
  TYPE_KEY,
} from "@/lib/route-filters";
import { DIFFICULTY, formatDuration, formatKm, ROUTE_TYPE, type Difficulty, type RouteSummary } from "@/lib/routes";
import type { LineCoords } from "@/lib/maplibre";
import type { OutingCardData } from "@/lib/outings";
import { createClient } from "@/lib/supabase/client";
import { useUrlParams } from "@/lib/use-url-params";

const DIFFICULTIES: Difficulty[] = ["facil", "moderada", "dificil"];
const CLEARED = Object.fromEntries([QUERY_KEY, DIFFICULTY_KEY, TYPE_KEY, ...RANGE_KEYS].map((k) => [k, null]));

export function Explorer({ routes, outings }: { routes: RouteSummary[]; outings: OutingCardData[] }) {
  const [params, setParams] = useUrlParams();
  const query = params.get(QUERY_KEY) ?? "";
  const difficulty = params.get(DIFFICULTY_KEY);
  const tab = params.get("ver") === "salidas" ? "salidas" : "rutas";
  const panelCount = countPanelFilters(params);
  const filtering = Boolean(query.trim() || difficulty || panelCount);

  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<"lista" | "mapa">("lista");
  // en ambas pestañas la selección es una ruta: es lo que tiene pin en el mapa
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => routes.filter((r) => matchesFilters(r, params)), [routes, params]);
  const visible = useMemo(() => filtered.filter((r) => matchesQuery(routeHaystack(r), query)), [filtered, query]);
  const visibleOutings = useMemo(() => {
    const byId = new Map(filtered.map((r) => [r.id, r]));
    return outings.filter((o) => {
      const route = byId.get(o.route.id);
      return route && matchesQuery([...routeHaystack(route), o.title, o.meeting_point_label], query);
    });
  }, [filtered, outings, query]);
  const mapRoutes = useMemo(() => {
    if (tab === "rutas") return visible;
    const withOutings = new Set(visibleOutings.map((o) => o.route.id));
    return filtered.filter((r) => withOutings.has(r.id));
  }, [tab, visible, filtered, visibleOutings]);
  const selected = mapRoutes.find((r) => r.id === selectedId) ?? null;
  const router = useRouter();

  // el trazo de la ruta elegida se pide al seleccionarla: el listado no carga los de todas
  const [tracks, setTracks] = useState<Record<string, LineCoords | null>>({});
  useEffect(() => {
    if (!selectedId || selectedId in tracks) return;
    createClient()
      .from("route_shapes")
      .select("track")
      .eq("id", selectedId)
      .maybeSingle()
      .then(({ data }) => {
        const line = (data?.track as LineString | undefined)?.coordinates as LineCoords | undefined;
        setTracks((t) => ({ ...t, [selectedId]: line ?? null }));
      });
  }, [selectedId, tracks]);

  // primer clic en un pin lo selecciona; el segundo abre la ruta
  function selectOrOpen(id: string) {
    if (id !== selectedId) return setSelectedId(id);
    const route = routes.find((r) => r.id === id);
    if (route) router.push(`/rutas/${route.slug}`);
  }

  function toggle(key: string, value: string) {
    setParams({ [key]: params.get(key) === value ? null : value });
  }

  return (
    <>
      <TopNav search={<SearchBox value={query} onChange={(q) => setParams({ [QUERY_KEY]: q || null })} />} />
      <main className="relative flex flex-1 overflow-hidden">
        <section
          className={clsx(
            "h-full w-full overflow-y-auto bg-surface-container-low px-4 py-5 sm:px-8 lg:block lg:w-[58%]",
            view === "mapa" && "hidden",
          )}
        >
          <p className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-container">
            <Navigation className="size-4 fill-primary-container" aria-hidden />
            Rutas cerca de Ciudad de México
          </p>

          <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <ActivityTile icon={<Footprints className="size-6" />} title="Hiking" subtitle="Senderos y cumbres" active />
            <ActivityTile icon={<Bike className="size-6" />} title="Bici" subtitle="Gravel y MTB" />
            <ActivityTile icon={<CarFront className="size-6" />} title="Offroad" subtitle="Rutas 4x4 y brechas" />
          </div>

          <div role="tablist" className="mb-4 flex items-center rounded-full border border-outline-variant/50 bg-surface-container p-1">
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
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
              aria-controls="mas-filtros"
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                panelOpen || panelCount ? "border-primary bg-primary-fixed/40 text-primary" : "border-outline-variant/70 bg-surface-container-lowest hover:border-primary",
              )}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Más filtros
              {panelCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-on-primary">{panelCount}</span>}
            </button>
            <span className="mx-1 h-5 w-px shrink-0 bg-outline-variant" aria-hidden />
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

          {panelOpen && (
            <div id="mas-filtros" className="mb-5 grid gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-xs sm:grid-cols-2">
              {RANGE_KEYS.map((key) => (
                <FilterGroup key={key} label={RANGES[key].label}>
                  {RANGES[key].options.map((o) => (
                    <Chip key={o.id} small active={params.get(key) === o.id} onClick={() => toggle(key, o.id)}>
                      {o.label}
                    </Chip>
                  ))}
                </FilterGroup>
              ))}
              <FilterGroup label="Recorrido">
                {(Object.keys(ROUTE_TYPE) as RouteSummary["route_type"][]).map((t) => (
                  <Chip key={t} small active={params.get(TYPE_KEY) === t} onClick={() => toggle(TYPE_KEY, t)}>
                    {ROUTE_TYPE[t]}
                  </Chip>
                ))}
              </FilterGroup>
            </div>
          )}

          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-headline text-base font-bold">
              {tab === "rutas" ? routesHeading(visible.length, routes.length, filtering) : outingsHeading(visibleOutings.length, outings.length, filtering)}
            </h2>
            {filtering && (
              <button type="button" onClick={() => setParams(CLEARED)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>

          {tab === "rutas" ? (
            <div className="space-y-6 pb-24 lg:pb-10">
              {visible.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((route, i) => (
                    <RouteCard key={route.id} route={route} priority={i < 3} selected={route.id === selectedId} onSelect={() => setSelectedId(route.id)} />
                  ))}
                </div>
              ) : (
                <Empty>
                  {filtering ? "Ninguna ruta coincide con tu búsqueda." : "Todavía no hay rutas publicadas."}{" "}
                  {filtering && <ClearLink onClick={() => setParams(CLEARED)} />}
                </Empty>
              )}
              <Link
                href="/rutas/nueva"
                className="flex items-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest/60 p-4 transition-colors hover:border-primary-container"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-fixed/60 text-primary">
                  <FilePlus2 className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-headline text-sm font-bold">¿Conoces un sendero que no está aquí?</span>
                  <span className="block text-xs text-on-surface-variant">Sube su GPX y calculamos distancia, desnivel y perfil.</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-outline" aria-hidden />
              </Link>
            </div>
          ) : visibleOutings.length ? (
            <div className="grid grid-cols-1 gap-4 pb-24 sm:grid-cols-2 lg:pb-10">
              {visibleOutings.map((outing) => (
                <OutingCard key={outing.id} outing={outing} selected={outing.route.id === selectedId} onSelect={() => setSelectedId(outing.route.id)} />
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
            "relative h-full w-full overflow-hidden bg-[#e3e8e1] lg:block lg:w-[42%] lg:border-l lg:border-outline-variant/50",
            view === "lista" && "hidden",
          )}
        >
          <RouteMap routes={mapRoutes} selectedId={selectedId} onSelect={selectOrOpen} track={selected ? (tracks[selected.id] ?? null) : null} />
          {selected && <MapPeek route={selected} />}
        </section>

        <button
          type="button"
          onClick={() => setView((v) => (v === "lista" ? "mapa" : "lista"))}
          className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-on-surface px-5 py-3 font-headline text-sm font-semibold text-surface shadow-lg active:scale-95 lg:hidden"
        >
          {view === "lista" ? <MapIcon className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
          {view === "lista" ? "Ver mapa" : "Ver lista"}
        </button>
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
      className="absolute inset-x-3 bottom-20 z-10 flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-2.5 shadow-lg ring-1 ring-outline-variant/50 lg:hidden"
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

function Chip({ active, onClick, small, children }: { active: boolean; onClick: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex shrink-0 items-center gap-1.5 rounded-full text-xs transition-colors",
        small ? "px-3 py-1" : "px-3.5 py-1.5",
        active
          ? "bg-primary font-headline font-semibold text-on-primary shadow-xs"
          : "border border-outline-variant/70 bg-surface-container-lowest font-medium hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[11px] font-bold tracking-wider text-on-surface-variant uppercase">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function ActivityTile({ icon, title, subtitle, active }: { icon: React.ReactNode; title: string; subtitle: string; active?: boolean }) {
  return (
    <div
      aria-disabled={!active}
      className={clsx(
        "relative rounded-xl p-3",
        active ? "border-2 border-primary-container bg-surface-container-lowest shadow-xs" : "cursor-not-allowed border border-outline-variant/60 bg-surface-container opacity-75",
      )}
    >
      <div className={clsx("mb-1.5 flex items-start justify-between", active ? "text-primary-container" : "text-outline")}>
        {icon}
        {active ? (
          <CircleCheck className="size-[18px] fill-primary-container text-surface-container-lowest" aria-hidden />
        ) : (
          <span className="hidden rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant sm:inline">Próximamente</span>
        )}
      </div>
      <p className={clsx("font-headline text-sm", active ? "font-bold text-primary" : "font-semibold text-on-surface-variant")}>{title}</p>
      <p className={clsx("truncate text-xs", active ? "text-on-surface-variant" : "text-outline")}>
        {active ? (
          subtitle
        ) : (
          <>
            <span className="sm:hidden">Próximamente</span>
            <span className="hidden sm:inline">{subtitle}</span>
          </>
        )}
      </p>
    </div>
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
