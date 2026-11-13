import { estimateDurationMin, haversineM, type ProfilePoint } from "@/lib/gpx";

/** El mismo perfil recorrido de regreso: el km 0 queda en el final de la ida. */
export function reverseProfile(profile: ProfilePoint[]): ProfilePoint[] {
  const total = profile[profile.length - 1][0];
  return profile.map(([km, ele, lng, lat]): ProfilePoint => [Math.round((total - km) * 100) / 100, ele, lng, lat]).reverse();
}

/** Metros de `p` al tramo a–b (plano local: en tramos de decenas de metros basta). */
function segmentM(p: { lng: number; lat: number }, a: ProfilePoint, b: ProfilePoint) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const [ax, ay, bx, by] = [(a[2] - p.lng) * k, a[3] - p.lat, (b[2] - p.lng) * k, b[3] - p.lat];
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = len ? Math.min(Math.max(-(ax * (bx - ax) + ay * (by - ay)) / len, 0), 1) : 0;
  return Math.hypot(ax + t * (bx - ax), ay + t * (by - ay)) * 111_320;
}

/**
 * Dónde vas sobre el perfil. `last` es el índice de la lectura anterior: en un ida y vuelta por el mismo camino
 * hay dos puntos casi igual de cerca y se queda con el más próximo a `last` (sin él, el menor).
 */
export function trackProgress(profile: ProfilePoint[], pos: { lng: number; lat: number }, last: number | null) {
  const dists = profile.map(([, , lng, lat]) => haversineM(pos, { lng, lat }));
  const min = Math.min(...dists);
  const ref = last ?? 0;
  let index = -1;
  dists.forEach((d, i) => {
    // empate: el de adelante, para que en la vuelta del ida y vuelta siga por la segunda mitad
    if (d <= min + 30 && (index < 0 || Math.abs(i - ref) <= Math.abs(index - ref))) index = i;
  });
  // al tramo y no al punto: entre puntos del perfil puede haber más de 50 m
  let offM = min;
  for (let i = 1; i < profile.length; i++) offM = Math.min(offM, segmentM(pos, profile[i - 1], profile[i]));
  let climbM = 0;
  let lossM = 0;
  for (let i = index + 1; i < profile.length; i++) {
    const d = profile[i][1] - profile[i - 1][1];
    if (d > 0) climbM += d;
    else lossM -= d;
  }
  const doneKm = profile[index][0];
  const leftKm = profile[profile.length - 1][0] - doneKm;
  return { index, offM, doneKm, leftKm, climbM, minutes: estimateDurationMin(leftKm, climbM, lossM) };
}
