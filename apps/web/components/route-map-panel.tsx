"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, CloudDownload, Layers, Pause, Play, RotateCcw } from "lucide-react";
import { ElevationProfile } from "@/components/elevation-profile";
import type { ProfilePoint } from "@/lib/gpx";
import type { TourState } from "@/lib/route-tour";

const km = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Qué enseña el panel: el perfil de altitud, las capas del mapa o solo su encabezado y sus acciones. */
export type PanelView = "perfil" | "capas" | "min";

/**
 * Único panel sobre el mapa de la ruta elegida, translúcido y al pie: el recorrido (pausa y perfil de altitud;
 * arrastrar el perfil lo mueve), las capas del mapa y "Descargar mapa". Plegarlo no sale de la vista 3D.
 * `tour`: null si la ruta no tiene perfil o el recorrido todavía no arranca.
 */
export function RouteMapPanel({
  name,
  summary,
  profile,
  tour,
  onToggle,
  onSeek,
  view,
  onView,
  layers,
  activeLayers,
  onDownload,
}: {
  name: string;
  /** Lo que va bajo el nombre mientras no hay recorrido */
  summary: string;
  profile: ProfilePoint[] | null;
  tour: TourState | null;
  onToggle: () => void;
  onSeek: (index: number) => void;
  view: PanelView;
  onView: (view: PanelView) => void;
  /** Los renglones de capas, con sus leyendas y controles */
  layers: React.ReactNode;
  activeLayers: number;
  onDownload: () => void;
}) {
  const Icon = tour?.playing ? Pause : tour?.done ? RotateCcw : Play;
  // sin perfil no hay nada que plegar, salvo las capas abiertas
  const foldable = (profile && tour) || view === "capas";
  const ACTION = "flex h-11 items-center justify-center gap-2 rounded-xl font-headline text-sm font-semibold transition-colors";

  return (
    <div
      className={clsx(
        "mx-auto w-full max-w-xl rounded-2xl p-3 shadow-lg ring-1 ring-white/50 backdrop-blur-md transition-colors",
        // con las capas abiertas hay texto chico que leer: menos transparente
        view === "capas" ? "bg-surface-container-lowest/90" : "bg-surface-container-lowest/60",
      )}
    >
      <div className="flex items-center gap-3">
        {tour && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={tour.playing ? "Pausar recorrido" : tour.done ? "Repetir recorrido" : "Seguir recorrido"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-on-surface text-surface shadow transition-transform active:scale-95"
          >
            <Icon className="size-4" aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-sm font-bold">{name}</p>
          <p className="truncate font-mono text-[11px] text-on-surface-variant" aria-live="off">
            {tour && profile ? `km ${km(tour.km)} de ${km(profile[profile.length - 1][0])} · ${tour.ele.toLocaleString("es-MX")} m` : summary}
          </p>
        </div>
        {foldable && (
          <button
            type="button"
            onClick={() => onView(view === "min" ? "perfil" : "min")}
            aria-expanded={view !== "min"}
            aria-label={view === "min" ? "Desplegar el panel" : "Plegar el panel"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          >
            {view === "min" ? <ChevronUp className="size-5" aria-hidden /> : <ChevronDown className="size-5" aria-hidden />}
          </button>
        )}
      </div>

      {view === "perfil" && profile && tour && (
        <div className="mt-2">
          <ElevationProfile profile={profile} active={tour.index} onActive={(i) => i !== null && onSeek(i)} overlay />
        </div>
      )}
      {view === "capas" && (
        <div id="map-layers" className="mt-2 max-h-[42dvh] space-y-0.5 overflow-y-auto overscroll-contain">
          {layers}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={view === "capas"}
          aria-controls="map-layers"
          onClick={() => onView(view === "capas" ? "perfil" : "capas")}
          className={clsx(ACTION, view === "capas" ? "bg-on-surface text-surface" : "bg-surface-container-lowest/80 text-on-surface ring-1 ring-outline-variant/60 hover:bg-surface-container-lowest")}
        >
          <Layers className="size-4" aria-hidden />
          Capas
          {activeLayers > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-on-primary" aria-label={`${activeLayers} activas`}>
              {activeLayers}
            </span>
          )}
        </button>
        <button type="button" onClick={onDownload} className={clsx(ACTION, "bg-primary text-on-primary hover:bg-primary-container")}>
          <CloudDownload className="size-4" aria-hidden />
          Descargar mapa
        </button>
      </div>
    </div>
  );
}
