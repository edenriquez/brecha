import Link from "next/link";
import { Layers } from "lucide-react";

/** Botón sobre un mapa chico que lleva al explorador, con capas, 3D y recorrido. */
export function OpenMapLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-surface-container-lowest px-3.5 py-2 font-headline text-xs font-semibold text-on-surface shadow-lg ring-1 ring-outline-variant/60 transition-transform hover:scale-105 active:scale-95"
    >
      <Layers className="size-4" aria-hidden />
      Abrir en el mapa
    </Link>
  );
}
