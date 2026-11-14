"use client";

import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import clsx from "clsx";
import type { ProfilePoint } from "@/lib/gpx";
import { notices, NOTICE, TRACTION, tractionSegments, UNMARKED, type RouteAnnotation } from "@/lib/annotations";

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
  overlay,
  position,
  annotations,
  onPick,
}: {
  profile: ProfilePoint[];
  active: number | null;
  onActive: (index: number | null) => void;
  /** Encima del mapa del recorrido: más bajo, sin escala de altitud (la del punto va bajo la gráfica), y el punto solo se mueve arrastrando (no al pasar el cursor) */
  overlay?: boolean;
  /** Índice donde va el GPS: punto azul con línea punteada y la etiqueta "Posición actual" */
  position?: number | null;
  /** Banda de tracción bajo la gráfica y avisos numerados sobre la curva */
  annotations?: RouteAnnotation[];
  /** Un clic elige ese punto del perfil (editor de anotaciones) */
  onPick?: (point: ProfilePoint) => void;
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
  const here = position == null ? null : profile[position];
  // en el visor: la altitud del punto que arrastras o, si no, la de donde vas
  const reading = overlay ? (point ? `km ${km(point[0])} · ${meters(point[1])}` : here && meters(here[1])) : null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="flex gap-2 select-none">
      <div hidden={overlay} className="relative w-12 shrink-0 text-right font-mono text-[10px] text-outline" aria-hidden>
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
          onPointerMove={(e: PointerEvent) => (!overlay || e.buttons) && onActive(indexAt(e.clientX))}
          onPointerDown={(e: PointerEvent) => {
            if (overlay) e.currentTarget.setPointerCapture(e.pointerId);
            onActive(indexAt(e.clientX));
          }}
          onPointerLeave={(e: PointerEvent) => !overlay && e.pointerType === "mouse" && onActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => !overlay && onActive(null)}
          onClick={(e) => onPick?.(profile[indexAt(e.clientX)])}
          className={clsx(
            "relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            // arriba queda el hueco para la etiqueta de la posición
            overlay ? "mt-6 h-20 cursor-ew-resize touch-none" : "h-40 cursor-crosshair touch-pan-y sm:h-48",
          )}
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
                hidden={overlay}
                className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-md bg-on-surface px-2 py-1 font-mono text-[11px] whitespace-nowrap text-surface shadow"
                style={{ left: `clamp(3.5rem, ${pct(chart.x(point[0]), W)}, calc(100% - 3.5rem))` }}
              >
                km {km(point[0])} · {meters(point[1])}
              </div>
            </>
          )}
          {here && (
            <>
              <div className="pointer-events-none absolute bottom-0 -translate-x-1/2 border-l-2 border-dotted border-[#1da1f2]" style={{ left: pct(chart.x(here[0]), W), top: pct(chart.y(here[1]), H) }} />
              <div
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1da1f2] shadow"
                style={{ left: pct(chart.x(here[0]), W), top: pct(chart.y(here[1]), H) }}
              />
              <div
                className="pointer-events-none absolute -translate-x-1/2 rounded bg-on-surface/85 px-1.5 py-0.5 font-mono text-[9px] tracking-wider whitespace-nowrap text-surface uppercase"
                style={{ left: `clamp(3rem, ${pct(chart.x(here[0]), W)}, calc(100% - 3rem))`, bottom: `calc(${pct(H - chart.y(here[1]), H)} + 0.75rem)` }}
              >
                Posición actual
              </div>
            </>
          )}
          {annotations &&
            notices(annotations).map((a, i) => {
              const kind = NOTICE[a.kind as keyof typeof NOTICE];
              const near = profile.reduce((b, p) => (Math.abs(p[0] - a.km) < Math.abs(b[0] - a.km) ? p : b));
              return (
                <div
                  key={a.id}
                  title={`${i + 1}. ${kind.label}`}
                  className="pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-headline text-[10px] font-bold text-white shadow"
                  style={{ left: pct(chart.x(a.km), W), top: pct(chart.y(near[1]), H), background: kind.color }}
                >
                  {i + 1}
                </div>
              );
            })}
        </div>
        {annotations?.some((a) => a.kind === "traccion") && (
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full" aria-hidden>
            {tractionSegments(annotations, total).map((t) => (
              <span
                key={t.from}
                className="absolute inset-y-0"
                style={{ left: pct(t.from, total), width: pct(t.to - t.from, total), background: t.traction ? TRACTION[t.traction].color : UNMARKED.color }}
              />
            ))}
          </div>
        )}
        <div className="relative mt-1 h-4 font-mono text-[10px] text-outline" aria-hidden>
          <span className="absolute left-0">0 km</span>
          {reading ? (
            <span className="absolute left-1/2 -translate-x-1/2 text-on-surface">{reading}</span>
          ) : (
            chart.xTicks.map((d) => (
              <span key={d} className="absolute -translate-x-1/2" style={{ left: pct(d, total) }}>
                {km(d)}
              </span>
            ))
          )}
          <span className="absolute right-0">{km(total)} km</span>
        </div>
      </div>
    </div>
  );
}
