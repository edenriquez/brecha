/// <reference lib="webworker" />

export type ShadeRequest = {
  id: number;
  width: number;
  height: number;
  dem: Float32Array;
  /** metros por pixel */
  cell: number;
  azimuth: number;
  altitude: number;
};
export type ShadeResponse = { id: number; rgba: Uint8ClampedArray };

const SHADOW = [22, 32, 58];

/**
 * Sombra proyectada (cada pixel mira hacia el sol hasta que el rayo pasa por encima de todo) más el sombreado
 * de las laderas que dan la espalda al sol. Transparente donde da el sol de lleno.
 */
function shade({ width: w, height: h, dem, cell, azimuth, altitude }: ShadeRequest) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const night = altitude <= 0;
  const az = (azimuth * Math.PI) / 180;
  const alt = (Math.max(altitude, 0.5) * Math.PI) / 180;
  const dx = Math.sin(az);
  const dy = -Math.cos(az);
  const rise = Math.tan(alt) * cell;
  let maxZ = -Infinity;
  for (const z of dem) if (z > maxZ) maxZ = z;
  const sx = Math.cos(alt) * dx;
  const sy = Math.cos(alt) * -dy;
  const sz = Math.sin(alt);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let dark = 1;
      if (!night) {
        const z0 = dem[i];
        let shadow = false;
        let px = x;
        let py = y;
        for (let s = 1; ; s++) {
          px += dx;
          py += dy;
          const ray = z0 + s * rise;
          if (ray > maxZ || px < 0 || py < 0 || px >= w - 1 || py >= h - 1) break;
          if (dem[(py | 0) * w + (px | 0)] > ray) {
            shadow = true;
            break;
          }
        }
        if (shadow) {
          dark = 1;
        } else {
          const xl = dem[i - (x > 0 ? 1 : 0)];
          const xr = dem[i + (x < w - 1 ? 1 : 0)];
          const yu = dem[i - (y > 0 ? w : 0)];
          const yd = dem[i + (y < h - 1 ? w : 0)];
          const gx = (xr - xl) / (2 * cell);
          const gy = (yu - yd) / (2 * cell);
          const incidence = (-gx * sx - gy * sy + sz) / Math.sqrt(gx * gx + gy * gy + 1);
          // relativo a un terreno plano: el plano no se oscurece, las laderas a contraluz sí
          dark = 1 - Math.min(Math.max(incidence / Math.max(sz, 0.1), 0), 1);
        }
      }
      rgba[i * 4] = SHADOW[0];
      rgba[i * 4 + 1] = SHADOW[1];
      rgba[i * 4 + 2] = SHADOW[2];
      rgba[i * 4 + 3] = Math.round(dark * 150);
    }
  }
  return rgba;
}

self.onmessage = (e: MessageEvent<ShadeRequest>) => {
  const rgba = shade(e.data);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: e.data.id, rgba } satisfies ShadeResponse, [rgba.buffer]);
};
