// Service worker de Brecha: abre sin red las rutas descargadas (lib/offline.ts guarda lo que aquí se sirve).

const APP_CACHE = "brecha-app";
// teselas: solo las guarda la descarga de una ruta; navegar no las acumula
const MAP_CACHE = "brecha-mapas";
// estilo, TileJSON, fuentes y sprites del mapa base: se refrescan cada vez que hay red
const STYLE_CACHE = "brecha-estilo";
const ROUTES_CACHE = "brecha-rutas";
const ROUTE_KEY = "/__descargas/";
const OFFLINE_PAGE = "/descargas";
// los de lib/map-sources.ts y lib/dem.ts
const MAP_HOSTS = ["tiles.openfreemap.org", "server.arcgisonline.com", "s3.amazonaws.com"];
const STYLE_TIMEOUT_MS = 4000;
const SHELL_EVERY_MS = 10 * 60 * 1000;
const STATIC_FILES = ["/maplibre-gl-worker.mjs", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(navigate(request, url));
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || STATIC_FILES.includes(url.pathname)) event.respondWith(cacheFirst(APP_CACHE, request));
    return;
  }
  if (!MAP_HOSTS.includes(url.hostname)) return;
  if (url.hostname === "s3.amazonaws.com" && !url.pathname.startsWith("/elevation-tiles-prod/")) return;
  event.respondWith(isTile(url) ? cacheFirst(MAP_CACHE, request, tileCacheKey(request.url)) : networkFirst(STYLE_CACHE, request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "cache-shell") event.waitUntil(cacheShell(event.data.force));
});

function isTile(url) {
  return /\/\d+\/\d+\/\d+(\.\w+)?$/.test(url.pathname);
}

// igual que en lib/offline.ts
function tileCacheKey(url) {
  return url.replace(/(tiles\.openfreemap\.org\/planet)\/[^/]+(\/\d+\/\d+\/\d+\.pbf)$/, "$1$2");
}

async function cacheFirst(cacheName, request, key = request.url) {
  const cache = await caches.open(cacheName);
  return (await cache.match(key, { ignoreVary: true })) ?? fetch(request);
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), STYLE_TIMEOUT_MS);
    if (response.ok) await cache.put(request.url, response.clone());
    return response;
  } catch {
    return (await cache.match(request.url, { ignoreVary: true })) ?? Response.error();
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/** Sin red: la página de una ruta descargada abre su visor; cualquier otra, la lista de descargas. */
async function navigate(request, url) {
  try {
    return await fetch(request);
  } catch (error) {
    const page = await (await caches.open(APP_CACHE)).match(OFFLINE_PAGE);
    if (!page) throw error;
    if (url.pathname === OFFLINE_PAGE) return page;
    const slug = url.pathname.match(/^\/rutas\/([^/]+)\/?$/)?.[1];
    const saved = slug && (await (await caches.open(ROUTES_CACHE)).match(ROUTE_KEY + slug));
    return Response.redirect(saved ? `${OFFLINE_PAGE}?ruta=${slug}` : OFFLINE_PAGE, 302);
  }
}

let shellCachedAt = 0;

/** Guarda la página de descargas con sus scripts, estilos y fuentes (cambian de nombre en cada despliegue). */
async function cacheShell(force) {
  if (!force && Date.now() - shellCachedAt < SHELL_EVERY_MS) return;
  if (!(await (await caches.open(ROUTES_CACHE)).keys()).length) return;
  const page = await fetch(OFFLINE_PAGE, { cache: "no-store" });
  if (!page.ok) return;
  const assets = new Set(STATIC_FILES);
  const collect = (text) => {
    for (const [match] of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)]+/g)) assets.add(match.startsWith("/") ? match : `/_next/${match}`);
  };
  collect(await page.clone().text());
  const cache = await caches.open(APP_CACHE);
  // las fuentes las nombra el CSS (relativas: ../media/…), no el HTML
  const styles = [...assets].filter((a) => a.split("?")[0].endsWith(".css"));
  await Promise.all(
    styles.map(async (href) => {
      const css = await (await fetch(href)).text();
      for (const [, file] of css.matchAll(/url\(["']?(?:\.\.\/|\/_next\/static\/)media\/([^"')]+)/g)) assets.add(`/_next/static/media/${file}`);
    }),
  );
  const results = await Promise.allSettled(
    [...assets].map(async (href) => {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`${href}: ${response.status}`);
      await cache.put(href, response);
    }),
  );
  if (results.some((r) => r.status === "rejected")) return;
  await cache.put(OFFLINE_PAGE, page);
  for (const request of await cache.keys()) {
    const { pathname, search } = new URL(request.url);
    if (pathname !== OFFLINE_PAGE && !assets.has(pathname + search)) await cache.delete(request);
  }
  shellCachedAt = Date.now();
}
