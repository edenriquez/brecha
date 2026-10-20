import Link from "next/link";
import { Mountain, Search } from "lucide-react";
import { UserMenu } from "@/components/user-menu";

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 flex-none border-b border-outline-variant bg-surface shadow-sm">
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-headline text-2xl font-bold tracking-tight text-primary">
            <Mountain className="size-7 fill-primary-container text-primary-container" aria-hidden />
            brecha
          </Link>
          <div className="hidden w-80 items-center rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-1.5 shadow-sm lg:flex">
            <Search className="mr-2.5 size-5 text-primary" aria-hidden />
            <div className="flex flex-col text-left">
              <span className="font-headline text-xs font-semibold leading-tight">¿A dónde quieres caminar?</span>
              <span className="text-[11px] leading-tight text-on-surface-variant">Busca un cerro, parque o municipio</span>
            </div>
          </div>
        </div>
        <nav className="hidden items-center gap-7 md:flex">
          <Link href="/" className="flex items-center gap-1.5 border-b-2 border-primary pb-1 font-semibold text-primary">
            Mapa
          </Link>
        </nav>
        <UserMenu />
      </div>
    </header>
  );
}
