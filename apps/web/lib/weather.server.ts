import "server-only";
import { createAnonClient } from "@/lib/supabase/server";
import { mexicoCityFields, TZ, todayInMexicoCity } from "@/lib/outings";

/** Open-Meteo pronostica hoy y los 15 días siguientes. */
const FORECAST_DAYS = 16;
const HOURLY = "temperature_2m,precipitation_probability,weather_code,wind_speed_10m";
const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max";

export type HourForecast = { time: string; temp: number; rain: number | null; code: number; wind: number };

export type DayForecast = {
  code: number;
  max: number;
  min: number;
  rain: number | null;
  sunrise: string;
  sunset: string;
  uv: number | null;
};

export type OutingForecast =
  | { kind: "pending"; availableFrom: string }
  | { kind: "forecast"; elevation: number; day: DayForecast; hours: HourForecast[] };

type OpenMeteo = {
  elevation: number;
  hourly: { time: string[]; temperature_2m: (number | null)[]; precipitation_probability: (number | null)[]; weather_code: (number | null)[]; wind_speed_10m: (number | null)[] };
  daily: {
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: (number | null)[];
  };
};

const DAY_MS = 86_400_000;
const dayNumber = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / DAY_MS;

/**
 * Pronóstico en el inicio de la ruta para el día de la salida, con las horas desde la cita hasta un poco después
 * de lo que dura la ruta. null si la ruta ya no está publicada, la salida ya pasó o Open-Meteo falla.
 */
export async function getOutingForecast(routeId: string, startsAt: string, durationMin: number): Promise<OutingForecast | null> {
  const { date, time } = mexicoCityFields(startsAt);
  const daysAhead = dayNumber(date) - dayNumber(todayInMexicoCity());
  if (daysAhead < 0) return null;
  if (daysAhead >= FORECAST_DAYS) {
    const from = new Date((dayNumber(date) - FORECAST_DAYS + 1) * DAY_MS);
    return { kind: "pending", availableFrom: new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "long" }).format(from) };
  }

  const { data: start } = await createAnonClient().from("routes_feed").select("lat, lng").eq("id", routeId).maybeSingle();
  if (!start) return null;

  const params = new URLSearchParams({
    latitude: String(start.lat),
    longitude: String(start.lng),
    timezone: TZ,
    start_date: date,
    end_date: date,
    hourly: HOURLY,
    daily: DAILY,
  });
  let data: OpenMeteo;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    data = await res.json();
  } catch (e) {
    console.error("open-meteo:", e instanceof Error ? e.message : e);
    return null;
  }

  const firstHour = Number(time.slice(0, 2));
  const span = Math.min(Math.max(Math.ceil(durationMin / 60) + 1, 3), 10);
  const { hourly, daily } = data;
  const hours: HourForecast[] = [];
  hourly.time.forEach((t, i) => {
    const hour = Number(t.slice(11, 13));
    const temp = hourly.temperature_2m[i];
    const code = hourly.weather_code[i];
    if (hour < firstHour || hour >= firstHour + span || temp == null || code == null) return;
    hours.push({ time: t.slice(11, 16), temp, rain: hourly.precipitation_probability[i], code, wind: hourly.wind_speed_10m[i] ?? 0 });
  });

  return {
    kind: "forecast",
    elevation: data.elevation,
    day: {
      code: daily.weather_code[0],
      max: daily.temperature_2m_max[0],
      min: daily.temperature_2m_min[0],
      rain: daily.precipitation_probability_max[0],
      sunrise: daily.sunrise[0].slice(11, 16),
      sunset: daily.sunset[0].slice(11, 16),
      uv: daily.uv_index_max[0],
    },
    hours,
  };
}
