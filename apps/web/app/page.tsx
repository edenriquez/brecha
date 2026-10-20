import { Explorer } from "@/components/explorer";
import { TopNav } from "@/components/top-nav";
import { listAllUpcomingOutings } from "@/lib/outings.server";
import { listRoutes } from "@/lib/routes.server";

// Rutas y salidas públicas: se regeneran cada 5 min o al convocar/unirse; la sesión se resuelve en el navegador (UserMenu)
export const revalidate = 300;

export default async function Home() {
  const [routes, outings] = await Promise.all([listRoutes(), listAllUpcomingOutings()]);
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav />
      <Explorer routes={routes} outings={outings} />
    </div>
  );
}
