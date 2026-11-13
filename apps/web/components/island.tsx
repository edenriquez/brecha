"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Map as MapIcon } from "lucide-react";
import { UserMenu } from "@/components/user-menu";

/** Estilo de la acción que acompaña al perfil en la isla ("Ver mapa", "Ver lista"). */
export const ISLAND_ACTION = "flex items-center gap-2 rounded-full px-4 py-2 font-headline text-sm font-semibold whitespace-nowrap text-surface active:scale-95";

/**
 * Si la isla debe esconderse tras un desplazamiento a `top`: se esconde al bajar y vuelve al subir o arriba del todo.
 * Devuelve null si el movimiento fue de menos de 12 px, para que el temblor del dedo no la haga parpadear.
 */
export function islandHiddenAfter(top: number, last: { current: number }) {
  if (top > 0 && Math.abs(top - last.current) < 12) return null;
  const hidden = top > 0 && top > last.current;
  last.current = top;
  return hidden;
}

/**
 * Isla flotante inferior de teléfono: una acción (`children`) y el perfil, que en teléfono no cabe en el encabezado
 * porque ahí solo va el buscador. Con el menú del perfil abierto (aria-expanded) no se esconde.
 */
export function Island({ hidden = false, className, children }: { hidden?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full bg-on-surface p-1 shadow-lg transition-transform duration-300 motion-reduce:transition-none",
        hidden && "translate-y-[calc(100%+1.5rem)] has-[[aria-expanded=true]]:translate-y-0",
        className,
      )}
    >
      {children}
      {/* desde md el perfil ya está en el encabezado */}
      <div className="md:hidden">
        <UserMenu island />
      </div>
    </div>
  );
}

/** La isla de las páginas que no son el explorador: lleva al mapa y da el perfil; se esconde al bajar por la página. */
export function PageIsland() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const last = { current: window.scrollY };
    const onScroll = () => {
      const next = islandHiddenAfter(window.scrollY, last);
      if (next !== null) setHidden(next);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <Island hidden={hidden} className="md:hidden">
      <Link href="/" className={ISLAND_ACTION}>
        <MapIcon className="size-4" aria-hidden />
        Ver mapa
      </Link>
    </Island>
  );
}
