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
import type { RunnerProfile } from "@/lib/runnerProfile";

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

const WEIGHT_MIN_KG = 30;
const WEIGHT_MAX_KG = 150;
const WEIGHT_DEFAULT_KG = 70;

/**
 * Was a plain number input; a slider reads faster on a running app (drag
 * once vs. type digits) and matches the `PillSlider` already used for pain
 * intensity above. Range is 30–150 kg — a slider's whole point is a quick
 * drag, so a range built for the overwhelming majority of runners beats the
 * old input's 25–250 kg, which existed only because a text field has no
 * cost to supporting edge cases.
 *
 * Keeps the "never invents a number" rule from the old copy: with no weight
 * saved yet, this shows a prompt rather than a slider already parked on some
 * value that would read as a real, if never-touched, answer.
 */
function WeightCard({
  profile,
  updateProfile,
}: {
  profile: RunnerProfile;
  updateProfile: (patch: Partial<RunnerProfile>) => void;
}) {
  const hasWeight = profile.weightKg != null;

  return (
    <Card className="pr-enter" style={delay(90)}>
      <CardTitle aside={<NoticeBadge>opcional</NoticeBadge>}>Peso</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Só usado pra estimar calorias gastas em cada corrida (≈1 kcal/kg/km, mais o custo
        real de subida). Sem peso cadastrado, o app simplesmente não mostra a estimativa —
        nunca inventa um número em cima de um peso chutado.
      </p>

      {hasWeight ? (
        <>
          <PillSlider
            min={WEIGHT_MIN_KG}
            max={WEIGHT_MAX_KG}
            step={1}
            value={profile.weightKg!}
            onChange={(value) => updateProfile({ weightKg: value })}
            formatValue={(value) => `${value} kg`}
            tickCount={5}
          />
          <button
            type="button"
            onClick={() => updateProfile({ weightKg: undefined })}
            className="mt-3 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
          >
            Remover peso cadastrado
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => updateProfile({ weightKg: WEIGHT_DEFAULT_KG })}
          className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-accent"
        >
          Definir peso
        </button>
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

        <WeightCard profile={profile} updateProfile={updateProfile} />

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
