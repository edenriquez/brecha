// Migrador de rutas trazadas en el planificador de AllTrails (alltrails.com/explore/custom-routes).
//
//   pbpaste | pnpm rutas nueva cascada-de-la-burbuja   guarda la respuesta del planificador en supabase/rutas/<slug>.json
//   pnpm rutas revisar [slug…]                          estadísticas y vista previa supabase/rutas/<slug>.geojson
//   pnpm rutas migrar [slug…]                           además escribe la migración en supabase/migrations
//
// Sin slugs toma todos los archivos de supabase/rutas. La polyline no trae altitud: sale del MDE de 5 m de INEGI
// (bucket capas de NEXT_PUBLIC_SUPABASE_URL) donde lo hay y de Terrarium (~30 m) donde no.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PMTiles } from "pmtiles";
import sharp from "sharp";
import { DEM_TILES } from "../lib/dem.ts";
import { analyzeTrack, haversineM, packPoints, resample, suggestDifficulty, type TrackAnalysis, type TrackPoint } from "../lib/gpx.ts";
import { ACTIVITY, DIFFICULTY, ENABLED_ACTIVITIES, ROUTE_TYPE, formatDuration, isEnabledActivity, type Activity, type Difficulty, type RouteSummary } from "../lib/routes.ts";

type RouteType = RouteSummary["route_type"];

/** Lo que devuelve el planificador: routes[alternativa][tramo].paths[].polyline (polyline de Google, precisión 5) */
type AllTrailsResponse = { routes?: { paths?: { polyline?: string }[] }[][]; errors?: number };

type RutaFile = {
  /** hiking si falta */
  activity?: Activity;
  name: string;
  place_label: string;
  description?: string | null;
  difficulty?: Difficulty;
  /** ida_vuelta: el trazo es solo la ida y se completa con el regreso por el mismo camino */
  route_type?: RouteType;
  duration_min?: number;
  tags?: string[];
  alltrails?: AllTrailsResponse;
  /** En vez de `alltrails`: una o varias polylines de precisión 5, en orden */
  polyline?: string | string[];
};

type Ruta = {
  slug: string;
  file: RutaFile;
  analysis: TrackAnalysis;
  routeType: RouteType;
  difficulty: Difficulty;
  durationMin: number;
  /** Donde termina el trazo de AllTrails: la punta en una ida y vuelta */
  turnaround: TrackPoint;
  vertices: number;
  demSource: string;
  warnings: string[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RUTAS_DIR = join(ROOT, "supabase/rutas");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Más separados que esto, el inicio y el final no cierran la ruta (mismo umbral que lib/gpx.ts) */
const OPEN_M = 200;

// ---------------------------------------------------------------------------
// Trazo
// ---------------------------------------------------------------------------

function decodePolyline(encoded: string, precision = 5): TrackPoint[] {
  const factor = 10 ** precision;
  const points: TrackPoint[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (i >= encoded.length) throw new Error("polyline incompleta");
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / factor, lng: lng / factor, ele: null });
  }
  return points;
}

function polylinesOf(file: RutaFile, warnings: string[]): string[] {
  if (file.polyline) return Array.isArray(file.polyline) ? file.polyline : [file.polyline];
  const routes = file.alltrails?.routes;
  if (!routes?.length) throw new Error("no trae `alltrails.routes` ni `polyline`");
  if (file.alltrails?.errors) warnings.push(`AllTrails reportó ${file.alltrails.errors} error(es) al trazar`);
  if (routes.length > 1) warnings.push(`AllTrails devolvió ${routes.length} alternativas; se usa la primera`);
  const polylines = routes[0].flatMap((leg) => leg.paths ?? []).flatMap((p) => (p.polyline ? [p.polyline] : []));
  if (!polylines.length) throw new Error("la respuesta de AllTrails no trae polylines");
  return polylines;
}

