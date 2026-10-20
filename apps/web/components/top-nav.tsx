import Link from "next/link";
import { Mountain } from "lucide-react";
import { SearchBox } from "@/components/search-box";
import { UserMenu } from "@/components/user-menu";

/** `search`: el explorador pasa su buscador en vivo; en las demás páginas buscar lleva al mapa. */
export function TopNav({ search }: { search?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-50 flex-none border-b border-outline-variant bg-surface shadow-sm">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
          <Link href="/" aria-label="brecha" className="flex shrink-0 items-center gap-2 font-headline text-2xl font-bold tracking-tight text-primary">
            <Mountain className="size-7 fill-primary-container text-primary-container" aria-hidden />
            <span className="hidden sm:inline">brecha</span>
          </Link>
          {search ?? <SearchBox />}
        </div>
        <nav className="hidden shrink-0 items-center gap-7 md:flex">
          <Link href="/" className="flex items-center gap-1.5 border-b-2 border-primary pb-1 font-semibold text-primary">
            Mapa
          </Link>
        </nav>
        <div className="shrink-0">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
