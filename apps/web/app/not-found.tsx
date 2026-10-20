import Link from "next/link";
import { Mountain } from "lucide-react";
import { TopNav } from "@/components/top-nav";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <Mountain className="size-12 text-outline-variant" aria-hidden />
        <h1 className="font-headline text-2xl font-bold">No encontramos esta página</h1>
        <p className="text-sm text-on-surface-variant">Puede que la ruta ya no esté publicada o que el enlace tenga un error.</p>
        <Link href="/" className="mt-2 rounded-full bg-primary px-5 py-2 font-headline text-sm font-semibold text-on-primary hover:bg-primary-container">
          Volver al mapa
        </Link>
      </main>
    </div>
  );
}
