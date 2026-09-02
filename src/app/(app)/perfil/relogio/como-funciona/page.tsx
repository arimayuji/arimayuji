"use client";

import { useHeaderClose } from "../../../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../../../ui";

/**
 * The detailed "how this works" writeup that used to live inline on
 * `/perfil/relogio` — moved out per direct feedback ("tem muito texto
 * nessa parte de relógio"): any long description of mechanism/process
 * belongs behind a link to a browser page, not inline in the app's own
 * UI, keeping the in-app screen to what someone actually needs to decide
 * whether to turn the toggle on. Reached only via that link (`target="_blank"`),
 * same convention `/plano`/`/aquecimento` already use pointing at `/estudos`.
 */

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function OverlapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  );
}

function SilentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c5 0 9 4 10 7-.4 1.1-1.1 2.3-2.1 3.4M6.5 6.6C4.6 7.9 3.1 9.8 2 12c1 3 5 7 10 7 1.4 0 2.7-.3 3.9-.8" />
    </svg>
  );
}

const INFO_ITEMS = [
  {
    icon: ClockIcon,
    text: "O app lê do repositório de saúde do celular (Apple Health ou Google Health Connect), nunca fala com o relógio direto.",
  },
  {
    icon: OverlapIcon,
    text: "Vincula pela janela de tempo da corrida, com tolerância de ±10 min, e escolhe o treino do relógio com maior sobreposição real.",
  },
  {
    icon: SilentIcon,
    text: "Sem treino do relógio na janela? Some silenciosamente — a corrida volta ao normal, sem erro na tela.",
  },
];

export default function ComoFuncionaDadosRelogioPage() {
  useHeaderClose("/perfil/relogio");

  return (
    <>
      <ScreenHeader title="Como funciona a leitura do relógio" />

      <Screen>
        <Card
          className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(20)}
        >
          <CardTitle>Onde os dados aparecem</CardTitle>
          <p className="text-sm leading-relaxed text-pretty">
            Não é uma lista separada — FC média, calorias e passos entram direto no card da
            corrida, dentro do seu Histórico. FC em repouso, variabilidade de FC (HRV), VO2 máx
            estimado e sono da noite anterior aparecem num segundo card, &quot;Recuperação&quot;,
            logo abaixo — só quando o relógio realmente tiver medido isso perto da data da
            corrida.
          </p>
        </Card>

        <Card
          className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(50)}
        >
          <CardTitle>Como isso funciona</CardTitle>
          <div className="flex flex-col gap-4">
            {INFO_ITEMS.map((item, index) => (
              <div
                key={index}
                className={`flex items-start gap-3.5 ${index > 0 ? "border-t border-border pt-3.5" : ""}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-accent">
                  <item.icon className="h-4 w-4" />
                </span>
                <p className="pt-1.5 text-sm leading-relaxed text-pretty">{item.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </Screen>
    </>
  );
}
