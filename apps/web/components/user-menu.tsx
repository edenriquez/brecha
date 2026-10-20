"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** La sesión se lee en el navegador para que las páginas públicas sigan siendo cacheables. */
export function UserMenu() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (user === undefined) return <div className="h-9 w-20" aria-hidden />;

  if (!user) {
    return (
      <Link
        href="/entrar"
        className="rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-95"
      >
        Entrar
      </Link>
    );
  }

  const name = (user.user_metadata.full_name as string | undefined) ?? user.email ?? "";
  const avatar = user.user_metadata.avatar_url as string | undefined;
  return (
    <form action="/auth/salir" method="post" className="flex items-center gap-3">
      <span className="hidden text-sm font-medium text-on-surface-variant sm:inline">{name.split(" ")[0]}</span>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar de Google, fuera de images.remotePatterns
        <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full ring-2 ring-primary-fixed" />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-container font-headline text-sm font-bold text-on-primary">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <button className="text-xs font-medium text-on-surface-variant hover:text-primary">Salir</button>
    </form>
  );
}
