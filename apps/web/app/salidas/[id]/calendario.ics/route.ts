import { outingEvent, toICS } from "@/lib/calendar";
import { getOuting } from "@/lib/outings.server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const outing = await getOuting((await params).id);
  if (!outing) return new Response("No encontramos esa salida.", { status: 404 });

  const url = new URL(`/salidas/${outing.id}`, request.url).toString();
  return new Response(toICS(outingEvent(outing, url)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="brecha-${outing.route.slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
