// Service worker de Brecha: abre sin red las rutas descargadas (lib/offline.ts guarda lo que aquí se sirve).

const APP_CACHE = "brecha-app";
// teselas: solo las guarda la descarga de una ruta; navegar no las acumula
const MAP_CACHE = "brecha-mapas";
// estilo, TileJSON, fuentes y sprites del mapa base: se refrescan cada vez que hay red
const STYLE_CACHE = "brecha-estilo";
const ROUTES_CACHE = "brecha-rutas";
// capas regionales del bucket `capas` de Supabase, completas: las sirve aunque se pidan por rangos (PMTiles)
const LAYERS_CACHE = "brecha-capas";
const LAYERS_PATH = "/storage/v1/object/public/capas/";
// teselas del relieve LiDAR que guardó la descarga, una llave por parte del relieve (no existen en el bucket)
const LIDAR_TILE = /\/relieve-\d+\/\d+\/\d+\/\d+$/;
// scripts y estilos de /_next/static/ que bajan al navegar; aparte para que la poda del shell no los borre
const STATIC_CACHE = "brecha-estaticos";
const STATIC_MAX = 60;
const ROUTE_KEY = "/__descargas/";
const OFFLINE_PAGE = "/descargas";
// los de lib/map-sources.ts y lib/dem.ts; el bucket de capas se reconoce por LAYERS_PATH, sin importar el host
const MAP_HOSTS = ["tiles.openfreemap.org", "server.arcgisonline.com", "s3.amazonaws.com"];
const STYLE_TIMEOUT_MS = 4000;
// sin señal, fetch no falla: se cuelga
const NAV_TIMEOUT_MS = 8000;
const TILE_TIMEOUT_MS = 8000;
const SHELL_TIMEOUT_MS = 15000;
const SHELL_EVERY_MS = 10 * 60 * 1000;
const STATIC_FILES = ["/maplibre-gl-worker.mjs", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
  // sin waitUntil: mientras activa, las peticiones esperan y una red colgada las retendría
  cacheShell(true).catch(() => {});
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    // /auth/callback consume un code de un solo uso; los .ics los baja el calendario
    if (url.pathname.startsWith("/auth/") || url.pathname.endsWith(".ics")) return;
    event.respondWith(navigate(request, url));
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/")) event.respondWith(staticAsset(event));
    else if (STATIC_FILES.includes(url.pathname)) event.respondWith(cacheFirst(APP_CACHE, request));
    return;
  }
  if (url.pathname.startsWith(LAYERS_PATH)) {
    event.respondWith(LIDAR_TILE.test(url.pathname) ? lidarTile(request) : layerFile(request));
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
  return (await cache.match(key, { ignoreVary: true })) ?? fetchWithTimeout(request, TILE_TIMEOUT_MS);
}

/** Del cache si la descarga de una ruta lo guardó (con su rango, si lo pide); si no, de la red tal cual. */
async function layerFile(request) {
  const cached = await (await caches.open(LAYERS_CACHE)).match(request.url, { ignoreVary: true });
  return cached ? byteRange(cached, request.headers.get("Range")) : fetch(request);
}

/** Solo del cache de mapas: fuera de lo descargado no hay tesela. */
async function lidarTile(request) {
  return (await (await caches.open(MAP_CACHE)).match(request.url, { ignoreVary: true })) ?? new Response(null, { status: 404 });
}

/** 206 con el trozo pedido de `response` (`bytes=a-b`, `bytes=a-` o `bytes=-n`); sin Range, la respuesta entera. */
async function byteRange(response, range) {
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  const body = await response.blob();
  const size = body.size;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}

/** Lee del shell y de lo ya visto; lo nuevo se guarda conservando las STATIC_MAX entradas más recientes. */
async function staticAsset(event) {
  const { request } = event;
  // caches.match busca en todos: brecha-app (shell) y brecha-estaticos
  const cached = await caches.match(request.url, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetchWithTimeout(request, TILE_TIMEOUT_MS);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    event.waitUntil(
      cache
        .put(request.url, response.clone())
        .then(() => cache.keys())
        .then((keys) => Promise.all(keys.slice(0, -STATIC_MAX).map((k) => cache.delete(k))))
        .catch(() => {}),
    );
  }
  return response;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, STYLE_TIMEOUT_MS);
    if (response.ok) await cache.put(request.url, response.clone());
    return response;
  } catch {
    return (await cache.match(request.url, { ignoreVary: true })) ?? Response.error();
  }
}

/** Aborta si no llegan los encabezados en `ms`; el cuerpo puede seguir llegando. */
async function fetchWithTimeout(request, ms, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Sin red: la página de una ruta descargada abre su visor; cualquier otra, la lista de descargas. */
async function navigate(request, url) {
  const app = await caches.open(APP_CACHE);
  if (url.pathname === OFFLINE_PAGE) {
    const page = await app.match(OFFLINE_PAGE);
    if (page) return page;
  }
  try {
    return await fetchWithTimeout(request, NAV_TIMEOUT_MS);
  } catch {
    if (!(await app.match(OFFLINE_PAGE))) return offlineHtml();
    const slug = url.pathname.match(/^\/rutas\/([^/]+)\/?$/)?.[1];
    // solo las completas abren el visor; una a medias cae en ?desde= como cualquier página
    const saved = slug && (await (await caches.open(ROUTES_CACHE)).match(ROUTE_KEY + slug).then((r) => r?.json().then((route) => route.complete !== false)));
    return Response.redirect(saved ? `${OFFLINE_PAGE}?ruta=${slug}` : `${OFFLINE_PAGE}?desde=${encodeURIComponent(url.pathname + url.search)}`, 302);
  }
}

function offlineHtml() {
  const html = `<!doctype html><html lang="es-MX"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem"><h1>Sin conexión</h1><p><button onclick="location.reload()">Reintentar</button></p></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

let shellCachedAt = 0;

/** Guarda la página de descargas con sus scripts, estilos y fuentes (cambian de nombre en cada despliegue). */
async function cacheShell(force) {
  if (!force && Date.now() - shellCachedAt < SHELL_EVERY_MS) return;
  const page = await fetchWithTimeout(OFFLINE_PAGE, SHELL_TIMEOUT_MS, { cache: "no-store" });
  if (!page.ok) return;
  const html = await page.clone().text();
  const cache = await caches.open(APP_CACHE);
  // mismo HTML que el guardado: los assets ya están (iOS mata al worker y shellCachedAt se pierde)
  if (!force && html === (await (await cache.match(OFFLINE_PAGE))?.text())) {
    shellCachedAt = Date.now();
    return;
  }
  const assets = new Set(STATIC_FILES);
  const collect = (text) => {
    for (const [match] of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)]+/g)) assets.add(match.startsWith("/") ? match : `/_next/${match}`);
  };
  collect(html);
  // las fuentes las nombra el CSS (relativas: ../media/…), no el HTML
  const styles = [...assets].filter((a) => a.split("?")[0].endsWith(".css"));
  await Promise.all(
    styles.map(async (href) => {
      const css = await (await fetchWithTimeout(href, SHELL_TIMEOUT_MS)).text();
      for (const [, file] of css.matchAll(/url\(["']?(?:\.\.\/|\/_next\/static\/)media\/([^"')]+)/g)) assets.add(`/_next/static/media/${file}`);
    }),
  );
  const results = await Promise.allSettled(
    [...assets].map(async (href) => {
      const response = await fetchWithTimeout(href, SHELL_TIMEOUT_MS);
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
