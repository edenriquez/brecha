import { PMTiles } from "pmtiles";
import type { TrackPoint } from "@/lib/gpx";

// Modelo de elevación abierto (Terrarium de Mapzen/AWS, sin llave): sombrea el relieve y completa GPX sin altitud
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ZOOM = 12; // ~30 m por pixel en la latitud de CDMX, la resolución del modelo
const TILE = 256;

// MDE de 5 m de INEGI (LiDAR y satélite) en la zona de los volcanes, mismo formato Terrarium; alfa 0 = sin dato
const FINE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/capas/lidar-izta`;
/** Fracción de la ruta que debe caer en el modelo de 5 m para usarlo en vez de la altitud del GPS */
const FINE_MIN_COVERAGE = 0.9;
/** elevacion.json: el MDE va en franjas de columnas de teselas (x0–x1 en `zoom`), cada una de < 50 MB */
type FineManifest = { zoom: number; partes: { archivo: string; x0: number; x1: number }[]; bounds: [number, number, number, number] };
let fineManifest: Promise<FineManifest> | null = null;
const fineArchives = new Map<string, PMTiles>();

type Pixel = { px: number; py: number; key: string };

function toPixel(p: { lng: number; lat: number }, zoom: number): Pixel {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  const px = ((p.lng + 180) / 360) * scale;
  const py = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { px, py, key: `${Math.floor(px / TILE)}/${Math.floor(py / TILE)}` };
}

function decode(data: Uint8ClampedArray, px: number, py: number): number | null {
  const o = ((Math.floor(py) % TILE) * TILE + (Math.floor(px) % TILE)) * 4;
  if (data[o + 3] === 0) return null;
  return data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
}

function pixelsOf(source: CanvasImageSource) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, TILE, TILE).data;
}

function loadFineManifest() {
  fineManifest ??= fetch(`${FINE_BASE}/elevacion.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`elevacion.json ${r.status}`))));
  fineManifest.catch(() => (fineManifest = null));
  return fineManifest;
}

/** Las teselas de zoom bajo van repetidas en cada franja que tocan: sirve cualquiera que la cruce. */
async function loadFineTile(manifest: FineManifest, z: number, x: number, y: number): Promise<Uint8ClampedArray | null> {
  const k = 2 ** (manifest.zoom - z);
  const part = manifest.partes.find((p) => x * k <= p.x1 && (x + 1) * k - 1 >= p.x0);
  if (!part) return null;
  let archive = fineArchives.get(part.archivo);
  if (!archive) fineArchives.set(part.archivo, (archive = new PMTiles(`${FINE_BASE}/${part.archivo}`)));
  const tile = await archive.getZxy(z, x, y);
  if (!tile) return null;
  // sin conversión de color ni alfa premultiplicado: los bytes son la altitud
  const bitmap = await createImageBitmap(new Blob([tile.data], { type: "image/webp" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  return pixelsOf(bitmap);
}

function loadTerrariumTile(z: number, x: number, y: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(pixelsOf(img));
    img.onerror = () => reject(new Error("No se pudo leer el modelo de elevación."));
    img.src = DEM_TILES.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  });
}

/**
 * Altitudes (m) de una tesela de 256×256 en el esquema web (z ≤ 15): el MDE de 5 m donde lo hay
 * y Terrarium donde no. Solo navegador.
 */
export async function demTile(z: number, x: number, y: number): Promise<Float32Array> {
  const manifest = await loadFineManifest().catch(() => null);
  const fine = manifest && z <= manifest.zoom ? await loadFineTile(manifest, z, x, y).catch(() => null) : null;
  const out = new Float32Array(TILE * TILE);
  let missing = !fine;
  if (fine) {
    for (let i = 0; i < out.length; i++) {
      if (fine[i * 4 + 3] === 0) missing = true;
      else out[i] = fine[i * 4] * 256 + fine[i * 4 + 1] + fine[i * 4 + 2] / 256 - 32768;
    }
  }
  if (missing) {
    const coarse = await loadTerrariumTile(z, x, y);
    for (let i = 0; i < out.length; i++) {
      if (!fine || fine[i * 4 + 3] === 0) out[i] = coarse[i * 4] * 256 + coarse[i * 4 + 1] + coarse[i * 4 + 2] / 256 - 32768;
    }
  }
  return out;
}

async function loadTiles(pixels: Pixel[], load: (x: number, y: number) => Promise<Uint8ClampedArray | null>, max: number) {
  const keys = [...new Set(pixels.map((p) => p.key))];
  if (keys.length > max) throw new Error("La ruta es demasiado extensa para calcular su altitud.");
  return new Map(
    await Promise.all(
      keys.map(async (key) => {
        const [x, y] = key.split("/").map(Number);
        return [key, await load(x, y)] as const;
      }),
    ),
  );
}

/** Altitud del MDE de 5 m, o null si la ruta sale de su zona (o no se pudo leer). */
async function fineElevation(points: TrackPoint[]): Promise<(number | null)[] | null> {
  try {
    const manifest = await loadFineManifest();
    const [w, s, e, n] = manifest.bounds;
    const inside = points.filter((p) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n).length;
    if (inside / points.length < FINE_MIN_COVERAGE) return null;
    const pixels = points.map((p) => toPixel(p, manifest.zoom));
    const tiles = await loadTiles(pixels, (x, y) => loadFineTile(manifest, manifest.zoom, x, y), 400);
    const ele = pixels.map(({ px, py, key }) => {
      const data = tiles.get(key);
      return data ? decode(data, px, py) : null;
    });
    return ele.filter((v) => v !== null).length / points.length >= FINE_MIN_COVERAGE ? ele : null;
  } catch (e) {
    console.error("modelo de 5 m:", e);
    return null;
  }
}

/**
 * Altitud de cada punto leída del modelo de elevación. Solo navegador.
 * En la zona de los volcanes usa el MDE de 5 m de INEGI (`fine: true`); fuera, Terrarium (~30 m).
 * `fineOnly`: null si no hay MDE de 5 m (para no cambiar la altitud del GPS por una peor).
 */
export async function elevationFromDem(points: TrackPoint[], { fineOnly = false } = {}): Promise<{ points: TrackPoint[]; fine: boolean } | null> {
  const fine = await fineElevation(points);
  let ele: number[];
  if (fine) {
    const coarse = fine.includes(null) ? await terrariumElevation(points.filter((_, i) => fine[i] === null)) : [];
    let k = 0;
    ele = fine.map((v) => v ?? coarse[k++]);
  } else if (fineOnly) {
    return null;
  } else {
    ele = await terrariumElevation(points);
  }
  ele = median(ele);
  return { points: points.map((p, i) => ({ ...p, ele: ele[i] })), fine: !!fine };
}

/**
 * Mediana de 5 puntos (~100 m): en cañadas, unos metros de error horizontal del GPS ponen puntos en la pared
 * y el modelo los vuelve picos de decenas de metros que inflan el desnivel.
 */
function median(values: number[], radius = 2) {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - radius), i + radius + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

async function terrariumElevation(points: TrackPoint[]): Promise<number[]> {
  const pixels = points.map((p) => toPixel(p, ZOOM));
  const tiles = await loadTiles(pixels, (x, y) => loadTerrariumTile(ZOOM, x, y), 60);
  return pixels.map(({ px, py, key }) => decode(tiles.get(key)!, px, py) ?? 0);
}
