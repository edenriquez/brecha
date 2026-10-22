import type { Metadata } from "next";
import { HeartHandshake, ShieldAlert } from "lucide-react";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "Reglas de la comunidad",
  description: "Cómo caminamos juntos en Brecha y el aviso de responsabilidad para participar en salidas.",
};

const RULES: [string, string][] = [
  ["Respeta a todas las personas", "Sin acoso, discriminación ni comentarios ofensivos, en el sendero y en los chats del grupo."],
  ["Si te inscribes, ve", "Si ya no puedes ir, sal de la lista con tiempo para liberar tu lugar. Llega puntual al punto de encuentro."],
  ["Elige salidas a tu medida", "Revisa distancia, desnivel, nivel y ritmo antes de unirte. Si tienes dudas, pregunta a quien organiza."],
  ["Lleva tu propio equipo", "Agua suficiente, comida, impermeable, capa de abrigo, linterna, botiquín básico, identificación y el celular cargado."],
  ["Nadie se queda atrás", "El grupo avanza al ritmo de la persona más lenta. Avisa antes de separarte o de regresar por tu cuenta."],
  ["No dejes rastro", "Llévate tu basura, no salgas del sendero, no hagas fogatas donde está prohibido y respeta la flora, la fauna y las comunidades locales. Paga las cuotas de acceso de ejidos y parques."],
  ["Sin alcohol ni drogas", "Nadie participa en una salida bajo sus efectos."],
  ["Organiza con honestidad", "Describe la ruta, el punto de encuentro y los gastos compartidos tal como son. Las salidas son entre pares: no se usan para vender tours."],
];

const NOTICE = [
  "Brecha es una plataforma que conecta a personas para caminar juntas. No organiza, guía ni supervisa las salidas. Quienes las convocan son miembros de la comunidad, no guías certificados.",
  "El senderismo implica riesgos: caídas, lesiones, cambios bruscos de clima, extravío, fauna y efectos de la altitud. Participas de forma voluntaria y bajo tu propio riesgo.",
  "Cada quien es responsable de evaluar su condición física y su salud, de llevar el equipo adecuado y de decidir si continúa o se regresa.",
  "La información de las rutas (distancia, desnivel, tracks, duración y pronóstico) es orientativa, puede tener errores y las condiciones cambian. Verifícala antes de salir.",
  "Te recomendamos contar con un seguro de gastos médicos o de accidentes y compartir tu itinerario con alguien de confianza. En una emergencia llama al 911.",
  "Brecha no se hace responsable por lesiones, daños o pérdidas que ocurran durante las salidas.",
];

export default function ReglasPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight sm:text-4xl">Reglas de la comunidad</h1>
          <p className="mt-1.5 text-on-surface-variant">Para unirte a una salida o convocar una, aceptas estas reglas y el aviso de responsabilidad.</p>
        </div>

        <section className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-6 shadow-xs">
          <h2 className="mb-4 flex items-center gap-2 font-headline text-lg font-bold">
            <HeartHandshake className="size-5 text-primary" aria-hidden />
            Cómo caminamos juntos
          </h2>
          <ol className="space-y-4">
            {RULES.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed font-headline text-xs font-bold text-on-primary-fixed-variant">
                  {i + 1}
                </span>
                <div>
                  <p className="font-headline text-sm font-bold">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-on-surface-variant">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="aviso" className="scroll-mt-24 rounded-2xl border border-error/30 bg-surface-container-lowest p-6 shadow-xs">
          <h2 className="mb-4 flex items-center gap-2 font-headline text-lg font-bold">
            <ShieldAlert className="size-5 text-error" aria-hidden />
            Aviso de responsabilidad
          </h2>
          <ul className="list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-on-surface-variant marker:text-error">
            {NOTICE.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
