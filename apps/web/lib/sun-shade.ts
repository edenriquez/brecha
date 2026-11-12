"use client";

import { demTile } from "@/lib/dem";
import { overlayAnchor } from "@/lib/lidar-layer";
import { maplibregl } from "@/lib/maplibre";
import type { ShadeRequest, ShadeResponse } from "@/lib/shade-worker";
import { sunPosition } from "@/lib/sun";

const TILE = 256;
const EARTH = 40_075_016.686;
// con el sol bajo, la sombra de una sierra se estira varios km: se calcula con margen fuera de la vista
const MARGIN_M = 8000;
const MAX_TILES = 90;
const MIN_ZOOM = 9;
const CACHE = 240;
const SOURCE = "sun-shade";

export type ShadeStatus = "calculando" | "listo" | "lejos" | "error";

/** Sombras del relieve para una fecha y hora, calculadas para lo que se ve del mapa (en un worker). */
export class SunShade {
  private worker = new Worker(new URL("./shade-worker.ts", import.meta.url), { type: "module" });
  private seq = 0;
  private date = new Date();
  private visible = false;
  private tiles = new Map<string, Promise<Float32Array>>();
  private url: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  // cada cálculo tarda ~1 s: al arrastrar la hora solo se calcula donde se suelta
  private readonly schedule = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.render(), 150);
  };

  constructor(
    private map: maplibregl.Map,
    private onStatus: (status: ShadeStatus) => void,
  ) {
    map.on("moveend", this.schedule);
  }

  setDate(date: Date) {
    this.date = date;
    this.schedule();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (this.map.getLayer(SOURCE)) this.map.setLayoutProperty(SOURCE, "visibility", visible ? "visible" : "none");
    this.schedule();
  }

  destroy() {
    this.map.off("moveend", this.schedule);
    clearTimeout(this.timer);
    this.worker.terminate();
    if (this.url) URL.revokeObjectURL(this.url);
  }

  private tile(z: number, x: number, y: number) {
    const key = `${z}/${x}/${y}`;
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = demTile(z, x, y);
      tile.catch(() => this.tiles.delete(key));
      this.tiles.set(key, tile);
      if (this.tiles.size > CACHE) this.tiles.delete(this.tiles.keys().next().value!);
    }
    return tile;
  }

  private async render() {
    if (!this.visible) return;
    const id = ++this.seq;
    const map = this.map;
    if (map.getZoom() < MIN_ZOOM) {
      if (map.getLayer(SOURCE)) map.setLayoutProperty(SOURCE, "visibility", "none");
      return this.onStatus("lejos");
    }
    this.onStatus("calculando");
    try {
      const bounds = map.getBounds();
      const lat = bounds.getCenter().lat;
      const sun = sunPosition(this.date, lat, bounds.getCenter().lng);
      let z = Math.min(13, Math.max(10, Math.floor(map.getZoom())));
      let range = tileRange(bounds, z, lat);
      while (range.count > MAX_TILES && z > 10) range = tileRange(bounds, --z, lat);

      const { x0, y0, nx, ny, margin } = range;
      const w = nx * TILE;
      const h = ny * TILE;
      const dem = new Float32Array(w * h);
      await Promise.all(
        Array.from({ length: nx * ny }, async (_, k) => {
          const tx = k % nx;
          const ty = Math.floor(k / nx);
          const data = await this.tile(z, x0 + tx, y0 + ty);
          for (let row = 0; row < TILE; row++) dem.set(data.subarray(row * TILE, (row + 1) * TILE), (ty * TILE + row) * w + tx * TILE);
        }),
      );
      if (id !== this.seq) return;

      const cell = (EARTH * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** z);
      const rgba = await new Promise<Uint8ClampedArray>((resolve) => {
        const listener = (e: MessageEvent<ShadeResponse>) => {
          if (e.data.id !== id) return;
          this.worker.removeEventListener("message", listener);
          resolve(e.data.rgba);
        };
        this.worker.addEventListener("message", listener);
        this.worker.postMessage({ id, width: w, height: h, dem, cell, azimuth: sun.azimuth, altitude: sun.altitude } satisfies ShadeRequest, [dem.buffer]);
      });
      if (id !== this.seq) return;

      // el margen solo sirve para que las sombras lleguen desde fuera: no se muestra (su orilla queda mal)
      const inner = { x: margin * TILE, y: margin * TILE, w: (nx - 2 * margin) * TILE, h: (ny - 2 * margin) * TILE };
      const canvas = document.createElement("canvas");
      canvas.width = inner.w;
      canvas.height = inner.h;
      canvas.getContext("2d")!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), -inner.x, -inner.y);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob || id !== this.seq) return;
      const [west, north] = tileCorner(z, x0 + margin, y0 + margin);
      const [east, south] = tileCorner(z, x0 + nx - margin, y0 + ny - margin);
      this.show(URL.createObjectURL(blob), [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ]);
      this.onStatus("listo");
    } catch (e) {
      console.error("sombras:", e);
      if (id === this.seq) this.onStatus("error");
    }
  }

  private show(url: string, coordinates: maplibregl.Coordinates) {
    const map = this.map;
    const source = map.getSource<maplibregl.ImageSource>(SOURCE);
    if (source) {
      source.updateImage({ url, coordinates });
    } else {
      map.addSource(SOURCE, { type: "image", url, coordinates });
      map.addLayer({ id: SOURCE, type: "raster", source: SOURCE, paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } }, overlayAnchor(map, "raster"));
    }
    map.setLayoutProperty(SOURCE, "visibility", this.visible ? "visible" : "none");
    const old = this.url;
    this.url = url;
    if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
  }
}

function tileRange(bounds: maplibregl.LngLatBounds, z: number, lat: number) {
  const n = 2 ** z;
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (la: number) => {
    const s = Math.sin((la * Math.PI) / 180);
    return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  };
  const margin = Math.max(1, Math.ceil(MARGIN_M / ((EARTH * Math.cos((lat * Math.PI) / 180)) / n)));
  const x0 = tx(bounds.getWest()) - margin;
  const x1 = tx(bounds.getEast()) + margin;
  const y0 = ty(bounds.getNorth()) - margin;
  const y1 = ty(bounds.getSouth()) + margin;
  const nx = x1 - x0 + 1;
  const ny = y1 - y0 + 1;
  return { x0, y0, nx, ny, margin, count: nx * ny };
}

function tileCorner(z: number, x: number, y: number): [number, number] {
  const n = 2 ** z;
  return [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
}
