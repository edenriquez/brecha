"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bike, CalendarDays, CarFront, CircleCheck, Footprints, Navigation, Route } from "lucide-react";
import { OutingCard } from "@/components/outing-card";
import { RouteCard } from "@/components/route-card";
import { RouteMap } from "@/components/route-map-lazy";
import { DIFFICULTY, type Difficulty, type RouteSummary } from "@/lib/routes";
import type { OutingCardData } from "@/lib/outings";

const FILTERS: (Difficulty | "todo")[] = ["todo", "facil", "moderada", "dificil"];

export function Explorer({ routes, outings }: { routes: RouteSummary[]; outings: OutingCardData[] }) {
  const [tab, setTab] = useState<"rutas" | "salidas">("rutas");
  const [filter, setFilter] = useState<Difficulty | "todo">("todo");
  // en ambas pestañas la selección es una ruta: es lo que tiene pin en el mapa
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = useMemo(() => (filter === "todo" ? routes : routes.filter((r) => r.difficulty === filter)), [routes, filter]);
  const visibleOutings = useMemo(() => (filter === "todo" ? outings : outings.filter((o) => o.route.difficulty === filter)), [outings, filter]);
  const mapRoutes = useMemo(() => {
    if (tab === "rutas") return visible;
    const withOutings = new Set(visibleOutings.map((o) => o.route.id));
    return visible.filter((r) => withOutings.has(r.id));
  }, [tab, visible, visibleOutings]);
  const router = useRouter();

  // primer clic en un pin lo selecciona; el segundo abre la ruta
  function selectOrOpen(id: string) {
    if (id !== selectedId) return setSelectedId(id);
    const route = routes.find((r) => r.id === id);
    if (route) router.push(`/rutas/${route.slug}`);
  }

  return (
    <main className="flex flex-1 overflow-hidden">
      <section className="h-full w-full overflow-y-auto bg-surface-container-low px-5 py-5 sm:px-8 lg:w-[58%]">
        <p className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-container">
          <Navigation className="size-4 fill-primary-container" aria-hidden />
          Rutas cerca de Ciudad de México
        </p>

        <div className="mb-5 grid grid-cols-3 gap-3">
          <ActivityTile icon={<Footprints className="size-6" />} title="Hiking" subtitle="Senderos y cumbres" active />
          <ActivityTile icon={<Bike className="size-6" />} title="Bici" subtitle="Gravel y MTB" />
          <ActivityTile icon={<CarFront className="size-6" />} title="Offroad" subtitle="Rutas 4x4 y brechas" />
        </div>

        <div role="tablist" className="mb-4 flex items-center rounded-full border border-outline-variant/50 bg-surface-container p-1">
          <Tab active={tab === "rutas"} onClick={() => setTab("rutas")}>
            <Route className="size-4" aria-hidden />
            Rutas
          </Tab>
          <Tab active={tab === "salidas"} onClick={() => setTab("salidas")}>
            <CalendarDays className="size-4" aria-hidden />
            Salidas próximas
            {outings.length > 0 && <span className="rounded-full bg-secondary px-1.5 text-[10px] font-bold text-on-secondary">{outings.length}</span>}
          </Tab>
        </div>

        <div className="no-scrollbar mb-5 flex items-center gap-2 overflow-x-auto py-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-colors",
                filter === f
                  ? "bg-primary font-headline font-semibold text-on-primary shadow-xs"
                  : "border border-outline-variant/70 bg-surface-container-lowest font-medium hover:border-primary",
              )}
            >
              {f !== "todo" && <span className={clsx("size-2 rounded-full", DIFFICULTY[f].dot)} />}
              {f === "todo" ? "Todo" : DIFFICULTY[f].label}
            </button>
          ))}
        </div>

        {tab === "rutas" ? (
          <>
            <h2 className="mb-4 font-headline text-base font-bold">
              {visible.length === 1 ? "1 ruta popular en la región" : `${visible.length} rutas populares en la región`}
            </h2>
            {visible.length ? (
              <div className="grid grid-cols-1 gap-4 pb-10 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((route, i) => (
                  <RouteCard key={route.id} route={route} priority={i < 3} selected={route.id === selectedId} onSelect={() => setSelectedId(route.id)} />
                ))}
              </div>
            ) : (
              <Empty>Todavía no hay rutas con este filtro.</Empty>
            )}
          </>
        ) : (
          <>
            <h2 className="mb-4 font-headline text-base font-bold">
              {visibleOutings.length === 1 ? "1 salida próxima" : `${visibleOutings.length} salidas próximas`}
            </h2>
            {visibleOutings.length ? (
              <div className="grid grid-cols-1 gap-4 pb-10 sm:grid-cols-2">
                {visibleOutings.map((outing) => (
                  <OutingCard key={outing.id} outing={outing} selected={outing.route.id === selectedId} onSelect={() => setSelectedId(outing.route.id)} />
                ))}
              </div>
            ) : (
              <Empty>
                Nadie ha convocado una salida {filter === "todo" ? "todavía" : "con este filtro"}.{" "}
                <button type="button" onClick={() => setTab("rutas")} className="font-semibold text-primary underline-offset-2 hover:underline">
                  Elige una ruta
                </button>{" "}
                y convoca la primera.
              </Empty>
            )}
          </>
        )}
      </section>

      <section className="relative hidden h-full w-[42%] overflow-hidden border-l border-outline-variant/50 bg-[#e3e8e1] lg:block">
        <RouteMap routes={mapRoutes} selectedId={selectedId} onSelect={selectOrOpen} />
      </section>
    </main>
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
          <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant">Próximamente</span>
        )}
      </div>
      <p className={clsx("font-headline text-sm", active ? "font-bold text-primary" : "font-semibold text-on-surface-variant")}>{title}</p>
      <p className={clsx("text-xs", active ? "text-on-surface-variant" : "text-outline")}>{subtitle}</p>
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
        "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 font-headline text-xs transition-colors",
        active ? "bg-primary font-bold text-on-primary shadow-sm" : "font-semibold text-on-surface-variant hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">{children}</p>;
}
