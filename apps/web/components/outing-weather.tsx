import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, Sun, Sunrise, Sunset, TriangleAlert, Wind, type LucideIcon } from "lucide-react";
import { getOutingForecast, type HourForecast } from "@/lib/weather.server";

/** Códigos WMO que devuelve Open-Meteo. */
function weather(code: number): { label: string; Icon: LucideIcon } {
  if (code === 0) return { label: "Despejado", Icon: Sun };
  if (code <= 2) return { label: "Parcialmente nublado", Icon: CloudSun };
  if (code === 3) return { label: "Nublado", Icon: Cloud };
  if (code <= 48) return { label: "Niebla", Icon: CloudFog };
  if (code <= 57) return { label: "Llovizna", Icon: CloudDrizzle };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: code >= 80 ? "Chubascos" : "Lluvia", Icon: CloudRain };
  if (code <= 77 || code === 85 || code === 86) return { label: "Nieve", Icon: CloudSnow };
  return { label: "Tormenta eléctrica", Icon: CloudLightning };
}

/** "06:58" → "6:58 a.m.", igual que las horas de las salidas. */
function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(Date.UTC(2000, 0, 1, h, m));
}

const deg = (t: number) => `${Math.round(t)}°`;

function tips(hours: HourForecast[], min: number, uv: number | null) {
  const out: string[] = [];
  if (hours.some((h) => h.code >= 95)) out.push("Pueden caer tormentas eléctricas: evita cimas y crestas expuestas y fija una hora límite para regresar.");
  if (hours.some((h) => (h.rain ?? 0) >= 50)) out.push("Probabilidad alta de lluvia durante la salida: lleva impermeable y protege tu mochila.");
  if (min <= 5) out.push("Hará frío a primera hora: lleva capas de abrigo, gorro y guantes.");
  if (hours.some((h) => h.wind >= 40)) out.push("Viento fuerte en las zonas expuestas.");
  if ((uv ?? 0) >= 8) out.push("Índice UV muy alto: bloqueador, gorra y lentes de sol.");
  return out;
}

const SECTION = "rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs";

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="flex items-center gap-2 font-headline text-lg font-bold">
        <CloudSun className="size-5 text-primary" aria-hidden />
        Pronóstico del clima
      </h2>
      {children}
    </div>
  );
}

export async function OutingWeather({ routeId, startsAt, durationMin }: { routeId: string; startsAt: string; durationMin: number }) {
  const forecast = await getOutingForecast(routeId, startsAt, durationMin);
  if (!forecast) return null;

  if (forecast.kind === "pending") {
    return (
      <section className={SECTION}>
        <Heading />
        <p className="text-sm text-on-surface-variant">El pronóstico para el día de la salida estará disponible a partir del {forecast.availableFrom}.</p>
      </section>
    );
  }

  const { day, hours, elevation } = forecast;
  const today = weather(day.code);
  const advice = tips(hours, day.min, day.uv);

  return (
    <section className={SECTION}>
      <Heading>
        <span className="text-xs text-on-surface-variant">Inicio de la ruta · {Math.round(elevation).toLocaleString("es-MX")} m</span>
      </Heading>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <today.Icon className="size-10 text-primary-container" aria-hidden />
          <div>
            <p className="font-headline text-base font-bold">{today.label}</p>
            <p className="text-sm text-on-surface-variant">
              En el día: máx {deg(day.max)} · mín {deg(day.min)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
          {day.rain != null && (
            <span className="flex items-center gap-1" title="Probabilidad máxima de lluvia en el día">
              <Droplets className="size-3.5" aria-hidden /> Lluvia hasta {day.rain}%
            </span>
          )}
          <span className="flex items-center gap-1">
            <Sunrise className="size-3.5" aria-hidden /> {clock(day.sunrise)}
          </span>
          <span className="flex items-center gap-1">
            <Sunset className="size-3.5" aria-hidden /> {clock(day.sunset)}
          </span>
        </div>
      </div>

      {hours.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-xs font-semibold text-on-surface-variant">Durante la salida</p>
          <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Pronóstico por hora durante la salida">
            {hours.map((h) => {
              const { label, Icon } = weather(h.code);
              return (
                <li key={h.time} className="flex min-w-16 flex-1 flex-col items-center gap-1 rounded-xl bg-surface-container-low px-2 py-2.5 text-xs">
                  <span className="font-semibold text-on-surface-variant">{clock(h.time).replace(":00", "")}</span>
                  <Icon className="size-5 text-primary-container" aria-label={label} />
                  <span className="font-headline text-sm font-bold">{deg(h.temp)}</span>
                  <span className="flex items-center gap-0.5 text-[11px] text-on-surface-variant" title="Probabilidad de lluvia">
                    <Droplets className="size-3" aria-hidden />
                    {h.rain ?? "–"}%
                  </span>
                  {h.wind >= 25 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-on-surface-variant" title="Viento">
                      <Wind className="size-3" aria-hidden />
                      {Math.round(h.wind)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {advice.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {advice.map((tip) => (
            <li key={tip} className="flex gap-2 text-xs font-medium text-on-surface">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-secondary" aria-hidden />
              {tip}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] text-outline">
        Pronóstico orientativo de{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          Open-Meteo
        </a>
        ; se actualiza cada media hora. Revísalo de nuevo antes de salir.
      </p>
    </section>
  );
}

export function OutingWeatherSkeleton() {
  return (
    <section className={SECTION} aria-busy>
      <Heading />
      <div className="h-24 animate-pulse rounded-xl bg-surface-container" />
    </section>
  );
}
