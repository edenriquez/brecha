import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatKm } from "@/lib/routes";
import { outingDateParts, spotsLabel } from "@/lib/outings";
import { getOuting } from "@/lib/outings.server";

export const alt = "Salida en grupo en Brecha";
export const size = { width: 1200, height: 630 };
// WhatsApp no muestra la vista previa si la imagen pasa de ~300 KB: el PNG de una foto pesa más de 1 MB
export const contentType = "image/jpeg";

const fonts = Promise.all(
  (["Bold", "ExtraBold"] as const).map(async (weight) => ({
    name: "Jakarta",
    data: await readFile(join(process.cwd(), `assets/fonts/PlusJakartaSans-${weight}.ttf`)),
    weight: weight === "Bold" ? (700 as const) : (800 as const),
    style: "normal" as const,
  })),
);

async function render(element: React.ReactElement) {
  const png = await new ImageResponse(element, { ...size, fonts: await fonts }).arrayBuffer();
  const jpeg = await sharp(Buffer.from(png)).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": contentType } });
}

/** Las portadas de las rutas iniciales viven en public/ (ver outputFileTracingIncludes); las subidas después son URLs absolutas. */
async function coverSrc(cover: string | null) {
  if (!cover) return null;
  if (/^https?:\/\//.test(cover)) return cover;
  try {
    const file = await readFile(join(process.cwd(), "public", cover));
    return `data:image/jpeg;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const outing = await getOuting((await params).id);
  if (!outing) return render(<Brand big />);

  const { route } = outing;
  const date = outingDateParts(outing.starts_at);
  const cover = await coverSrc(route.cover_url);
  const status = outing.status === "cancelada" ? "Cancelada" : spotsLabel(outing.capacity, outing.members);

  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#2f5d3a", color: "white", fontFamily: "Jakarta", fontWeight: 700 }}>
      {cover && (
        <img src={cover} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          display: "flex",
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.1) 100%)",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "48px 56px" }}>
        <Brand />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: "#ff7a3d", color: "#3a1300", borderRadius: 999, padding: "10px 22px", fontSize: 28, fontWeight: 700 }}>
              {`${date.long.charAt(0).toUpperCase()}${date.long.slice(1)} · ${date.time}`}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: outing.title.length > 40 ? 62 : 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{outing.title}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30, opacity: 0.92 }}>
            <span>{`${route.name} · ${formatKm(route.distance_km)} · ↑ ${route.elevation_gain_m.toLocaleString("es-MX")} m`}</span>
            <span style={{ display: "flex", background: "rgba(255,255,255,0.16)", borderRadius: 14, padding: "8px 18px", fontWeight: 700 }}>{status}</span>
          </div>
        </div>
      </div>
    </div>,
  );
}

function Brand({ big }: { big?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: big ? 96 : 40,
        fontWeight: 800,
        color: "white",
        ...(big ? { width: "100%", height: "100%", justifyContent: "center", background: "#2f5d3a" } : {}),
      }}
    >
      <svg width={big ? 96 : 44} height={big ? 96 : 44} viewBox="0 0 24 24" fill="#bbefc1">
        <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
      </svg>
      brecha
    </div>
  );
}
