"use client";

// reemplaza al layout: no tiene globals.css, por eso los estilos en línea
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-MX">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 16px", textAlign: "center", fontFamily: "system-ui, sans-serif", background: "#f6f3ec" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>No pudimos cargar esta pantalla</h1>
        <p style={{ margin: 0, fontSize: 14 }}>Puede que no tengas señal.</p>
        <button type="button" onClick={() => retry()} style={{ marginTop: 8, border: 0, borderRadius: 999, padding: "8px 20px", fontSize: 14, fontWeight: 600, background: "#164525", color: "#fff" }}>
          Reintentar
        </button>
        <a href="/descargas" style={{ fontSize: 14, fontWeight: 600, color: "#164525" }}>
          Rutas sin conexión
        </a>
      </body>
    </html>
  );
}
