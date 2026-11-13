import { BackButton } from "@/components/back-button";
import { TopNav } from "@/components/top-nav";

/**
 * Página de detalle (ruta, salida) con el modelo de entrelugares. Teléfono: la foto arriba a todo lo ancho, con
 * volver y compartir flotando sobre ella, y el contenido en una columna. Escritorio: encabezado, y debajo dos
 * columnas con la tarjeta de acciones (`aside`) fija a la derecha.
 * `lead`: lo primero del contenido; en teléfono va antes de la tarjeta de acciones y `children`, después.
 */
export function DetailLayout({
  actions,
  header,
  cover,
  aside,
  lead,
  children,
}: {
  lead?: React.ReactNode;
  /** Compartir, guardar: junto a "Volver" */
  actions: React.ReactNode;
  header: React.ReactNode;
  cover: React.ReactNode;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="hidden lg:block">
        <TopNav />
      </div>
      <main className="mx-auto grid max-w-screen-sm grid-cols-1 pb-12 lg:max-w-[1120px] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-12 lg:px-8 lg:pt-6 lg:pb-16">
        {/* teléfono: fija, se puede volver o compartir desde cualquier punto del scroll */}
        <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-40 mx-auto flex max-w-screen-sm items-center justify-between px-4 *:pointer-events-auto lg:static lg:col-span-2 lg:mx-0 lg:max-w-none lg:px-0">
          <BackButton className="grid size-10 place-items-center rounded-full bg-surface-container-lowest shadow-md hover:bg-surface-container lg:border lg:border-outline-variant lg:shadow-none" />
          <div className="flex gap-2">{actions}</div>
        </div>
        <header className="px-5 pt-5 lg:col-span-2 lg:px-0 lg:pt-4">{header}</header>
        <div className="relative order-first aspect-[4/3] overflow-hidden bg-surface-container lg:order-none lg:col-start-1 lg:row-start-3 lg:mt-6 lg:rounded-2xl">{cover}</div>
        {lead && <div className="min-w-0 px-5 pt-7 lg:col-start-1 lg:row-start-4 lg:px-0 lg:pt-9">{lead}</div>}
        <aside className="px-5 pt-6 lg:col-start-2 lg:row-span-3 lg:row-start-3 lg:px-0">
          <div className="space-y-5 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 shadow-sm lg:sticky lg:top-24 lg:p-6">{aside}</div>
        </aside>
        <div className="min-w-0 space-y-7 px-5 pt-7 lg:col-start-1 lg:row-start-5 lg:space-y-9 lg:px-0 lg:pt-9">{children}</div>
      </main>
    </div>
  );
}

export function DetailChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] text-on-surface-variant uppercase">{children}</span>
  );
}
