// Turbopack no empaqueta bien el worker inline de MapLibre: se sirve desde /public (ver lib/maplibre.ts).
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
const candidates = ["dist/maplibre-gl-worker.mjs", "dist/maplibre-gl-csp-worker.js"];
const src = candidates.map((p) => join(dist, p)).find(existsSync);
if (!src) {
  console.warn("maplibre-gl: no se encontró el worker en", candidates.join(", "));
  process.exit(0);
}
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre-gl-worker.mjs");
copyFileSync(src, dest);
