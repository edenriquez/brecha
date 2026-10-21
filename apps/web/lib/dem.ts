import type { TrackPoint } from "@/lib/gpx";

// Modelo de elevación abierto (Terrarium de Mapzen/AWS, sin llave): sombrea el relieve y completa GPX sin altitud
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ZOOM = 12; // ~30 m por pixel en la latitud de CDMX, la resolución del modelo
const TILE = 256;

function loadTile(x: number, y: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = TILE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, TILE, TILE).data);
    };
    img.onerror = () => reject(new Error("No se pudo leer el modelo de elevación."));
    img.src = DEM_TILES.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
  });
}

/** Altitud de cada punto leída del modelo de elevación, para GPX que no la traen (rutas dibujadas a mano). Solo navegador. */
export async function fillElevationFromDem(points: TrackPoint[]): Promise<TrackPoint[]> {
  const scale = TILE * 2 ** ZOOM;
  const pixels = points.map((p) => {
    const sin = Math.sin((p.lat * Math.PI) / 180);
    const px = ((p.lng + 180) / 360) * scale;
    const py = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return { px, py, key: `${Math.floor(px / TILE)}/${Math.floor(py / TILE)}` };
  });
  const keys = [...new Set(pixels.map((p) => p.key))];
  if (keys.length > 60) throw new Error("La ruta es demasiado extensa para calcular su altitud.");
  const tiles = new Map(
    await Promise.all(
      keys.map(async (key) => {
        const [x, y] = key.split("/").map(Number);
        return [key, await loadTile(x, y)] as const;
      }),
    ),
  );
  return points.map((p, i) => {
    const { px, py, key } = pixels[i];
    const data = tiles.get(key)!;
    const o = ((Math.floor(py) % TILE) * TILE + (Math.floor(px) % TILE)) * 4;
    return { ...p, ele: data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768 };
  });
}
