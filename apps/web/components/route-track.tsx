"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ElevationProfile } from "@/components/elevation-profile";
import { TrackMap } from "@/components/route-map-lazy";
import type { ProfilePoint } from "@/lib/gpx";
import type { LineCoords } from "@/lib/maplibre";

/** Mapa del trazo y perfil de altitud enlazados: recorrer el perfil marca el punto en el mapa. */
export function RouteTrack({ line, profile }: { line: LineCoords; profile: ProfilePoint[] | null }) {
  const [active, setActive] = useState<number | null>(null);
  const point = active !== null && profile ? profile[active] : null;
  const eles = profile?.map((p) => p[1]);

  return (
    <div className="space-y-5">
      <div className="relative h-80 overflow-hidden rounded-xl border border-outline-variant/60 bg-[#e3e8e1] sm:h-[26rem]">
        <TrackMap line={line} hover={point ? [point[2], point[3]] : null} />
      </div>
      {profile && eles && (
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-headline text-sm font-bold">Perfil de altitud</h3>
            <p className="flex gap-3 font-mono text-[11px] text-on-surface-variant">
              <span className="flex items-center gap-1">
                <ArrowUp className="size-3" aria-hidden />
                máx {Math.max(...eles).toLocaleString("es-MX")} m
              </span>
              <span className="flex items-center gap-1">
                <ArrowDown className="size-3" aria-hidden />
                mín {Math.min(...eles).toLocaleString("es-MX")} m
              </span>
            </p>
          </div>
          <ElevationProfile profile={profile} active={active} onActive={setActive} />
        </div>
      )}
    </div>
  );
}
