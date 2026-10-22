"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Usuario de la sesión leído en el navegador, para que las páginas públicas sigan siendo cacheables.
 * undefined mientras se lee; null sin sesión.
 */
export function useSessionUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  return user;
}

/** Si quien tiene la sesión modera; false mientras se averigua o sin sesión. */
export function useIsAdmin(user: User | null | undefined) {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    createClient()
      .rpc("is_admin")
      .then(({ data }) => setAdmin(data === true));
  }, [user]);

  return !!user && admin;
}
