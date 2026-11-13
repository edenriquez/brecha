// Malla de hexágonos para la zona que se descarga con una ruta. Pura y sin maplibre: la usa la descarga.
// Global y fija en Web Mercator (la misma para todas las rutas): un id `q,r` nombra siempre la misma celda.

type LineCoords = [number, number][];
export type Tile = [z: number, x: number, y: number];

const RAD = Math.PI / 180;
const EARTH_R = 6378137;
const HALF = Math.PI * EARTH_R;
// radio (centro a vértice) en metros de Mercator: ≈ 1.5 km en el suelo a la latitud de México (×cos 19°)
const SIZE = 1600;
const SQRT3 = Math.sqrt(3);
// hexágonos con punta arriba, coordenadas axiales
const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function project([lng, lat]: [number, number]): [number, number] {
  return [EARTH_R * lng * RAD, EARTH_R * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))];
}

function unproject([x, y]: [number, number]): [number, number] {
  return [x / EARTH_R / RAD, (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) / RAD];
}

function center(q: number, r: number): [number, number] {
  return [SIZE * SQRT3 * (q + r / 2), SIZE * 1.5 * r];
}

function parse(id: string) {
  const [q, r] = id.split(",").map(Number);
  return { q, r };
}

/** Celda que contiene el punto (en Mercator). */
function cellAt([x, y]: [number, number]) {
  const qf = ((SQRT3 / 3) * x - y / 3) / SIZE;
  const rf = ((2 / 3) * y) / SIZE;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  if (dq > dr && dq > Math.abs(s - sf)) q = -r - s;
  else if (dr > Math.abs(s - sf)) r = -q - s;
  return { q, r };
}

/** Escala de Mercator a metros reales en el suelo a la altura `y`. */
function groundScale(y: number) {
  return Math.cos(unproject([0, y])[1] * RAD);
}

function segmentDistance([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Celdas cuyo centro queda a no más de `radiusKm` del trazo. Con radios de 2 km o más incluyen todas las que el
 * trazo cruza (su centro está a lo más a ~1.5 km). Crece desde las celdas del trazo, así que no deja huecos y
 * un radio menor siempre queda dentro de uno mayor.
 */
export function zoneCells(line: LineCoords, radiusKm: number): string[] {
  const pts = line.map(project);
  const near = (q: number, r: number) => {
    const c = center(q, r);
    const limit = (radiusKm * 1000) / groundScale(c[1]);
    if (pts.length === 1) return Math.hypot(c[0] - pts[0][0], c[1] - pts[0][1]) <= limit;
    for (let i = 1; i < pts.length; i++) if (segmentDistance(c, pts[i - 1], pts[i]) <= limit) return true;
    return false;
  };
  const seen = new Set<string>();
  const queue: { q: number; r: number }[] = [];
  for (const p of pts) {
    const cell = cellAt(p);
    const id = `${cell.q},${cell.r}`;
    if (!seen.has(id)) {
      seen.add(id);
      queue.push(cell);
    }
  }
  const cells: string[] = [];
  while (queue.length) {
    const { q, r } = queue.pop()!;
    cells.push(`${q},${r}`);
    for (const [dq, dr] of NEIGHBORS) {
      const id = `${q + dq},${r + dr}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (near(q + dq, r + dr)) queue.push({ q: q + dq, r: r + dr });
    }
  }
  return cells.sort();
}

/** Las celdas vecinas de la zona que no son parte de ella: el anillo de contexto del mapa. */
export function ringCells(cells: string[]): string[] {
  const inside = new Set(cells);
  const ring = new Set<string>();
  for (const id of cells) {
    const { q, r } = parse(id);
    for (const [dq, dr] of NEIGHBORS) {
      const n = `${q + dq},${r + dr}`;
      if (!inside.has(n)) ring.add(n);
    }
  }
  return [...ring];
}

/** Contorno cerrado de la celda en lng/lat. */
export function cellPolygon(id: string): [number, number][] {
  const { q, r } = parse(id);
  const [cx, cy] = center(q, r);
  const ring = Array.from({ length: 6 }, (_, i) => unproject([cx + SIZE * Math.cos((30 + 60 * i) * RAD), cy + SIZE * Math.sin((30 + 60 * i) * RAD)]));
  return [...ring, ring[0]];
}

/** Área real en el suelo, en km². */
export function cellsAreaKm2(cells: string[]) {
  const hex = ((3 * SQRT3) / 2) * SIZE * SIZE;
  return cells.reduce((sum, id) => {
    const { q, r } = parse(id);
    return sum + (hex * groundScale(center(q, r)[1]) ** 2) / 1e6;
  }, 0);
}

/**
 * Teselas `z/x/y` que tocan alguna celda, recortadas a `bounds` ([w, s, e, n]) si se da.
 * ponytail: usa la caja de cada hexágono (sobran algunas en el borde de la zona); recortar al hexágono si pesa.
 */
export function zoneTiles(cells: string[], [minZoom, maxZoom]: [number, number], bounds?: [number, number, number, number]): Tile[] {
  const [bx0, by0] = bounds ? project([bounds[0], bounds[1]]) : [-HALF, -HALF];
  const [bx1, by1] = bounds ? project([bounds[2], bounds[3]]) : [HALF, HALF];
  const tiles: Tile[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const n = 2 ** z;
    const tx = (x: number) => Math.min(n - 1, Math.max(0, Math.floor(((x + HALF) / (2 * HALF)) * n)));
    const ty = (y: number) => Math.min(n - 1, Math.max(0, Math.floor(((HALF - y) / (2 * HALF)) * n)));
    const seen = new Set<number>();
    for (const id of cells) {
      const { q, r } = parse(id);
      const [cx, cy] = center(q, r);
      const x0 = Math.max(cx - (SIZE * SQRT3) / 2, bx0);
      const x1 = Math.min(cx + (SIZE * SQRT3) / 2, bx1);
      const y0 = Math.max(cy - SIZE, by0);
      const y1 = Math.min(cy + SIZE, by1);
      if (x0 > x1 || y0 > y1) continue;
      for (let x = tx(x0); x <= tx(x1); x++) {
        for (let y = ty(y1); y <= ty(y0); y++) {
          const key = x * n + y;
          if (seen.has(key)) continue;
          seen.add(key);
          tiles.push([z, x, y]);
        }
      }
    }
  }
  return tiles;
}

/** Caja [[w, s], [e, n]] de las celdas, para ajustar el mapa. */
export function cellsBounds(cells: string[]): [[number, number], [number, number]] {
  const pts = cells.flatMap(cellPolygon);
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
