"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarCheck, ChevronDown, ClipboardCheck, FilePlus2, Heart, HeartHandshake, LogOut, Route, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { Person } from "@/lib/outings";
import { PERSON_COLUMNS, profileHref } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import { useSessionUser } from "@/lib/use-session-user";

const ITEM = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-container";

export function UserMenu() {
  const user = useSessionUser();
  const [open, setOpen] = useState(false);
  // pendientes de moderación; null si no es moderación
  const [pending, setPending] = useState<{ routes: number; reports: number } | null>(null);
  const [profile, setProfile] = useState<Person | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select(PERSON_COLUMNS)
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as Person | null));
    supabase.rpc("is_admin").then(async ({ data }) => {
      if (data !== true) return;
      const head = { count: "exact", head: true } as const;
      const [routes, reports] = await Promise.all([
        supabase.from("routes").select("id", head).eq("status", "revision"),
        supabase.from("content_reports").select("id", head).eq("status", "abierto"),
      ]);
      setPending({ routes: routes.count ?? 0, reports: reports.count ?? 0 });
    });
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

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

  // hasta que llega el perfil, lo que trae la sesión de Google
  const person: Person = profile ?? {
    id: user.id,
    display_name: (user.user_metadata.full_name as string | undefined) ?? user.email ?? null,
    avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
    avatar_path: null,
  };
  const name = person.display_name ?? "";
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link
        href="/mis-salidas"
        aria-label="Mis salidas"
        className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-primary hover:bg-surface-container sm:px-3"
      >
        <CalendarCheck className="size-5" aria-hidden />
        <span className="hidden sm:inline">Mis salidas</span>
      </Link>
      <div ref={menu} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Tu cuenta"
          className="relative flex items-center gap-2 rounded-full py-0.5 pr-1 pl-0.5 hover:bg-surface-container sm:pr-2"
        >
          <Avatar person={person} size={36} className="border-0 ring-2 ring-primary-fixed" />
          <span className="hidden text-sm font-medium text-on-surface-variant sm:inline">{name.split(" ")[0]}</span>
          <ChevronDown className="hidden size-4 text-outline sm:block" aria-hidden />
          {!!pending && pending.routes + pending.reports > 0 && <span className="absolute -top-0.5 left-7 size-2.5 rounded-full border-2 border-surface bg-secondary" aria-hidden />}
        </button>
        {open && (
          <div id={menuId} className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-1.5 shadow-lg">
            <p className="truncate px-3 pt-1.5 pb-2 text-xs text-on-surface-variant">{user.email}</p>
            <nav aria-label="Tu cuenta" onClick={() => setOpen(false)}>
              <Link href={profileHref(user.id)} className={ITEM}>
                <UserRound className="size-4 text-primary" aria-hidden />
                Mi perfil
              </Link>
              <Link href="/guardadas" className={ITEM}>
                <Heart className="size-4 text-primary" aria-hidden />
                Guardadas
              </Link>
              <Link href="/mis-salidas" className={ITEM}>
                <CalendarCheck className="size-4 text-primary" aria-hidden />
                Mis salidas
              </Link>
              <Link href="/mis-rutas" className={ITEM}>
                <Route className="size-4 text-primary" aria-hidden />
                Mis rutas
              </Link>
              <Link href="/rutas/nueva" className={ITEM}>
                <FilePlus2 className="size-4 text-primary" aria-hidden />
                Subir una ruta
              </Link>
              {pending !== null && (
                <>
                  <Link href="/admin" className={ITEM}>
                    <ShieldCheck className="size-4 text-primary" aria-hidden />
                    <span className="flex-1">Moderación</span>
                    {pending.reports > 0 && <span className="rounded-full bg-error px-1.5 text-[10px] font-bold text-white">{pending.reports}</span>}
                  </Link>
                  <Link href="/revision" className={ITEM}>
                    <ClipboardCheck className="size-4 text-primary" aria-hidden />
                    <span className="flex-1">Revisión de rutas</span>
                    {pending.routes > 0 && <span className="rounded-full bg-secondary px-1.5 text-[10px] font-bold text-on-secondary">{pending.routes}</span>}
                  </Link>
                </>
              )}
              <Link href="/reglas" className={ITEM}>
                <HeartHandshake className="size-4 text-primary" aria-hidden />
                Reglas de la comunidad
              </Link>
            </nav>
            <form action="/auth/salir" method="post" className="mt-1 border-t border-outline-variant/50 pt-1">
              <button className={`${ITEM} w-full text-on-surface-variant`}>
                <LogOut className="size-4" aria-hidden />
                Salir
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
