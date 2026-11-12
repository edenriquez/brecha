"use client";

import { useEffect } from "react";

/** Registra public/sw.js. En desarrollo no: serviría scripts viejos mientras se edita. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      // tras un despliegue los scripts cambian de nombre: se vuelve a guardar la página de descargas
      .then((registration) => registration.active?.postMessage({ type: "cache-shell" }))
      .catch((e) => console.error("service worker:", e));
  }, []);
  return null;
}
