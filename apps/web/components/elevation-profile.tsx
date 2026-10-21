"use client";

import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { ProfilePoint } from "@/lib/gpx";

const W = 1000;
const H = 200;

/** Paso "redondo" (1, 2, 5 × 10^n) para tener unas `target` divisiones. */
function niceStep(range: number, target: number) {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

const km = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 });
const meters = (n: number) => `${Math.round(n).toLocaleString("es-MX")} m`;

export function ElevationProfile({
  profile,
  active,
  onActive,
}: {
  profile: ProfilePoint[];
  active: number | null;
  onActive: (index: number | null) => void;
}) {
  const gradient = useId();
  const box = useRef<HTMLDivElement>(null);
  const total = profile[profile.length - 1][0];

  const chart = useMemo(() => {
    const eles = profile.map((p) => p[1]);
    const minE = Math.min(...eles);
    const maxE = Math.max(...eles);
    // al menos 100 m de alto: una ruta plana no debe verse como una cordillera
    const span = Math.max(maxE - minE, 100);
    const yStep = niceStep(span, 3);
    const lo = Math.floor((minE - span * 0.1) / yStep) * yStep;
    const hi = Math.ceil((maxE + span * 0.05) / yStep) * yStep;
    const x = (d: number) => (d / total) * W;
    const y = (e: number) => H - ((e - lo) / (hi - lo)) * H;
    const line = profile.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const yTicks: number[] = [];
    for (let e = lo + yStep; e < hi; e += yStep) yTicks.push(e);
    const xStep = niceStep(total, 5);
    const xTicks: number[] = [];
    for (let d = xStep; d < total - xStep / 3; d += xStep) xTicks.push(d);
    return { line, area: `${line}L${W},${H}L0,${H}Z`, x, y, yTicks, xTicks, minE, maxE };
  }, [profile, total]);

  function indexAt(clientX: number) {
    const rect = box.current!.getBoundingClientRect();
    const d = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * total;
    let best = 0;
    for (let i = 1; i < profile.length; i++) if (Math.abs(profile[i][0] - d) < Math.abs(profile[best][0] - d)) best = i;
    return best;
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = profile.length - 1;
    const step = e.shiftKey ? 10 : 1;
    const current = active ?? 0;
    const next = { ArrowRight: current + step, ArrowLeft: current - step, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onActive(Math.min(Math.max(next, 0), last));
  }

  const point = active === null ? null : profile[active];
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="flex gap-2 select-none">
      <div className="relative w-12 shrink-0 text-right font-mono text-[10px] text-outline" aria-hidden>
        {chart.yTicks.map((e) => (
          <span key={e} className="absolute right-0 -translate-y-1/2" style={{ top: pct(chart.y(e), H) }}>
            {e.toLocaleString("es-MX")}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div
          ref={box}
          role="slider"
          tabIndex={0}
          aria-label="Perfil de altitud"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={point?.[0] ?? 0}
          aria-valuetext={point ? `km ${km(point[0])}, ${meters(point[1])}` : `${km(total)} km, entre ${meters(chart.minE)} y ${meters(chart.maxE)}`}
          onPointerMove={(e: PointerEvent) => onActive(indexAt(e.clientX))}
          onPointerDown={(e: PointerEvent) => onActive(indexAt(e.clientX))}
          onPointerLeave={(e: PointerEvent) => e.pointerType === "mouse" && onActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => onActive(null)}
          className="relative h-40 cursor-crosshair touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-48"
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ff7a3d" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#ff7a3d" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            {chart.yTicks.map((e) => (
              <line key={e} x1={0} x2={W} y1={chart.y(e)} y2={chart.y(e)} stroke="#c1c9be" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={chart.area} fill={`url(#${gradient})`} />
            <path d={chart.line} fill="none" stroke="#a53c00" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {point && (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-on-surface/50" style={{ left: pct(chart.x(point[0]), W) }} />
              <div
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-secondary shadow"
                style={{ left: pct(chart.x(point[0]), W), top: pct(chart.y(point[1]), H) }}
              />
              <div
                className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-md bg-on-surface px-2 py-1 font-mono text-[11px] whitespace-nowrap text-surface shadow"
                style={{ left: `clamp(3.5rem, ${pct(chart.x(point[0]), W)}, calc(100% - 3.5rem))` }}
              >
                km {km(point[0])} · {meters(point[1])}
              </div>
            </>
          )}
        </div>
        <div className="relative mt-1 h-4 font-mono text-[10px] text-outline" aria-hidden>
          <span className="absolute left-0">0 km</span>
          {chart.xTicks.map((d) => (
            <span key={d} className="absolute -translate-x-1/2" style={{ left: pct(d, total) }}>
              {km(d)}
            </span>
          ))}
          <span className="absolute right-0">{km(total)} km</span>
        </div>
      </div>
    </div>
  );
}