/** Une los tramos en orden; el primer punto de cada tramo repite el último del anterior. */
function joinLegs(legs: TrackPoint[][]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const leg of legs) {
    for (const p of leg) {
      if (!out.length || haversineM(out[out.length - 1], p) > 0.5) out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Altitud (lo mismo que lib/dem.ts, que solo corre en el navegador)
// ---------------------------------------------------------------------------

const TILE = 256;
const TERRARIUM_ZOOM = 12;
const FINE_MIN_COVERAGE = 0.9;
type FineManifest = { zoom: number; partes: { archivo: string; x0: number; x1: number }[]; bounds: [number, number, number, number] };

function toPixel(p: TrackPoint, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  const px = ((p.lng + 180) / 360) * scale;
  const py = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { px, py, x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
}

/** RGBA sin conversión de color: los bytes son la altitud (Terrarium) */
async function rgba(image: ArrayBuffer): Promise<Uint8Array> {
  const { data, info } = await sharp(Buffer.from(image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TILE || info.height !== TILE) throw new Error(`tesela de ${info.width}×${info.height}`);
  return data;
}

async function sample(points: TrackPoint[], zoom: number, load: (x: number, y: number) => Promise<Uint8Array | null>, maxTiles: number) {
  const pixels = points.map((p) => toPixel(p, zoom));
  const keys = [...new Set(pixels.map((p) => `${p.x}/${p.y}`))];
  if (keys.length > maxTiles) throw new Error("la ruta es demasiado extensa para calcular su altitud");
  const tiles = new Map(await Promise.all(keys.map(async (key) => [key, await load(...(key.split("/").map(Number) as [number, number]))] as const)));
  return pixels.map(({ px, py, x, y }) => {
    const data = tiles.get(`${x}/${y}`);
    if (!data) return null;
    const o = ((Math.floor(py) % TILE) * TILE + (Math.floor(px) % TILE)) * 4;
    return data[o + 3] === 0 ? null : data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
  });
}

let fineManifest: Promise<{ base: string; manifest: FineManifest } | null> | null = null;
const fineArchives = new Map<string, PMTiles>();

function loadFineManifest() {
  fineManifest ??= (async () => {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabase) return null;
    const base = `${supabase}/storage/v1/object/public/capas/lidar-izta`;
    const res = await fetch(`${base}/elevacion.json`).catch(() => null);
    return res?.ok ? { base, manifest: (await res.json()) as FineManifest } : null;
  })();
  return fineManifest;
}

async function fineElevation(points: TrackPoint[]): Promise<(number | null)[] | null> {
  const fine = await loadFineManifest();
  if (!fine) return null;
  const { base, manifest } = fine;
  const [w, s, e, n] = manifest.bounds;
  const inside = points.filter((p) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n).length;
  if (inside / points.length < FINE_MIN_COVERAGE) return null;
  const ele = await sample(
    points,
    manifest.zoom,
    async (x, y) => {
      const part = manifest.partes.find((p) => x >= p.x0 && x <= p.x1);
      if (!part) return null;
      let archive = fineArchives.get(part.archivo);
      if (!archive) fineArchives.set(part.archivo, (archive = new PMTiles(`${base}/${part.archivo}`)));
      const tile = await archive.getZxy(manifest.zoom, x, y);
      return tile ? rgba(tile.data) : null;
    },
    400,
  );
  return ele.filter((v) => v !== null).length / points.length >= FINE_MIN_COVERAGE ? ele : null;
}

function terrariumElevation(points: TrackPoint[]) {
  return sample(
    points,
    TERRARIUM_ZOOM,
    async (x, y) => {
      const url = DEM_TILES.replace("{z}", String(TERRARIUM_ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Terrarium ${res.status} en ${url}`);
      return rgba(await res.arrayBuffer());
    },
    60,
  );
}

/** Mediana de 5 puntos (~100 m), como lib/dem.ts: quita los picos de cañada que inflan el desnivel. */
function median(values: number[], radius = 2) {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - radius), i + radius + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

async function withElevation(points: TrackPoint[]): Promise<{ points: TrackPoint[]; source: string }> {
  const fine = await fineElevation(points).catch((e) => {
    console.warn(`  MDE de 5 m no disponible (${e instanceof Error ? e.message : e}); se usa Terrarium`);
    return null;
  });
  let ele: number[];
  let source: string;
  if (fine) {
    const gaps = points.filter((_, i) => fine[i] === null);
    const coarse = gaps.length ? await terrariumElevation(gaps) : [];
    let k = 0;
    ele = fine.map((v) => v ?? coarse[k++] ?? 0);
    source = gaps.length ? `MDE de 5 m de INEGI (${gaps.length} puntos de Terrarium)` : "MDE de 5 m de INEGI";
  } else {
    ele = (await terrariumElevation(points)).map((v) => v ?? 0);
    source = "Terrarium (~30 m)";
  }
  ele = median(ele);
  return { points: points.map((p, i) => ({ ...p, ele: ele[i] })), source };
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

function fileFor(arg: string) {
  if (arg.endsWith(".json")) return resolve(process.env.INIT_CWD ?? process.cwd(), arg);
  return join(RUTAS_DIR, `${arg}.json`);
}

function listFiles(args: string[]) {
  if (args.length) return args.map(fileFor);
  if (!existsSync(RUTAS_DIR)) return [];
  return readdirSync(RUTAS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(RUTAS_DIR, f));
}

function validate(slug: string, file: RutaFile): string[] {
  const errors: string[] = [];
  if (!SLUG.test(slug) || slug === "nueva") errors.push(`el nombre del archivo (${slug}) no sirve como slug: usa minúsculas, números y guiones`);
  if (file.activity !== undefined && !isEnabledActivity(file.activity)) errors.push(`\`activity\` debe ser ${ENABLED_ACTIVITIES.join(", ")}`);
  // la dificultad y la duración que se sugieren son a pie
  if (file.activity === "offroad" && (!file.difficulty || file.duration_min === undefined)) errors.push("una ruta offroad necesita `difficulty` y `duration_min` (manejando)");
  if (!file.name || file.name.length < 3 || file.name.length > 80) errors.push("`name` debe tener entre 3 y 80 caracteres");
  if (!file.place_label || file.place_label.length < 3 || file.place_label.length > 80) errors.push("`place_label` debe tener entre 3 y 80 caracteres (\"Amecameca, Edomex\")");
  if ((file.description ?? "").length > 3000) errors.push("`description` no puede pasar de 3,000 caracteres");
  if (file.difficulty && !(file.difficulty in DIFFICULTY)) errors.push(`\`difficulty\` debe ser ${Object.keys(DIFFICULTY).join(", ")}`);
  if (file.route_type && !(file.route_type in ROUTE_TYPE)) errors.push(`\`route_type\` debe ser ${Object.keys(ROUTE_TYPE).join(", ")}`);
  if (file.duration_min !== undefined && (!Number.isInteger(file.duration_min) || file.duration_min < 15 || file.duration_min > 48 * 60))
    errors.push("`duration_min` debe ser un entero de 15 a 2,880");
  const tags = file.tags ?? [];
  if (tags.length > 8 || tags.some((t) => typeof t !== "string" || !t || t.length > 24)) errors.push("`tags`: hasta 8 etiquetas de máximo 24 caracteres");
  return errors;
}

async function load(path: string): Promise<Ruta> {
  const slug = basename(path, ".json");
  const file = JSON.parse(readFileSync(path, "utf8")) as RutaFile;
  const errors = validate(slug, file);
  if (errors.length) throw new Error(errors.join("\n    "));

  const warnings: string[] = [];
  const legs = polylinesOf(file, warnings).map((p) => decodePolyline(p));
  const outbound = joinLegs(legs);
  if (outbound.length < 2) throw new Error("el trazo tiene menos de dos puntos");
  const turnaround = outbound[outbound.length - 1];
  const open = haversineM(outbound[0], turnaround) > OPEN_M;

  let track = outbound;
  if (file.route_type === "ida_vuelta" && open) track = [...outbound, ...outbound.slice(0, -1).reverse()];
  if (file.route_type === "circular" && open) warnings.push(`es circular pero termina a ${Math.round(haversineM(outbound[0], turnaround))} m del inicio: traza el regreso en AllTrails`);
  if (!file.route_type && open) warnings.push("sin `route_type` y el trazo no regresa al inicio: queda como solo ida (usa \"ida_vuelta\" si se regresa por el mismo camino)");

  const { points, source } = await withElevation(resample(track));
  const analysis = analyzeTrack(points, { resampled: true });
  const suggested = suggestDifficulty(analysis.distanceKm, analysis.gainM ?? 0, analysis.maxEle);
  return {
    slug,
    file,
    analysis,
    routeType: file.route_type ?? analysis.routeType,
    difficulty: file.difficulty ?? suggested,
    durationMin: file.duration_min ?? analysis.durationMin,
    turnaround,
    vertices: outbound.length,
    demSource: source,
    warnings,
  };
}

function preview(r: Ruta): string {
  const line = packPoints(r.analysis.points).map(([lng, lat]) => [lng, lat]);
  const start = r.analysis.points[0];
  const point = (p: TrackPoint, title: string, color: string) => ({
    type: "Feature",
    properties: { title, "marker-color": color },
    geometry: { type: "Point", coordinates: [round(p.lng, 5), round(p.lat, 5)] },
  });
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { title: r.file.name, stroke: "#e4572e", "stroke-width": 3, distance_km: round(r.analysis.distanceKm, 1), elevation_gain_m: r.analysis.gainM },
        geometry: { type: "LineString", coordinates: line },
      },
      point(start, "Inicio", "#2e7d32"),
      point(r.turnaround, r.routeType === "ida_vuelta" ? "Punta" : "Fin", "#c62828"),
    ],
  };
  const path = join(RUTAS_DIR, `${r.slug}.geojson`);
  writeFileSync(path, `${JSON.stringify(geojson)}\n`);
  return path;
}

function report(r: Ruta, previewPath: string) {
  const a = r.analysis;
  const coords = (p: TrackPoint) => `${round(p.lat, 5)}, ${round(p.lng, 5)}  https://www.google.com/maps?q=${round(p.lat, 5)},${round(p.lng, 5)}`;
  const given = (value: unknown, label: string) => (value === undefined ? ` (${label})` : "");
  console.log(`\n${r.slug} · ${r.file.name} · ${r.file.place_label} · ${ACTIVITY[r.file.activity ?? "hiking"].label}`);
  console.log(`  trazo       ${r.vertices} vértices de AllTrails → ${a.points.length} puntos cada 20 m`);
  console.log(`  distancia   ${round(a.distanceKm, 1)} km, ${ROUTE_TYPE[r.routeType].toLowerCase()}${given(r.file.route_type, "detectado")}`);
  console.log(`  desnivel    +${a.gainM} m / −${a.lossM} m, de ${a.minEle} a ${a.maxEle} m · ${r.demSource}`);
  console.log(`  dificultad  ${DIFFICULTY[r.difficulty].label}${given(r.file.difficulty, "sugerida")} · ${formatDuration(r.durationMin)}${given(r.file.duration_min, "estimada")}`);
  console.log(`  inicio      ${coords(a.points[0])}`);
  console.log(`  ${r.routeType === "ida_vuelta" ? "punta " : "fin   "}      ${coords(r.turnaround)}`);
  console.log(`  vista       ${relative(ROOT, previewPath)} (ábrelo en geojson.io o en GitHub)`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
}

// ---------------------------------------------------------------------------
// Migración
// ---------------------------------------------------------------------------

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

function insertSql(r: Ruta) {
  const points = packPoints(r.analysis.points);
  const rows: string[] = [];
  for (let i = 0; i < points.length; i += 8) rows.push(points.slice(i, i + 8).map(([lng, lat]) => `${lng} ${lat}`).join(","));
  const [lng, lat] = points[0];
  const tags = r.file.tags ?? [];
  return `-- ${r.file.name} (supabase/rutas/${r.slug}.json)
insert into public.routes
  (slug, activity, name, place_label, description, difficulty, route_type, distance_km, elevation_gain_m, duration_min,
   start_point, track, elevation_profile, tags, status)
values
  (${quote(r.slug)}, ${quote(r.file.activity ?? "hiking")}, ${quote(r.file.name)}, ${quote(r.file.place_label)},
   ${r.file.description ? quote(r.file.description) : "null"},
   ${quote(r.difficulty)}, ${quote(r.routeType)}, ${round(r.analysis.distanceKm, 1)}, ${r.analysis.gainM ?? 0}, ${r.durationMin},
   'SRID=4326;POINT(${lng} ${lat})'::extensions.geography,
   'SRID=4326;LINESTRING(
${rows.join(",\n")}
)'::extensions.geography,
   ${quote(JSON.stringify(r.analysis.profile))}::jsonb,
   array[${tags.map(quote).join(", ")}]::text[], 'publicada')
on conflict (slug) do update set
  distance_km = excluded.distance_km,
  elevation_gain_m = excluded.elevation_gain_m,
  start_point = excluded.start_point,
  track = excluded.track,
  elevation_profile = excluded.elevation_profile;
`;
}

/** Después de la última migración aunque esta lleve fecha adelantada */
function migrationVersion() {
  const now = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const latest = readdirSync(MIGRATIONS_DIR).map((f) => f.slice(0, 14)).filter((v) => /^\d{14}$/.test(v)).sort().pop();
  return latest && latest >= now ? String(Number(latest) + 1) : now;
}

function writeMigration(rutas: Ruta[]) {
  const name = rutas.length === 1 ? rutas[0].slug.replace(/-/g, "_") : "alltrails";
  const path = join(MIGRATIONS_DIR, `${migrationVersion()}_rutas_${name}.sql`);
  const header = `-- Rutas trazadas en el planificador de AllTrails; la altitud sale del modelo de elevación.
-- Generada con \`pnpm rutas migrar\` desde supabase/rutas. Si la ruta ya existe solo cambia su trazo:
-- para corregirlo, edita el JSON y genera otra migración.
`;
  writeFileSync(path, [header, ...rutas.map(insertSql)].join("\n"));
  return path;
}

// ---------------------------------------------------------------------------
// nueva: guarda la respuesta del planificador con los campos por llenar
// ---------------------------------------------------------------------------

const STATES: Record<string, string> = {
  "MX-MEX": "Edomex",
  "MX-PUE": "Pue.",
  "MX-MOR": "Mor.",
  "MX-CMX": "CDMX",
  "MX-TLA": "Tlax.",
  "MX-HID": "Hgo.",
  "MX-VER": "Ver.",
  "MX-QUE": "Qro.",
};

/** "Amecameca, Edomex" con Nominatim (OpenStreetMap); vacío si no responde. */
async function placeLabel(p: TrackPoint) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=es&lat=${p.lat}&lon=${p.lng}`;
    const res = await fetch(url, { headers: { "User-Agent": "brecha-migrador-rutas/1.0" } });
    const { address } = (await res.json()) as { address?: Record<string, string> };
    if (!address) return "";
    const town = address.county ?? address.city ?? address.town ?? address.municipality ?? "";
    const state = STATES[address["ISO3166-2-lvl4"]] ?? address.state ?? "";
    return [town, state].filter(Boolean).join(", ");
  } catch {
    return "";
  }
}

async function nueva(slug: string | undefined) {
  if (!slug || !SLUG.test(slug)) throw new Error("uso: pbpaste | pnpm rutas nueva <slug>   (slug en minúsculas con guiones)");
  const path = join(RUTAS_DIR, `${slug}.json`);
  if (existsSync(path)) throw new Error(`${relative(ROOT, path)} ya existe`);
  if (process.stdin.isTTY) throw new Error("pega la respuesta del planificador por la entrada estándar: pbpaste | pnpm rutas nueva " + slug);
  const alltrails = JSON.parse(readFileSync(0, "utf8")) as AllTrailsResponse;
  const start = decodePolyline(polylinesOf({ alltrails } as RutaFile, [])[0])[0];
  const name = slug
    .split("-")
    .map((w, i) => (i && ["de", "del", "la", "las", "el", "los", "y"].includes(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
  const file: RutaFile = {
    activity: "hiking",
    name,
    place_label: await placeLabel(start),
    description: "",
    route_type: "ida_vuelta",
    tags: [],
    alltrails,
  };
  mkdirSync(RUTAS_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${relative(ROOT, path)}: revisa actividad, nombre, zona, descripción, tipo y etiquetas (dificultad y duración son opcionales en hiking)`);
  return path;
}

// ---------------------------------------------------------------------------

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "nueva") {
    const path = await nueva(args[0]);
    const ruta = await load(path);
    report(ruta, preview(ruta));
    return;
  }
  if (command !== "revisar" && command !== "migrar") {
    console.log("uso: pnpm rutas nueva <slug> | revisar [slug…] | migrar [slug…]");
    process.exitCode = 1;
    return;
  }

  const files = listFiles(args);
  if (!files.length) throw new Error(`no hay rutas en ${relative(ROOT, RUTAS_DIR)}`);
  const rutas: Ruta[] = [];
  let failed = 0;
  for (const path of files) {
    try {
      const ruta = await load(path);
      report(ruta, preview(ruta));
      rutas.push(ruta);
    } catch (e) {
      failed++;
      console.error(`\n✗ ${relative(ROOT, path)}\n    ${e instanceof Error ? e.message : e}`);
    }
  }
  if (command === "migrar") {
    if (failed) throw new Error(`${failed} ruta(s) con errores: no se escribió la migración`);
    const path = writeMigration(rutas);
    console.log(`\n${relative(ROOT, path)}: ${rutas.length} ruta(s). Aplícala en local con \`supabase migration up\`.`);
  } else if (failed) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
