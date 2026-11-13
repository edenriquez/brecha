"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- sin red solo sirve la navegación completa (la maneja el service worker) */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, CloudDownload, Mountain, Rotate3d, Smartphone, Trash2, TrendingUp, WifiOff } from "lucide-react";
import { ElevationProfile } from "@/components/elevation-profile";
// sin next/dynamic: así sus scripts vienen en el HTML que guarda el service worker y el mapa abre sin red
import { TrackMap } from "@/components/track-map";
import { deleteOfflineRoute, formatMb, getOfflineRoute, listOfflineRoutes, offlineSupported, useIosSafariTab, type OfflineRoute } from "@/lib/offline";
import { DIFFICULTY, formatDuration, formatKm } from "@/lib/routes";

/** Lista de rutas guardadas en el dispositivo o, con `?ruta=`, el visor de una. Los enlaces son <a>: sin red solo hay HTML del service worker. */
export function OfflineRoutes() {
  const slug = useSearchParams().get("ruta");
  return slug ? <Viewer slug={slug} /> : <List />;
}

function List() {
  const [routes, setRoutes] = useState<OfflineRoute[] | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const iosTab = useIosSafariTab();
  // el service worker manda aquí lo que no pudo abrir sin señal; solo rutas internas (el navegador lee /\ como //)
  const desde = useSearchParams().get("desde");
  const retryHref = desde?.startsWith("/") && !/^\/[/\\]/.test(desde) ? desde : null;

  useEffect(() => {
    (offlineSupported() ? listOfflineRoutes() : Promise.resolve([])).then(setRoutes);
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null));
  }, []);

  async function remove(slug: string) {
    await deleteOfflineRoute(slug);
    setRoutes((rs) => rs?.filter((r) => r.slug !== slug) ?? null);
  }

  return (
    <div className="min-h-dvh bg-surface-container-low">
      <header className="sticky top-0 z-10 border-b border-outline-variant bg-surface shadow-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <a href="/" className="flex items-center gap-2 font-headline text-2xl font-bold tracking-tight text-primary">
            <Mountain className="size-7 fill-primary-container text-primary-container" aria-hidden />
            brecha
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 font-headline text-2xl font-extrabold tracking-tight">
            <WifiOff className="size-6 text-primary" aria-hidden />
            Rutas sin conexión
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Se abren sin señal con satélite, relieve 3D y tu ubicación por GPS.
            {usage !== null && ` Brecha ocupa ${formatMb(usage)} en este dispositivo.`}
          </p>
        </div>

        {retryHref && (
          <p className="flex gap-2 rounded-xl bg-secondary-fixed/40 p-3 text-xs">
            <WifiOff className="size-4 shrink-0 text-secondary" aria-hidden />
            <span>
              No hay señal para abrir esa página.{" "}
              <a href={retryHref} className="font-semibold underline">
                Reintentar
              </a>
            </span>
          </p>
        )}

        {iosTab && (
          <p className="flex gap-2 rounded-xl bg-secondary-fixed/40 p-3 text-xs">
            <Smartphone className="size-4 shrink-0 text-secondary" aria-hidden />
            <span>
              En iPhone, agrega Brecha a tu pantalla de inicio (Compartir → <b>Agregar a inicio</b>) y guarda las rutas desde la app: lo que se guarda en Safari no aparece ahí.
            </span>
          </p>
        )}

        {routes?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-10 text-center">
            <CloudDownload className="size-9 text-outline-variant" aria-hidden />
            <p className="font-headline font-bold">Todavía no guardas rutas</p>
            <p className="max-w-sm text-sm text-on-surface-variant">
              En la página de una ruta con trazo toca <b>Guardar sin conexión</b> antes de salir.
            </p>
            <a href="/" className="mt-2 rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary">
              Explorar rutas
            </a>
          </div>
        )}

        <ul className="space-y-3">
          {routes?.map((r) => (
            <li key={r.slug} className="flex items-center gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-xs">
              <a href={`/descargas?ruta=${encodeURIComponent(r.slug)}`} className="min-w-0 flex-1">
                <p className="truncate font-headline font-bold">{r.name}</p>
                <p className="truncate text-xs text-on-surface-variant">{r.place_label}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className={clsx("size-2 rounded-full", DIFFICULTY[r.difficulty].dot)} />
                    {DIFFICULTY[r.difficulty].label}
                  </span>
                  <span>{formatKm(r.distance_km)}</span>
                  <span>↑ {r.elevation_gain_m.toLocaleString("es-MX")} m</span>
                  <span>{formatMb(r.bytes)}</span>
                </p>
              </a>
              <button
                type="button"
                onClick={() => remove(r.slug)}
                aria-label={`Borrar ${r.name} del dispositivo`}
                className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function Viewer({ slug }: { slug: string }) {
  const [route, setRoute] = useState<OfflineRoute | null | undefined>(undefined);
  const [terrain3d, setTerrain3d] = useState(true);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    (offlineSupported() ? getOfflineRoute(slug) : Promise.resolve(null)).then(setRoute);
  }, [slug]);

  if (route === undefined) return <div className="h-dvh bg-[#e3e8e1]" />;
  if (!route) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-surface-container-low px-6 text-center">
        <p className="font-headline font-bold">Esta ruta no está guardada en el dispositivo</p>
        <a href="/descargas" className="rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary">
          Ver rutas sin conexión
        </a>
      </div>
    );
  }

  const point = active !== null && route.profile ? route.profile[active] : null;
  return (
    <div className="fixed inset-0 bg-[#e3e8e1]">
      <TrackMap line={route.line} hover={point ? [point[2], point[3]] : null} offline terrain3d={terrain3d} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <a
          href="/descargas"
          aria-label="Rutas sin conexión"
          className="pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest shadow-lg ring-1 ring-outline-variant/60"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </a>
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-surface-container-lowest/95 px-3 py-2 shadow-lg ring-1 ring-outline-variant/60">
          <p className="truncate font-headline text-sm font-bold">{route.name}</p>
          <p className="flex gap-3 font-mono text-[11px] text-on-surface-variant">
            <span>{formatKm(route.distance_km)}</span>
            <span className="flex items-center gap-0.5">
              <TrendingUp className="size-3" aria-hidden />
              {route.elevation_gain_m.toLocaleString("es-MX")} m
            </span>
            <span>{formatDuration(route.duration_min)}</span>
          </p>
        </div>
        <button
          type="button"
          aria-pressed={terrain3d}
          onClick={() => setTerrain3d((on) => !on)}
          className={clsx(
            "pointer-events-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-headline text-sm font-semibold shadow-lg ring-1",
            terrain3d ? "bg-primary text-on-primary ring-primary" : "bg-surface-container-lowest text-on-surface ring-outline-variant/60",
          )}
        >
          <Rotate3d className="size-4" aria-hidden />
          3D
        </button>
      </div>
      {route.profile && (
        // a la izquierda de los controles del mapa (zoom, brújula, GPS)
        <div className="absolute bottom-3 left-3 right-14 mb-[env(safe-area-inset-bottom)] rounded-2xl bg-surface-container-lowest/95 p-3 shadow-lg ring-1 ring-outline-variant/60">
          <ElevationProfile profile={route.profile} active={active} onActive={setActive} overlay />
        </div>
      )}
    </div>
  );
}
