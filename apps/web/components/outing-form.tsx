"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { CheckCircle2, Mountain, Send } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { OutingCard } from "@/components/outing-card";
import { RulesConsent } from "@/components/rules-consent";
import { createOuting, updateOuting, type ActionState } from "@/app/salidas/actions";
import { DIFFICULTY, formatDuration, formatKm } from "@/lib/routes";
import { LEVEL, mexicoCityISO, PACE, todayInMexicoCity, type OutingLevel, type OutingPace, type OutingRoute, type Person } from "@/lib/outings";

const input =
  "w-full rounded-lg border border-outline bg-surface-container-lowest px-3.5 py-2.5 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none";
const label = "mb-1.5 block font-headline text-sm font-bold";

export type OutingFields = {
  title: string;
  date: string;
  time: string;
  meeting_point_label: string;
  capacity: number;
  level: OutingLevel;
  pace: OutingPace;
  notes: string;
};

const NEW_OUTING: OutingFields = {
  title: "",
  date: "",
  time: "07:00",
  meeting_point_label: "",
  capacity: 12,
  level: "intermedio",
  pace: "moderado",
  notes: "",
};

/** Sin `editing` convoca una salida nueva; con él edita una existente (el cupo no baja de los inscritos). `askRules`: falta aceptar las reglas. */
export function OutingForm({
  route,
  organizer,
  editing,
  askRules = false,
}: {
  route: OutingRoute;
  organizer: Pick<Person, "display_name" | "avatar_url" | "avatar_path">;
  editing?: { id: string; members: number; fields: OutingFields };
  askRules?: boolean;
}) {
  const action = editing ? updateOuting.bind(null, { id: editing.id, slug: route.slug }) : createOuting.bind(null, { id: route.id, slug: route.slug });
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { error: null });
  const initial = editing?.fields ?? NEW_OUTING;
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [meetingPoint, setMeetingPoint] = useState(initial.meeting_point_label);
  const [capacity, setCapacity] = useState(initial.capacity);
  const [level, setLevel] = useState<OutingLevel>(initial.level);
  const [pace, setPace] = useState<OutingPace>(initial.pace);
  const [notes, setNotes] = useState(initial.notes);
  const members = editing?.members ?? 1;
  const today = todayInMexicoCity();
  const difficulty = DIFFICULTY[route.difficulty];

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
      <form action={formAction} className="space-y-6 lg:col-span-7">
        <section className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm sm:p-7">
          <div>
            <span className={label}>Ruta</span>
            <div className="flex items-center gap-3.5 rounded-xl border-2 border-primary-container bg-surface-container-low p-3">
              {route.cover_url ? (
                <Image src={route.cover_url} alt="" width={64} height={64} className="size-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary-fixed/60 text-primary-container">
                  <Mountain className="size-7" aria-hidden />
                </span>
              )}
              <div>
                <p className="font-headline font-bold">{route.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  {formatKm(route.distance_km)} · ↑ {route.elevation_gain_m.toLocaleString("es-MX")} m · {formatDuration(route.duration_min)}
                  <span className="flex items-center gap-1 font-semibold">
                    <span className={clsx("size-2 rounded-full", difficulty.dot)} />
                    {difficulty.label}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="title">
              Nombre de la salida
            </label>
            <input id="title" name="title" required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Amanecer en ${route.name}`} className={input} />
            <p className="mt-1.5 text-xs text-on-surface-variant">Un nombre claro y motivador atrae a gente con tu mismo plan.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="date">
                Fecha
              </label>
              <input id="date" name="date" type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="time">
                Hora de reunión
              </label>
              <input id="time" name="time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="meeting_point_label">
              Punto de encuentro
            </label>
            <input
              id="meeting_point_label"
              name="meeting_point_label"
              required
              minLength={3}
              maxLength={120}
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              placeholder="Metro Universidad, salida C"
              className={input}
            />
          </div>

          <Segmented name="level" legend="Nivel recomendado del grupo" options={LEVEL} value={level} onChange={setLevel} />
          <Segmented name="pace" legend="Ritmo de caminata" options={PACE} value={pace} onChange={setPace} />

          <div>
            <label className={label} htmlFor="capacity">
              Cupo (contándote a ti)
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              required
              min={Math.max(2, members)}
              max={100}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className={clsx(input, "max-w-32")}
            />
            {editing && members > 1 && (
              <p className="mt-1.5 text-xs text-on-surface-variant">Ya hay {members} personas inscritas: el cupo no puede ser menor.</p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="notes">
              Notas para el grupo <span className="font-body font-normal text-on-surface-variant">(opcional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qué llevar, si habrá carpool, cooperación para gasolina…"
              className={input}
            />
          </div>
        </section>

        {askRules && !editing && <RulesConsent />}

        <div className="flex flex-col items-stretch gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-on-surface-variant">
            {state.error ? (
              <span className="font-semibold text-error">{state.error}</span>
            ) : editing ? (
              "Quienes ya se unieron verán los cambios en la salida."
            ) : (
              "Ocuparás el primer lugar del cupo."
            )}
          </p>
          <button
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-lg bg-secondary-container px-5 py-2.5 font-headline text-sm font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <Send className="size-4" aria-hidden />
            {editing ? (pending ? "Guardando…" : "Guardar cambios") : pending ? "Publicando…" : "Publicar salida"}
          </button>
        </div>
      </form>

      <aside className="lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-2 font-headline text-xs font-bold tracking-wider uppercase">
              <span className="size-2.5 rounded-full bg-primary-container" />
              Vista previa
            </span>
            <span className="text-xs text-on-surface-variant">Así lo verá la comunidad</span>
          </div>
          <OutingCard
            preview
            outing={{
              id: "preview",
              title,
              starts_at: date ? mexicoCityISO(date, time || "07:00") : new Date().toISOString(),
              meeting_point_label: meetingPoint,
              capacity: capacity || 2,
              members,
              route,
            }}
          />
          <div className="flex items-center gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-3.5">
            <Avatar person={organizer} size={36} />
            <div>
              <p className="text-xs font-bold">Organizado por ti</p>
              <p className="text-[11px] text-on-surface-variant">
                {LEVEL[level]} · ritmo {PACE[pace].toLowerCase()}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className={label}>{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(options) as T[]).map((key) => (
          <label
            key={key}
            className={clsx(
              "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs transition-all",
              value === key
                ? "border-primary-container bg-primary-container font-bold text-on-primary shadow-sm"
                : "border-outline-variant bg-surface-container-lowest font-semibold hover:border-primary",
            )}
          >
            <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} className="sr-only" />
            {value === key && <CheckCircle2 className="size-4" aria-hidden />}
            {options[key]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
