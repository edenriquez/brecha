const RAD = Math.PI / 180;
// CDMX no tiene horario de verano desde 2022
export const MX_OFFSET = "-06:00";

/** Posición del sol (grados): azimut desde el norte en sentido horario y altura sobre el horizonte. Precisión ~0.5°. */
export function sunPosition(date: Date, lat: number, lng: number) {
  const d = date.getTime() / 86_400_000 - 10_957.5; // días desde J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
  const dec = Math.asin(Math.sin(e) * Math.sin(l));
  const gmst = 18.697374558 + 24.06570982441908 * d;
  const h = (gmst * 15 + lng) * RAD - ra;
  const phi = lat * RAD;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  const azimuth = Math.atan2(-Math.sin(h), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(h));
  return { azimuth: (azimuth / RAD + 360) % 360, altitude: altitude / RAD };
}

/** Hora (minutos del día, hora de CDMX) a la que sale y se pone el sol sobre un horizonte plano. */
export function sunTimes(day: string, lat: number, lng: number) {
  const at = (min: number) => sunPosition(mxDate(day, min), lat, lng).altitude + 0.833;
  const cross = (from: number, to: number) => {
    for (let m = from; m < to; m += 2) if (Math.sign(at(m)) !== Math.sign(at(m + 2))) return m + 1;
    return null;
  };
  return { sunrise: cross(240, 720), sunset: cross(720, 1260) };
}

/** `day` en AAAA-MM-DD y minutos desde la medianoche, en hora de CDMX. */
export function mxDate(day: string, minutes: number) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return new Date(`${day}T${hh}:${mm}:00${MX_OFFSET}`);
}

export function mxToday() {
  return new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
}

export function formatMinutes(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

const DIRECTIONS = ["el norte", "el noreste", "el este", "el sureste", "el sur", "el suroeste", "el oeste", "el noroeste"];
export function compassName(azimuth: number) {
  return DIRECTIONS[Math.round(azimuth / 45) % 8];
}
