"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Un solo pedido por sesión aunque el mapa muestre decenas de corazones
let owner: string | null = null;
let saved: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

function emit(next: ReadonlySet<string>) {
  saved = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(userId: string) {
  if (owner === userId) return;
  owner = userId;
  saved = null;
  createClient()
    .from("route_favorites")
    .select("route_id")
    .then(({ data, error }) => {
      if (owner !== userId) return;
      if (error) console.error("route_favorites:", error.message);
      emit(new Set((data ?? []).map((r) => r.route_id as string)));
    });
}

/** Ids de las rutas guardadas; null mientras se leen o sin sesión. */
export function useFavorites(user: User | null | undefined) {
  useEffect(() => {
    if (user) load(user.id);
  }, [user]);
  const set = useSyncExternalStore(
    subscribe,
    () => saved,
    () => null,
  );
  return user && owner === user.id ? set : null;
}

/** Cambia el corazón al instante y lo regresa si la base no acepta el cambio. */
export async function setFavorite(routeId: string, save: boolean) {
  const flip = (on: boolean) => {
    const next = new Set(saved);
    if (on) next.add(routeId);
    else next.delete(routeId);
    emit(next);
  };
  flip(save);
  const table = createClient().from("route_favorites");
  const { error } = save ? await table.insert({ route_id: routeId }) : await table.delete().eq("route_id", routeId);
  // 23505: ya estaba guardada (otra pestaña)
  if (error && error.code !== "23505") {
    console.error("setFavorite:", error.message);
    flip(!save);
    return false;
  }
  return true;
}
