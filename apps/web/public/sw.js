// Service worker de Brecha: abre sin red las rutas descargadas (lib/offline.ts guarda lo que aquí se sirve).

const APP_CACHE = "brecha-app";
// teselas: solo las guarda la descarga de una ruta; navegar no las acumula
const MAP_CACHE = "brecha-mapas";
// estilo, TileJSON, fuentes y sprites del mapa base: se refrescan cada vez que hay red
const STYLE_CACHE = "brecha-estilo";
const ROUTES_CACHE = "brecha-rutas";
// scripts y estilos de /_next/static/ que bajan al navegar; aparte para que la poda del shell no los borre
const STATIC_CACHE = "brecha-estaticos";
const STATIC_MAX = 200;
const ROUTE_KEY = "/__descargas/";
const OFFLINE_PAGE = "/descargas";
// los de lib/map-sources.ts y lib/dem.ts
const MAP_HOSTS = ["tiles.openfreemap.org", "server.arcgisonline.com", "s3.amazonaws.com"];
const STYLE_TIMEOUT_MS = 4000;
// sin señal, fetch no falla: se cuelga
const NAV_TIMEOUT_MS = 4000;
const NAV_TIMEOUT_AFTER_FAIL_MS = 1500;
const TILE_TIMEOUT_MS = 8000;
const SHELL_EVERY_MS = 10 * 60 * 1000;
const STATIC_FILES = ["/maplibre-gl-worker.mjs", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(cacheShell(true).catch(() => {}));
});
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
    if (url.pathname.startsWith("/_next/static/")) event.respondWith(staticAsset(request));
    else if (STATIC_FILES.includes(url.pathname)) event.respondWith(cacheFirst(APP_CACHE, request));
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

/** Lee del shell y de lo ya visto; lo nuevo se guarda conservando las STATIC_MAX entradas más recientes. */
async function staticAsset(request) {
  // caches.match busca en todos: brecha-app (shell) y brecha-estaticos
  const cached = await caches.match(request.url, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetchWithTimeout(request, TILE_TIMEOUT_MS);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache
      .put(request.url, response.clone())
      .then(() => cache.keys())
      .then((keys) => Promise.all(keys.slice(0, -STATIC_MAX).map((k) => cache.delete(k))));
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
async function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let navTimedOutAt = 0;

/** Sin red: la página de una ruta descargada abre su visor; cualquier otra, la lista de descargas. */
async function navigate(request, url) {
  const app = await caches.open(APP_CACHE);
  if (url.pathname === OFFLINE_PAGE) {
    const page = await app.match(OFFLINE_PAGE);
    if (page) return page;
  }
  try {
    return await fetchWithTimeout(request, Date.now() - navTimedOutAt < 30000 ? NAV_TIMEOUT_AFTER_FAIL_MS : NAV_TIMEOUT_MS);
  } catch (error) {
    if (error.name === "AbortError") navTimedOutAt = Date.now();
    if (!(await app.match(OFFLINE_PAGE))) return offlineHtml(url);
    const slug = url.pathname.match(/^\/rutas\/([^/]+)\/?$/)?.[1];
    const saved = slug && (await (await caches.open(ROUTES_CACHE)).match(ROUTE_KEY + slug));
    return Response.redirect(saved ? `${OFFLINE_PAGE}?ruta=${slug}` : `${OFFLINE_PAGE}?desde=${encodeURIComponent(url.pathname + url.search)}`, 302);
  }
}

// URL serializa comillas y <>: segura dentro del href
function offlineHtml(url) {
  const html = `<!doctype html><html lang="es-MX"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem"><h1>Sin conexión</h1><p><a href="${url.pathname}${url.search}">Reintentar</a></p></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

let shellCachedAt = 0;

/** Guarda la página de descargas con sus scripts, estilos y fuentes (cambian de nombre en cada despliegue). */
async function cacheShell(force) {
  if (!force && Date.now() - shellCachedAt < SHELL_EVERY_MS) return;
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
