"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";
import { PillSlider } from "../../pill-slider";
import {
  listPainCheckIns,
  reportPain,
  type PainCheckIn,
  type PainSeverity,
} from "@/lib/tracking/storage";
import { activePainSignal } from "@/lib/plan";
import { useRunnerProfile } from "@/lib/useRunnerProfile";

/**
 * Split out of `/perfil` on request: weight and pain are properties of the
 * athlete, not app settings, and sitting between "unidade de distância" and
 * "meus tênis" made the main screen read as one long undifferentiated list
 * ("tem muita coisa na aba de perfil"). This page is reached from the
 * "Conta" card rather than the bottom nav — it has no destination of its
 * own beyond editing these two things.
 */

const PAIN_SEVERITY_OPTIONS: { value: PainSeverity; label: string; hint: string }[] = [
  { value: "leve", label: "Leve", hint: "incômodo, dá pra rodar" },
  { value: "moderada", label: "Moderada", hint: "atrapalha o pace" },
  { value: "forte", label: "Forte", hint: "melhor não treinar" },
];

const PAIN_SEVERITY_LABEL: Record<PainSeverity, string> = {
  leve: "leve",
  moderada: "moderada",
  forte: "forte",
};

function sinceLabel(timestamp: number, now = Date.now()): string {
  const days = Math.floor((now - timestamp) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

/**
 * Whether the athlete is dealing with pain, read from an append-only log
 * (see `PainCheckIn`) instead of a single toggle. Feeds `/plano` through
 * `activePainSignal`: a reported check-in cuts and holds the volume ramp
 * instead of the plan quietly climbing through it, which is the single
 * biggest complaint in competitor reviews of AI training-plan apps — the
 * plan doesn't react when the athlete says something hurts.
 */
function PainCard() {
  const [checkIns, setCheckIns] = useState<PainCheckIn[] | null>(null);
  const [region, setRegion] = useState("");
  const [severityIndex, setSeverityIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => listPainCheckIns().then(setCheckIns), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = checkIns ? activePainSignal(checkIns) : null;
  const selected = PAIN_SEVERITY_OPTIONS[severityIndex];

  const submit = async () => {
    setBusy(true);
    await reportPain({ severity: selected.value, region: region.trim() || undefined });
    setRegion("");
    setSeverityIndex(0);
    setBusy(false);
    await refresh();
  };

  const clear = async () => {
    setBusy(true);
    await reportPain({ severity: "recuperado" });
    setBusy(false);
    await refresh();
  };

  return (
    <Card className="pr-enter" style={delay(60)}>
      <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Como você está</CardTitle>

      {checkIns === null ? (
        <div className="h-12 animate-pulse rounded-lg bg-background" />
      ) : active ? (
        <>
          <p className="text-sm leading-relaxed text-pretty">
            Dor <strong>{PAIN_SEVERITY_LABEL[active.severity]}</strong> sinalizada{" "}
            {sinceLabel(active.reportedAt)}
            {active.region ? ` — ${active.region}` : ""}. O <Link href="/plano" className="underline underline-offset-2">plano</Link> reduziu o volume dessa semana e segura a
            progressão por um tempo antes de voltar a subir.
          </p>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="mt-4 min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-accent disabled:opacity-60"
          >
            Voltei a treinar sem dor
          </button>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Sentindo alguma dor ou desconforto? Sinalizar aqui reduz o volume da semana no plano em
            vez de ignorar e seguir subindo.
          </p>
          <input
            type="text"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="Onde? (opcional)"
            className="mb-4 min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent"
          />

          <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Intensidade
          </span>
          <PillSlider
            min={0}
            max={PAIN_SEVERITY_OPTIONS.length - 1}
            step={1}
            value={severityIndex}
            onChange={setSeverityIndex}
            formatValue={(value) => PAIN_SEVERITY_OPTIONS[value].label}
            tickCount={PAIN_SEVERITY_OPTIONS.length}
          />
          <p className="mt-2 min-h-8 text-xs leading-relaxed text-muted text-pretty">{selected.hint}</p>

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {busy ? "Sinalizando…" : `Sinalizar dor ${selected.label.toLowerCase()}`}
          </button>
        </>
      )}
    </Card>
  );
}

export default function DadosPessoaisPage() {
  const [profile, updateProfile] = useRunnerProfile();

  return (
    <>
      <ScreenHeader title="Dados pessoais" subtitle="Peso e dores — propriedades suas, não do app." />

      <Screen>
        <PainCard />

        <Card className="pr-enter" style={delay(90)}>
          <CardTitle aside={<NoticeBadge>opcional</NoticeBadge>}>Peso</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
            Só usado pra estimar calorias gastas em cada corrida (≈1 kcal/kg/km, mais o custo
            real de subida). Sem peso cadastrado, o app simplesmente não mostra a estimativa —
            nunca inventa um número em cima de um peso chutado.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="25"
              max="250"
              placeholder="Ex.: 70"
              value={profile.weightKg ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                updateProfile({ weightKg: value > 0 ? value : undefined });
              }}
              className="min-h-12 w-28 rounded-xl border border-border bg-background px-3 py-3 text-center font-mono text-sm tabular-nums outline-none focus:border-accent"
            />
            <span className="text-sm text-muted">kg</span>
          </div>
        </Card>

        <Link
          href="/perfil"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(120)}
        >
          Voltar pro perfil
        </Link>
      </Screen>
    </>
  );
}
