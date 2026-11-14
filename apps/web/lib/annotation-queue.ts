"use client";

import { useEffect, useState } from "react";
import type { RouteAnnotation } from "@/lib/annotations";
import { createClient } from "@/lib/supabase/client";

/**
 * Anotación capturada en el visor que todavía no sube, con un id temporal y la hora de captura en `updated_at`;
 * `error`: el servidor la rechazó y espera Reintentar o Descartar. `sent`: un intento se quedó sin respuesta y pudo haber llegado.
 */
export type QueuedAnnotation = RouteAnnotation & {
  routeId: string;
  slug: string;
  error?: string;
  sent?: boolean;
};

const KEY = "brecha:anotaciones-por-subir";
const EVENT = "brecha:anotaciones-por-subir";
// sin señal fetch no falla: se cuelga (y la sesión vencida se intenta renovar por la red)
const TIMEOUT_MS = 15000;
const DENIED = "Solo quien subió la ruta puede anotarla.";

function load(): QueuedAnnotation[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** `uploaded`: slugs con algo recién subido, para que el visor relea sus anotaciones. */
function save(items: QueuedAnnotation[], uploaded: string[] = []) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // sin almacenamiento: lo capturado se pierde al cerrar la página
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: uploaded }));
}

/** Lo pendiente de una ruta; se actualiza con cada cambio de la cola. */
export function usePendingAnnotations(slug: string, onUploaded?: () => void) {
  const [items, setItems] = useState<QueuedAnnotation[]>([]);
  useEffect(() => {
    const read = (e?: Event) => {
      setItems(load().filter((i) => i.slug === slug));
      if (e && (e as CustomEvent<string[]>).detail.includes(slug)) onUploaded?.();
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onUploaded cambia en cada render; basta el de la suscripción
  }, [slug]);
  return items;
}

/** Agrega a la cola e intenta subir. Una tracción en el km de otra en cola la reemplaza. */
export function enqueueAnnotation(item: Omit<QueuedAnnotation, "id" | "updated_at" | "error" | "sent">) {
  const same = (i: QueuedAnnotation) => item.kind === "traccion" && i.kind === "traccion" && i.routeId === item.routeId && i.km === item.km;
  save([...load().filter((i) => !same(i)), { ...item, id: `pendiente-${crypto.randomUUID()}`, updated_at: new Date().toISOString() }]);
  void flushAnnotations();
}

export function retryAnnotation(id: string) {
  save(load().map(({ error, ...i }) => (i.id === id ? i : { ...i, error })));
  void flushAnnotations();
}

export function discardAnnotation(id: string) {
  save(load().filter((i) => i.id !== id));
}

/** null: subida; "red": sin señal o sin respuesta, se reintenta; otro texto: rechazo del servidor. */
async function upload(item: QueuedAnnotation): Promise<string | null> {
  const supabase = createClient();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const { routeId, kind, traction, km, lng, lat, note } = item;
  const attempt = async () => {
    // con señal débil el alta llega y la respuesta no: antes de repetirla se busca (la tracción no duplica, la reemplaza el 23505)
    if (item.sent && kind !== "traccion") {
      const same = supabase.from("route_annotations").select("id").eq("route_id", routeId).eq("kind", kind).eq("km", km);
      const { data, status } = await (note === null ? same.is("note", null) : same.eq("note", note)).limit(1).abortSignal(signal);
      if (status === 0 || status >= 500) return "red";
      if (data?.length) return null;
    }
    let { data, error, status } = await supabase.from("route_annotations").insert({ route_id: routeId, kind, traction, km, lng, lat, note }).select("id").abortSignal(signal);
    // ya hay marca de tracción en ese km: se reemplaza
    if (error?.code === "23505") {
      ({ data, error, status } = await supabase
        .from("route_annotations")
        .update({ traction, lng, lat, note })
        .eq("route_id", routeId)
        .eq("kind", "traccion")
        .eq("km", km)
        .select("id")
        .abortSignal(signal));
    }
    if (status === 0 || status === 408 || status === 429 || status >= 500) return "red";
    if (error) return error.code === "42501" ? DENIED : `No se pudo subir: ${error.message}`;
    return data?.length ? null : DENIED;
  };
  return Promise.race([attempt(), new Promise<string>((resolve) => setTimeout(() => resolve("red"), TIMEOUT_MS + 1000))]);
}

let running: Promise<void> | null = null;

/** Sube la cola de una en una; sin señal se detiene y lo que falta espera al siguiente intento. */
export function flushAnnotations() {
  return (running ??= (async () => {
    const tried = new Set<string>();
    for (;;) {
      if (!navigator.onLine) break;
      const item = load().find((i) => !i.error && !tried.has(i.id));
      if (!item) break;
      tried.add(item.id);
      const result = await upload(item);
      if (result === "red") {
        save(load().map((i) => (i.id === item.id ? { ...i, sent: true } : i)));
        break;
      }
      // se relee: mientras subía pudo entrar otra a la cola
      save(load().flatMap((i) => (i.id !== item.id ? [i] : result === null ? [] : [{ ...i, error: result }])), result === null ? [item.slug] : []);
    }
  })().finally(() => (running = null)));
}
