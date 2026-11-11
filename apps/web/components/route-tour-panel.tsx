"use client";

import { Pause, Play, RotateCcw, X } from "lucide-react";
import { ElevationProfile } from "@/components/elevation-profile";
import type { ProfilePoint } from "@/lib/gpx";
import type { TourState } from "@/lib/route-tour";

const km = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Perfil de altitud translúcido sobre el mapa mientras se recorre la ruta; arrastrarlo mueve el recorrido. */
export function RouteTourPanel({
  name,
  profile,
  state,
  onToggle,
  onSeek,
  onClose,
}: {
  name: string;
  profile: ProfilePoint[];
  state: TourState;
  onToggle: () => void;
  onSeek: (index: number) => void;
  onClose: () => void;
}) {
  const total = profile[profile.length - 1][0];
  const Icon = state.playing ? Pause : state.done ? RotateCcw : Play;

  return (
    <div className="absolute inset-x-3 bottom-20 z-10 rounded-2xl bg-surface-container-lowest/60 p-3 shadow-lg ring-1 ring-white/50 backdrop-blur-md lg:inset-x-4 lg:bottom-4">
      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={state.playing ? "Pausar recorrido" : state.done ? "Repetir recorrido" : "Seguir recorrido"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-on-surface text-surface shadow transition-transform active:scale-95"
        >
          <Icon className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-sm font-bold">{name}</p>
          <p className="font-mono text-[11px] text-on-surface-variant" aria-live="off">
            km {km(state.km)} de {km(total)} · {state.ele.toLocaleString("es-MX")} m
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Salir del recorrido"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ElevationProfile profile={profile} active={state.index} onActive={(i) => i !== null && onSeek(i)} overlay />
    </div>
  );
}
