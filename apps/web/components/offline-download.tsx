"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, CloudDownload, Smartphone, Trash2, X } from "lucide-react";
import type { ProfilePoint } from "@/lib/gpx";
import { cancelDownload, deleteOfflineRoute, estimateDownload, formatMb, queueDownload, useDownloads, useIosSafariTab, type DownloadChoice, type OfflineRouteInfo } from "@/lib/offline";

// trae maplibre: solo se baja al abrir la hoja
const DownloadSheet = dynamic(() => import("./download-sheet").then((m) => m.DownloadSheet), { ssr: false });

type State =
  | { step: "inicio" | "confirmar" | "en-cola" | "en-pausa" }
  | { step: "bajando"; done: number; total: number }
  | { step: "guardada"; bytes: number }
  | { step: "error"; message: string };

// es la acción principal de la página de la ruta: se llega a ella desde "Descargar mapa"
const BUTTON = "relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-2xl whitespace-nowrap";
// verde en degradado con un filo de luz, sombra del mismo tono y un destello que cruza al pasar el cursor
const PRIMARY = `group ${BUTTON} bg-gradient-to-br from-primary-container to-primary pr-6 pl-2.5 text-left text-on-primary shadow-[0_12px_28px_-12px_rgba(22,69,37,0.75)] ring-1 ring-white/15 transition-transform ring-inset hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]`;
const QUIET = `${BUTTON} border border-outline-variant px-4 font-headline text-sm font-semibold transition-colors hover:border-error hover:text-error`;

/** El contenido del botón principal: icono en su recuadro, título y una línea de detalle. */
function Label({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">{icon}</span>
      <span className="min-w-0">
        <span className="block font-headline text-[15px] leading-tight font-bold">{title}</span>
        <span className="block truncate text-[11px] leading-tight text-on-primary/75">{detail}</span>
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/25 blur-md transition-transform duration-700 group-hover:translate-x-[650%] motion-reduce:hidden" />
    </>
  );
}

/** Aviso que cuelga del botón: el error de la descarga o la advertencia de iPhone. */
const NOTE = "absolute top-full left-0 z-20 mt-2 w-72 rounded-xl bg-surface-container-lowest p-3 text-xs shadow-lg ring-1 ring-outline-variant/60";

/** Botón que guarda satélite, relieve 3D y trazo de la zona de la ruta para abrirla sin señal; el avance también se ve en la píldora de descargas. */
export function OfflineDownload({ route, line, profile }: { route: OfflineRouteInfo; line: [number, number][]; profile: ProfilePoint[] | null }) {
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState(false);
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
  else if (download?.status === "en-pausa") state = { step: "en-pausa" };
  else if (download?.error) state = { step: "error", message: download.error };

  function openSheet() {
    setConfirm(false);
    setSheet(true);
  }

  function start(choice: DownloadChoice) {
    setSheet(false);
    queueDownload(route, line, profile, choice);
  }

  const waiting = state.step === "bajando" ? `Descargando ${Math.floor((state.done / state.total) * 100)} %` : state.step === "en-cola" ? "En cola" : state.step === "en-pausa" ? "En pausa, sin conexión" : null;
  const size = `≈ ${Math.max(1, Math.round(estimate.mb))} MB`;

  return (
    <div className="relative flex flex-1 gap-2 *:first:flex-1 sm:flex-none sm:*:first:flex-none">
      {(state.step === "inicio" || state.step === "confirmar" || state.step === "error") && (
        <button type="button" onClick={() => (state.step === "error" ? queueDownload(route, line, profile) : iosTab ? setConfirm(true) : openSheet())} className={PRIMARY}>
          <Label
            icon={<CloudDownload className="size-5" aria-hidden />}
            title={state.step === "error" ? "Reintentar descarga" : "Usar sin señal"}
            detail={`Satélite, relieve 3D y trazo · ${size}`}
          />
        </button>
      )}
      {waiting && (
        <button type="button" onClick={() => cancelDownload(route.slug)} aria-label={`${waiting}. Cancelar`} className={QUIET}>
          {/* el avance llena el botón */}
          {state.step === "bajando" && <span aria-hidden className="absolute inset-y-0 left-0 bg-primary-fixed/60 transition-[width]" style={{ width: `${(state.done / state.total) * 100}%` }} />}
          <span className="relative flex-1">{waiting}</span>
          <X className="relative size-4" aria-hidden />
        </button>
      )}
      {state.step === "guardada" && (
        <>
          {/* <a> y no <Link>: la página de descargas se abre completa, igual que sin red */}
          <a href={`/descargas?ruta=${encodeURIComponent(route.slug)}`} className={PRIMARY}>
            <Label icon={<CheckCircle2 className="size-5" aria-hidden />} title="Abrir sin señal" detail={`Guardada en este dispositivo · ${formatMb(state.bytes)}`} />
          </a>
          <button type="button" onClick={() => deleteOfflineRoute(route.slug)} aria-label="Borrar del dispositivo" className={`${QUIET} w-14 justify-center px-0 text-on-surface-variant`}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        </>
      )}

      {state.step === "error" && <p className={`${NOTE} font-medium text-error`}>{state.message}</p>}

      {state.step === "confirmar" && (
        <div className={`${NOTE} space-y-3`}>
          <p className="flex gap-2">
            <Smartphone className="size-4 shrink-0 text-secondary" aria-hidden />
            <span>
              En iPhone, lo que guardas desde Safari no aparece en la app instalada. Primero agrega Brecha a tu pantalla de inicio (botón Compartir → <b>Agregar a inicio</b>), ábrela desde ahí y guarda la ruta.
            </span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={openSheet} className="rounded-lg border border-outline-variant px-3 py-1.5 font-semibold">
              Guardar aquí de todos modos
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="px-2 py-1.5 font-semibold text-on-surface-variant">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {sheet && <DownloadSheet route={route} line={line} onDownload={start} onClose={() => setSheet(false)} />}
    </div>
  );
}
