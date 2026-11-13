"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PlaceSheet, type SearchChanges } from "@/components/place-sheet";
import { describePlace } from "@/lib/places";
import type { RouteSummary } from "@/lib/routes";

/**
 * Píldora que abre el buscador de lugares. En el explorador recibe la búsqueda actual y `onChange`
 * cambia la URL en sitio; en las demás páginas elegir algo lleva al mapa (`/?zona=…&lugar=…` o `/?q=…`).
 */
export function SearchBox({
  query = "",
  place = null,
  routes,
  onChange,
}: {
  query?: string;
  place?: string | null;
  routes?: RouteSummary[];
  onChange?: (changes: SearchChanges) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const router = useRouter();
  const go = (changes: SearchChanges) => {
    const params = new URLSearchParams(Object.entries(changes).filter((e): e is [string, string] => Boolean(e[1])));
    router.push(params.size ? `/?${params}` : "/");
  };

  const where = describePlace(place)?.label;
  const searched = query.trim() && `“${query.trim()}”`;
  const status = [searched, where].filter(Boolean).join(" · ") || "Busca un estado, municipio o cerro";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full max-w-80 min-w-0 items-center rounded-full border border-outline-variant bg-surface-container-lowest py-1.5 pr-3 pl-3.5 text-left shadow-sm hover:border-primary"
      >
        <Search className="mr-2.5 size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-headline text-xs leading-tight font-semibold">¿A dónde quieres caminar?</span>
          <span className="truncate text-xs leading-tight text-on-surface-variant">{status}</span>
        </span>
      </button>
      {/* portal: la hoja no debe quedar dentro del encabezado fijo */}
      {open && createPortal(<PlaceSheet query={query} place={place} routes={routes} onChange={onChange ?? go} onClose={close} />, document.body)}
    </>
  );
}
