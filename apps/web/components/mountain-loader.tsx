/** Pantalla de paso a la página de una ruta: una montaña que se dibuja sobre el verde de la marca. */
export function MountainLoader() {
  return (
    <div role="status" aria-label="Abriendo la ruta" className="loader-in fixed inset-0 z-[100] grid place-items-center bg-primary">
      <svg viewBox="0 0 120 80" className="loader-rise w-28 text-on-primary" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {/* pathLength=1: el trazo se dibuja completo sin medir el camino */}
        <path pathLength={1} className="loader-draw" d="M6 72 L44 14 L62 40 L76 24 L114 72 Z" />
        <path pathLength={1} className="loader-draw loader-draw-late" strokeWidth={2.5} opacity={0.6} d="M34 30 L44 40 L52 28" />
      </svg>
    </div>
  );
}
