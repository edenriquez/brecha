"use client";

import { useEffect, useMemo, useState } from "react";
import type { RouteAnnotation } from "@/lib/annotations";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Anotación capturada en el visor que todavía no sube, con un id temporal y la hora de captura en `updated_at`;
 * `error`: el servidor la rechazó y espera Reintentar o Descartar. `sent`: ya hubo un intento y pudo haber llegado (se marca antes de intentar:
 * la app puede cerrarse a media subida).
 * `done`: ya subió y `id` es el de su fila; se queda en la cola, para seguir en el mapa, hasta que una relectura la traiga.
 */
export type QueuedAnnotation = RouteAnnotation & {
  routeId: string;
  slug: string;
  error?: string;
  sent?: boolean;
  done?: boolean;
};

/** Respuesta a "¿Sigue ahí?" que todavía no sube; sale de la cola al subir o si el servidor la rechaza (nunca lleva `error` ni `done`). */
export type QueuedResponse = { id: string; slug: string; annotationId: string; stillThere: boolean; sent?: boolean; error?: string; done?: boolean };
type Queued = QueuedAnnotation | QueuedResponse;
const isResponse = (i: Queued) => "annotationId" in i;

const KEY = "brecha:anotaciones-por-subir";
const EVENT = "brecha:anotaciones-por-subir";
// sin señal fetch no falla: se cuelga (y la sesión vencida se intenta renovar por la red)
const TIMEOUT_MS = 15000;
const DENIED = "Solo quien subió la ruta puede anotarla.";
const SIGNED_OUT = "Inicia sesión para subir este reporte.";
const GONE = "La ruta ya no existe.";

// si el navegador no deja escribir, la cola vive aquí mientras la página siga abierta
let memory: Queued[] | null = null;

function load(): Queued[] {
  if (memory) return memory;
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** `uploaded`: slugs con algo recién subido, para que el visor relea sus anotaciones. */
function save(items: Queued[], uploaded: string[] = []) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    memory = null;
  } catch {
    // sin almacenamiento: lo capturado se pierde al cerrar la página
    memory = items;
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: uploaded }));
}

/**
 * Lo capturado de una ruta que aún no viene en su relectura (pendiente o recién subido), y cuánto falta subir contando
 * las respuestas; se actualiza con cada cambio de la cola.
 */
export function usePendingAnnotations(slug: string, onUploaded?: () => void): [QueuedAnnotation[], number] {
  const [items, setItems] = useState<Queued[]>([]);
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
  // memorizado: el visor pinta en el mapa lo capturado y no debe rehacerlo en cada lectura del GPS
  return useMemo(() => [items.filter((i): i is QueuedAnnotation => !isResponse(i)), items.filter((i) => !i.error && !i.done).length], [items]);
}

/** Agrega a la cola e intenta subir. Una tracción en el km de otra en cola la reemplaza. */
export function enqueueAnnotation(item: Omit<QueuedAnnotation, "id" | "updated_at" | "error" | "sent" | "done">) {
  const same = (i: Queued) => !isResponse(i) && item.kind === "traccion" && i.kind === "traccion" && i.routeId === item.routeId && i.km === item.km;
  save([...load().filter((i) => !same(i)), { ...item, id: `pendiente-${crypto.randomUUID()}`, updated_at: new Date().toISOString() }]);
  void flushAnnotations();
}

/** Contestar otra vez el mismo aviso reemplaza la respuesta en cola (y en la base, por el upsert). */
export function answerAnnotation(item: Omit<QueuedResponse, "id" | "sent">) {
  save([...load().filter((i) => !(isResponse(i) && i.annotationId === item.annotationId)), { ...item, id: `respuesta-${crypto.randomUUID()}` }]);
  void flushAnnotations();
}

export function retryAnnotation(id: string) {
  save(load().map(({ error, ...i }) => (i.id === id ? i : { ...i, error })));
  void flushAnnotations();
}

export function discardAnnotation(id: string) {
  save(load().filter((i) => i.id !== id));
}

/**
 * Se llama al empezar una relectura de la ruta; la función que devuelve, tras una relectura exitosa, saca de la cola lo
 * que ya estaba subido al empezar: venga o no en ella (si no vino, se borró). Lo que suba mientras tanto espera a la siguiente.
 */
export function forgetUploaded(slug: string) {
  const ids = new Set(load().flatMap((i) => (i.done && i.slug === slug ? [i.id] : [])));
  return () => {
    const items = load();
    const rest = items.filter((i) => !ids.has(i.id));
    if (rest.length < items.length) save(rest);
  };
}

/** `{ id }`: subida, con el id de su fila; "red": sin señal o sin respuesta, se reintenta; otro texto: rechazo del servidor. */
async function upload(item: Queued): Promise<{ id: string } | string> {
  const supabase = createClient();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const attempt = async () => {
    // la respuesta es un upsert: repetirla tras un intento sin respuesta no duplica
    if (isResponse(item)) {
      const { annotationId, stillThere } = item as QueuedResponse;
      const { error, status } = await supabase.from("route_annotation_responses").upsert({ annotation_id: annotationId, still_there: stillThere }).abortSignal(signal);
      if (status === 0 || status === 408 || status === 429 || status >= 500) return "red";
      return error ? error.message : { id: item.id };
    }
    const { routeId, kind, traction, km, lng, lat, note } = item as QueuedAnnotation;
    // getSession lee la cookie; solo va a la red si hay que renovar la sesión
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (!auth.session) return authError && isAuthRetryableFetchError(authError) ? "red" : SIGNED_OUT;
    // con señal débil el alta llega y la respuesta no: antes de repetirla se busca (la tracción no duplica, la reemplaza el 23505)
    if (item.sent && kind !== "traccion") {
      const same = supabase.from("route_annotations").select("id").eq("route_id", routeId).eq("kind", kind).eq("km", km);
      const { data, status } = await (note === null ? same.is("note", null) : same.eq("note", note)).limit(1).abortSignal(signal);
      if (status === 0 || status >= 500) return "red";
      if (data?.length) return { id: data[0].id as string };
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
    if (error?.code === "42501") {
      // la regla de la base rechaza igual si la ruta se borró: se distingue buscándola
      const route = await supabase.from("routes").select("id").eq("id", routeId).abortSignal(signal).maybeSingle();
      if (route.status === 0 || route.status >= 500) return "red";
      return route.data ? DENIED : GONE;
    }
    if (error) return `No se pudo subir: ${error.message}`;
    return data?.length ? { id: data[0].id as string } : DENIED;
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
      const item = load().find((i) => !i.error && !i.done && !tried.has(i.id));
      if (!item) break;
      tried.add(item.id);
      if (!item.sent) save(load().map((i) => (i.id === item.id ? { ...i, sent: true } : i)));
      const result = await upload(item);
      if (result === "red") break;
      if (isResponse(item)) {
        // sin sesión, suspendida o aviso borrado: se descarta sin tarjeta de rechazo
        if (typeof result === "string") console.warn("Respuesta descartada:", result);
        save(load().filter((i) => i.id !== item.id), typeof result === "string" ? [] : [item.slug]);
        continue;
      }
      // se relee: mientras subía pudo entrar otra a la cola
      const row = typeof result === "string" ? null : result;
      save(load().map((i) => (i.id !== item.id ? i : row ? { ...i, id: row.id, done: true } : { ...i, error: result as string })), row ? [item.slug] : []);
    }
  })().finally(() => (running = null)));
}
