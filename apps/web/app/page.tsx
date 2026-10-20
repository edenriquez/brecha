import { Explorer } from "@/components/explorer";
import { TopNav } from "@/components/top-nav";
import { listRoutes } from "@/lib/routes.server";

// Rutas públicas: se regeneran cada 5 min; la sesión se resuelve en el navegador (UserMenu)
export const revalidate = 300;

export default async function Home() {
  const routes = await listRoutes();
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav />
      <Explorer routes={routes} />
    </div>
  );
}
