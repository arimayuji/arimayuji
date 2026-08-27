"use client";

import Link from "next/link";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, PreferenceToggle, Screen, ScreenHeader } from "../../ui";
import { usePreferences } from "@/lib/usePreferences";

/**
 * Split out of `/perfil` the same way `/perfil/dados` was: the health-data
 * card had grown into its own dedicated visual (a full run-card mockup plus
 * a "how this works" explainer) rather than a plain settings row, so it
 * gets a screen of its own instead of pushing the rest of Perfil further
 * down.
 *
 * The consent toggle below is the product-level screen `src/lib/health.ts`'s
 * own doc comment says has to exist before that feature can be turned back
 * on — an LGPD/security audit found it reading heart rate/calories/steps
 * automatically, with only the OS's own HealthKit/Health Connect permission
 * dialog ahead of it, which consents to the sensor, not to what *this app*
 * does with the reading. Off by default; `fetchRunHealthData` checks this
 * same preference itself, so nothing reads until this is turned on here —
 * and turning it back off takes effect on the very next run opened.
 */

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HeartRateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 12h4l2-5 3 10 2-8 2 3h5" />
    </svg>
  );
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE} fill="none">
      <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-2-1-3-1-3s2 1.5 2 5.5A5.5 5.5 0 0 1 6.5 18C5.7 13.4 8.8 11 12 2z" />
    </svg>
  );
}

function StepsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
      <path d="M7 10l-2 8" />
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M17 16l2 6" />
    </svg>
  );
}

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

export default function DadosRelogioPage() {
  useHeaderClose("/perfil");
  const [preferences, updatePreferences] = usePreferences();

  return (
    <>
      <ScreenHeader
        title="Dados do relógio"
        subtitle="FC, calorias, passos, sono e mais, medidos de verdade pelo seu smartwatch."
      />

      <Screen>
        <Card className="pr-enter" style={delay(20)}>
          <CardTitle
            aside={
              <NoticeBadge>{preferences.healthDataConsent ? "ativado" : "desligado"}</NoticeBadge>
            }
          >
            Ler dados de saúde
          </CardTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Frequência cardíaca, calorias, passos, FC em repouso, variabilidade de FC (HRV), VO2
            máx estimado e sono são dados sensíveis — o Xanthus só lê do seu Apple Health/Health
            Connect com essa chave ligada por você. O aviso de permissão do sistema, sozinho, não
            conta como esse consentimento.
          </p>
          <PreferenceToggle
            label="Ativar leitura de dados de saúde"
            hint="Desligado por padrão. Desligar aqui para de ler a partir da próxima corrida aberta."
            checked={preferences.healthDataConsent}
            onChange={(healthDataConsent) => updatePreferences({ healthDataConsent })}
          />
        </Card>

        <Card className="pr-enter" style={delay(40)}>
          <CardTitle aside={<NoticeBadge>sem validação em campo</NoticeBadge>}>Onde aparece</CardTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Não é uma lista separada — FC média, calorias e passos entram direto no card da
            corrida, dentro do seu Histórico. FC em repouso, HRV, VO2 máx e sono da noite anterior
            aparecem num segundo card, &quot;Recuperação&quot;, logo abaixo — só quando o relógio
            realmente tiver medido isso perto da data da corrida.
          </p>

          <div className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Essa corrida</span>
              <ExampleBadge />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold whitespace-nowrap">Corrida — 18 ago</span>
              <span className="text-sm font-semibold whitespace-nowrap text-muted">5.2 km</span>
            </div>
            <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-border pt-3.5">
              <div className="flex items-center gap-1.5">
                <HeartRateIcon className="h-4 w-4 shrink-0 text-accent" />
                <span className="font-mono text-sm font-bold tabular-nums">162</span>
                <span className="text-[11px] text-muted">bpm</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FlameIcon className="h-4 w-4 shrink-0 text-accent" />
                <span className="font-mono text-sm font-bold tabular-nums">312</span>
                <span className="text-[11px] text-muted">kcal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StepsIcon className="h-4 w-4 shrink-0 text-accent" />
                <span className="font-mono text-sm font-bold tabular-nums">4.980</span>
              </div>
            </div>
            <span className="mt-3.5 inline-block rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted">
              Apple Watch
            </span>
          </div>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted text-pretty">
            Exemplo de como o card da corrida vai ficar — ainda não validado em aparelho real.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(70)}>
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

        <Link
          href="/perfil"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(100)}
        >
          Voltar pro perfil
        </Link>
      </Screen>
    </>
  );
}
