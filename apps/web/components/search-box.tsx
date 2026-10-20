"use client";

import Form from "next/form";
import { Search, X } from "lucide-react";

const BOX = "flex w-full max-w-80 items-center rounded-full border border-outline-variant bg-surface-container-lowest py-1.5 pr-2 pl-3.5 shadow-sm focus-within:border-primary";
// 16px en móvil: con menos, iOS hace zoom al enfocar
const INPUT = "w-full min-w-0 bg-transparent text-base leading-tight outline-none placeholder:text-on-surface-variant lg:text-xs";

/**
 * Con value/onChange filtra en vivo (explorador); sin ellos es un formulario que lleva a /?q=.
 */
export function SearchBox({ value, onChange }: { value?: string; onChange?: (value: string) => void }) {
  const label = (
    <span className="hidden font-headline text-xs leading-tight font-semibold lg:block">¿A dónde quieres caminar?</span>
  );
  const icon = <Search className="mr-2.5 size-5 shrink-0 text-primary" aria-hidden />;

  if (!onChange) {
    return (
      <Form action="/" role="search" className={BOX}>
        {icon}
        <label className="flex min-w-0 flex-1 flex-col">
          {label}
          <input name="q" type="search" placeholder="Busca un cerro, parque o municipio" aria-label="Buscar rutas" className={INPUT} />
        </label>
      </Form>
    );
  }

  return (
    <form
      role="search"
      className={BOX}
      onSubmit={(e) => {
        e.preventDefault();
        e.currentTarget.querySelector("input")?.blur();
      }}
    >
      {icon}
      <label className="flex min-w-0 flex-1 flex-col">
        {label}
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Busca un cerro, parque o municipio"
          aria-label="Buscar rutas"
          enterKeyHint="search"
          className={`${INPUT} [&::-webkit-search-cancel-button]:hidden`}
        />
      </label>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Borrar búsqueda"
          className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </form>
  );
}
