"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { flushAnnotations } from "@/lib/annotation-queue";
import { useDownloads } from "@/lib/offline";

/** Avance de la cola de descargas en cualquier página, salvo en /descargas que ya lo muestra. */
export function DownloadPill() {
  const { routes, done, total } = useDownloads(false);
  const pathname = usePathname();
  const active = total > 0;

  // las anotaciones capturadas sin señal en el visor suben en cualquier página: al abrir la app y al volver la red
  useEffect(() => {
    void flushAnnotations();
    window.addEventListener("online", flushAnnotations);
    return () => window.removeEventListener("online", flushAnnotations);
  }, []);

  // la cola solo avanza con la app abierta
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  if (!active || pathname === "/descargas") return null;
  const current = Object.values(routes ?? {}).find((d) => d.status === "bajando" || d.status === "en-pausa");
  const percent = current?.status === "bajando" ? Math.floor((current.done / current.total) * 100) : 0;
  return (
    <Link
      href="/descargas"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-full bg-primary px-5 py-3.5 font-headline text-sm font-semibold text-on-primary shadow-lg"
    >
      <span
        className="size-5 shrink-0 rounded-full"
        style={{ background: `conic-gradient(var(--color-primary-fixed) ${percent}%, color-mix(in srgb, var(--color-on-primary) 25%, transparent) 0)` }}
        aria-hidden
      />
      <span className="flex-1">
        {current?.status === "en-pausa" ? "En pausa · se reanuda sola" : `Descargando ${Math.min(done + 1, total)} de ${total} ${total === 1 ? "ruta" : "rutas"} · ${percent}%`}
      </span>
      <ChevronRight className="size-5" aria-hidden />
    </Link>
  );
}
