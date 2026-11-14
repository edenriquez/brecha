"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Loader2, PencilLine, Trash2 } from "lucide-react";
import { deleteAnnotation, saveAnnotation, type AnnotationResult } from "@/app/rutas/[slug]/anotaciones/actions";
import { ElevationProfile } from "@/components/elevation-profile";
import { TrackMap } from "@/components/route-map-lazy";
import { kmLabel, lineKm, nearestVertex, NOTE_MAX, NOTICE, notices, TRACTION, tractionSegments, UNMARKED, type NoticeKind, type RouteAnnotation, type Traction } from "@/lib/annotations";
import type { ProfilePoint } from "@/lib/gpx";
import type { LineCoords } from "@/lib/maplibre";

type Place = { km: number; lng: number; lat: number };
/** Qué se marca: una tracción "desde aquí" o un tipo de aviso. */
type Mark = Traction | NoticeKind;

const CHIP = "rounded-full border px-3 py-1 text-xs font-semibold transition-colors";
const CARD = "rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-4 sm:p-5";
const ICON_BUTTON = "rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-primary disabled:opacity-50";

/** Editor de anotaciones: elegir un punto en el mapa o el perfil, qué se marca ahí y guardarlo; cada cambio se guarda al momento. */
export function AnnotationEditor({
  route,
  line: initialLine,
  profile,
  annotations,
}: {
  route: { id: string; slug: string; distanceKm: number };
  line: LineCoords;
  profile: ProfilePoint[] | null;
  annotations: RouteAnnotation[];
}) {
  // cada guardado refresca las props: el trazo se fija para que el mapa no se vuelva a crear
  const [line] = useState(initialLine);
  const km = useMemo(() => lineKm(line), [line]);
  const [active, setActive] = useState<number | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [mark, setMark] = useState<Mark>("normal");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (p: Place) => setPlace({ ...p, km: Math.min(p.km, route.distanceKm) });
  const activePoint = active !== null && profile ? profile[active] : null;
  const segments = tractionSegments(annotations, route.distanceKm);
  const list = notices(annotations);

  function reset() {
    setEditing(null);
    setPlace(null);
    setNote("");
  }

  function run(action: () => Promise<AnnotationResult>, after?: () => void) {
    start(async () => {
      const { error } = await action();
      setError(error);
      if (!error) after?.();
    });
  }

  function save() {
    if (!place) return setError("Elige un punto en el mapa o el perfil.");
    const traction = mark in TRACTION ? (mark as Traction) : null;
    run(() => saveAnnotation(route, { id: editing ?? undefined, kind: traction ? "traccion" : (mark as NoticeKind), traction, ...place, note }), reset);
  }

  function edit(a: RouteAnnotation) {
    setEditing(a.id);
    setPlace({ km: a.km, lng: a.lng, lat: a.lat });
    setMark(a.traction ?? (a.kind as NoticeKind));
    setNote(a.note ?? "");
    setError(null);
  }

  function remove(id: string) {
    if (!window.confirm("¿Borrar esta anotación?")) return;
    run(() => deleteAnnotation(route, id), () => editing === id && reset());
  }

  const actions = (id: string) => (
    <span className="flex justify-end">
      <button type="button" disabled={pending} onClick={() => edit(annotations.find((a) => a.id === id)!)} className={ICON_BUTTON} aria-label="Editar">
        <PencilLine className="size-4" aria-hidden />
      </button>
      <button type="button" disabled={pending} onClick={() => remove(id)} className={clsx(ICON_BUTTON, "hover:text-error")} aria-label="Borrar">
        <Trash2 className="size-4" aria-hidden />
      </button>
    </span>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <section className={clsx(CARD, "space-y-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-headline text-base font-bold">Trazo en mapa</h2>
          <p className="font-mono text-[11px] text-outline">Haz clic en el mapa{profile ? " o en el perfil" : ""} para elegir el punto</p>
        </div>
        <div className="relative h-72 overflow-hidden rounded-xl border border-outline-variant/60 bg-[#e3e8e1] sm:h-96">
          <TrackMap
            line={line}
            hover={activePoint ? [activePoint[2], activePoint[3]] : place && [place.lng, place.lat]}
            annotations={annotations}
            onPick={(lngLat) => {
              const i = nearestVertex(line, lngLat);
              pick({ km: km[i], lng: line[i][0], lat: line[i][1] });
            }}
          />
        </div>
        {profile && <ElevationProfile profile={profile} active={active} onActive={setActive} annotations={annotations} onPick={(p) => pick({ km: p[0], lng: p[2], lat: p[3] })} />}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4 border-t border-outline-variant/40 pt-4"
        >
          <p className="font-headline text-sm font-bold">
            {place ? kmLabel(place.km) : "Elige un punto"}
            {editing && <span className="ml-2 text-xs font-semibold text-secondary">Editando</span>}
          </p>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-on-surface-variant">Tracción desde aquí</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TRACTION) as Traction[]).map((t) => (
                <MarkChip key={t} selected={mark === t} color={TRACTION[t].color} label={TRACTION[t].label} onClick={() => setMark(t)} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-on-surface-variant">Aviso</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NOTICE) as NoticeKind[]).map((k) => (
                <MarkChip key={k} selected={mark === k} color={NOTICE[k].color} label={NOTICE[k].label} onClick={() => setMark(k)} />
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">Nota{mark === "comentario" ? "" : " (opcional)"}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              required={mark === "comentario"}
              rows={2}
              placeholder="Vado de 40 cm tras lluvia"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {error && <p className="mr-auto text-xs font-semibold text-error">{error}</p>}
            {(editing || place) && (
              <button type="button" onClick={reset} className="px-2 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-primary">
                Cancelar
              </button>
            )}
            <button disabled={pending || !place} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60">
              {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {editing ? "Guardar" : "Agregar"}
            </button>
          </div>
        </form>
      </section>

      <div className="space-y-6">
        <section className={CARD}>
          <h2 className="mb-3 font-headline text-base font-bold">Tramos por tracción</h2>
          {segments.some((s) => s.id) ? (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] text-outline">
                <tr>
                  <th className="pb-2 font-semibold">Tracción</th>
                  <th className="pb-2 text-right font-semibold">Desde</th>
                  <th className="pb-2 text-right font-semibold">Hasta</th>
                  <th className="pb-2 text-right font-semibold">Largo</th>
                  <th className="pb-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 font-mono text-xs">
                {segments.map((s) => {
                  const t = s.traction ? TRACTION[s.traction] : UNMARKED;
                  return (
                    <tr key={s.id ?? "sin-marcar"} className={clsx(s.id && s.id === editing && "bg-primary-fixed/30")}>
                      <td className="py-2 font-sans font-semibold">
                        <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                        {t.label}
                      </td>
                      <td className="py-2 text-right">{s.from.toFixed(1)} km</td>
                      <td className="py-2 text-right">{s.to.toFixed(1)} km</td>
                      <td className="py-2 text-right">{(s.to - s.from).toFixed(1)} km</td>
                      <td className="py-1">{s.id && actions(s.id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-on-surface-variant">Sin tramos todavía. Elige un punto y marca la tracción que hace falta desde ahí: vale hasta la siguiente marca o el final.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className="mb-3 font-headline text-base font-bold">Avisos</h2>
          {list.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] text-outline">
                <tr>
                  <th className="pb-2 font-semibold">#</th>
                  <th className="pb-2 font-semibold">Tipo</th>
                  <th className="pb-2 text-right font-semibold">Km</th>
                  <th className="pb-2 pl-3 font-semibold">Nota</th>
                  <th className="pb-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 text-xs">
                {list.map((a, i) => {
                  const kind = NOTICE[a.kind as NoticeKind];
                  const Icon = kind.icon;
                  return (
                    <tr key={a.id} className={clsx(a.id === editing && "bg-primary-fixed/30")}>
                      <td className="py-2">
                        <span className="flex size-6 items-center justify-center rounded-full font-headline text-[11px] font-bold text-white" style={{ background: kind.color }}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <Icon className="size-3.5 shrink-0" style={{ color: kind.color }} aria-hidden />
                          {kind.label}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono">{a.km.toFixed(1)}</td>
                      <td className="max-w-40 truncate py-2 pl-3 text-on-surface-variant" title={a.note ?? undefined}>
                        {a.note}
                      </td>
                      <td className="py-1">{actions(a.id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-on-surface-variant">Sin avisos todavía: marca obstrucciones, lodo o agua, pasos difíciles, chicken lines o deja un comentario.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function MarkChip({ selected, color, label, onClick }: { selected: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(CHIP, selected ? "border-transparent text-white" : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-outline")}
      style={selected ? { background: color } : undefined}
    >
      {label}
    </button>
  );
}
