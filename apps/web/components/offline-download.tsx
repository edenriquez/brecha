"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CloudDownload, Smartphone, Trash2, X } from "lucide-react";
import type { ProfilePoint } from "@/lib/gpx";
import { cancelDownload, deleteOfflineRoute, estimateDownload, formatMb, queueDownload, useDownloads, useIosSafariTab, type OfflineRouteInfo } from "@/lib/offline";

type State =
  | { step: "inicio" | "confirmar" | "en-cola" }
  | { step: "bajando"; done: number; total: number }
  | { step: "guardada"; bytes: number }
  | { step: "error"; message: string };

const BUTTON = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors";

/** Guarda satélite, relieve 3D y trazo de la zona de la ruta para abrirla sin señal. */
export function OfflineDownload({ route, line, profile }: { route: OfflineRouteInfo; line: [number, number][]; profile: ProfilePoint[] | null }) {
  const [confirm, setConfirm] = useState(false);
  const iosTab = useIosSafariTab();
  const estimate = useMemo(() => estimateDownload(line), [line]);
  // la descarga va por la cola compartida con /guardadas: nunca dos a la vez
  const { routes } = useDownloads();
  if (!routes) return null;
  const download = routes[route.slug];

  let state: State = { step: "inicio" };
  if (confirm) state = { step: "confirmar" };
  else if (download?.status === "lista") state = { step: "guardada", bytes: download.bytes };
  else if (download?.status === "bajando") state = { step: "bajando", done: download.done, total: download.total };
  else if (download?.status === "en-cola") state = { step: "en-cola" };
  else if (download?.error) state = { step: "error", message: download.error };

  function start() {
    setConfirm(false);
    queueDownload(route, line, profile);
  }

  return (
    <div className="space-y-3 rounded-xl border border-outline-variant/60 bg-surface-container-low/60 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed/70 text-primary">
            {state.step === "guardada" ? <CheckCircle2 className="size-5" aria-hidden /> : <CloudDownload className="size-5" aria-hidden />}
          </div>
          <div>
            <h3 className="font-headline text-sm font-bold">{state.step === "guardada" ? "Disponible sin conexión" : "Úsala sin señal"}</h3>
            <p className="text-xs text-on-surface-variant">
              {state.step === "guardada"
                ? `Satélite, relieve 3D y trazo guardados en este dispositivo · ${formatMb(state.bytes)}`
                : `Guarda el satélite, el relieve 3D y el trazo de la zona para verla en el cerro con tu GPS · ≈ ${Math.max(1, Math.round(estimate.mb))} MB`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 self-start sm:self-auto">
          {(state.step === "inicio" || state.step === "error") && (
            <button type="button" onClick={() => (iosTab ? setConfirm(true) : start())} className={`${BUTTON} bg-primary text-on-primary hover:bg-primary-container`}>
              <CloudDownload className="size-4" aria-hidden />
              {state.step === "error" ? "Reintentar" : "Guardar sin conexión"}
            </button>
          )}
          {(state.step === "bajando" || state.step === "en-cola") && (
            <button type="button" onClick={() => cancelDownload(route.slug)} className={`${BUTTON} border border-outline-variant hover:border-error hover:text-error`}>
              <X className="size-4" aria-hidden />
              Cancelar
            </button>
          )}
          {state.step === "guardada" && (
            <>
              {/* <a> y no <Link>: la página de descargas se abre completa, igual que sin red */}
              <a href={`/descargas?ruta=${encodeURIComponent(route.slug)}`} className={`${BUTTON} bg-primary text-on-primary hover:bg-primary-container`}>
                Abrir sin conexión
              </a>
              <button type="button" onClick={() => deleteOfflineRoute(route.slug)} aria-label="Borrar del dispositivo" className={`${BUTTON} border border-outline-variant text-on-surface-variant hover:border-error hover:text-error`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {state.step === "bajando" && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(state.done / state.total) * 100}%` }} />
          </div>
          <p className="font-mono text-[11px] text-on-surface-variant">
            Descargando… {Math.floor((state.done / state.total) * 100)}% · no cierres esta página
          </p>
        </div>
      )}

      {state.step === "en-cola" && <p className="font-mono text-[11px] text-on-surface-variant">En cola · no cierres esta página</p>}

      {state.step === "error" && <p className="text-xs font-medium text-error">{state.message}</p>}

      {state.step === "confirmar" && (
        <div className="space-y-3 rounded-lg bg-secondary-fixed/40 p-3 text-xs text-on-surface">
          <p className="flex gap-2">
            <Smartphone className="size-4 shrink-0 text-secondary" aria-hidden />
            <span>
              En iPhone, lo que guardas desde Safari no aparece en la app instalada. Primero agrega Brecha a tu pantalla de inicio (botón Compartir → <b>Agregar a inicio</b>), ábrela desde ahí y guarda la ruta.
            </span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={start} className={`${BUTTON} border border-outline-variant bg-surface-container-lowest`}>
              Guardar aquí de todos modos
            </button>
            <button type="button" onClick={() => setConfirm(false)} className={`${BUTTON} text-on-surface-variant`}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
