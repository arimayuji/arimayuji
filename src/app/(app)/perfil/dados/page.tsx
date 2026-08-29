"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";
import { PillSlider } from "../../pill-slider";
import { ModalPortal } from "../../modal-portal";
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

interface BodyZone {
  id: string;
  label: string;
  hint?: string;
}

/** The running-specific injury sites a physio would ask about after an overuse complaint. Only the two names that aren't self-explanatory ("Lombar", "Canela") carry a hint. */
const BODY_ZONES: BodyZone[] = [
  { id: "ombro-e", label: "Ombro esquerdo" },
  { id: "ombro-d", label: "Ombro direito" },
  { id: "lombar", label: "Lombar", hint: "parte baixa das costas" },
  { id: "quadril", label: "Quadril" },
  { id: "coxa-e", label: "Coxa esquerda" },
  { id: "coxa-d", label: "Coxa direita" },
  { id: "joelho-e", label: "Joelho esquerdo" },
  { id: "joelho-d", label: "Joelho direito" },
  { id: "canela-e", label: "Canela esquerda", hint: "frente da perna, abaixo do joelho" },
  { id: "canela-d", label: "Canela direita", hint: "frente da perna, abaixo do joelho" },
  { id: "tornozelo-e", label: "Tornozelo esquerdo" },
  { id: "tornozelo-d", label: "Tornozelo direito" },
];

type BodyZoneId = string;

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
  const [zoneId, setZoneId] = useState<BodyZoneId | null>(null);
  const [severityIndex, setSeverityIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => listPainCheckIns().then(setCheckIns), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = checkIns ? activePainSignal(checkIns) : null;
  const selected = PAIN_SEVERITY_OPTIONS[severityIndex];
  const selectedZone = BODY_ZONES.find((zone) => zone.id === zoneId) ?? null;

  const submit = async () => {
    setBusy(true);
    await reportPain({ severity: selected.value, region: selectedZone?.label });
    setZoneId(null);
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
          <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Onde dói (opcional)
          </span>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {BODY_ZONES.map((zone) => {
              const active = zoneId === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setZoneId(active ? null : zone.id)}
                  aria-pressed={active}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-background text-foreground hover:border-accent"
                  }`}
                >
                  <span className="block text-sm font-medium">{zone.label}</span>
                  {zone.hint && (
                    <span className={`block text-[11px] ${active ? "text-accent-foreground/80" : "text-muted"}`}>
                      {zone.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

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
 * The stepper sheet mirrors the design handoff's bottom-sheet weight picker
 * (same shell `GoalDatePicker`/`SortSheet` use) rather than the old inline
 * slider — a modal makes sense here because setting weight is a rare,
 * deliberate edit, not something glanced at inline like the pain intensity
 * pills above.
 *
 * Keeps the "never invents a number" rule from the old copy: with no weight
 * saved yet, this shows a prompt rather than a sheet already parked on some
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(profile.weightKg ?? WEIGHT_DEFAULT_KG);

  const openSheet = () => {
    setDraft(profile.weightKg ?? WEIGHT_DEFAULT_KG);
    setOpen(true);
  };

  const save = () => {
    updateProfile({ weightKg: draft });
    setOpen(false);
  };

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
          <div className="flex items-center justify-between gap-3">
            <p className="text-metal font-mono text-2xl tabular-nums">
              {profile.weightKg}
              <span className="ml-1 text-sm text-muted">kg</span>
            </p>
            <button
              type="button"
              onClick={openSheet}
              className="shrink-0 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent"
            >
              Editar
            </button>
          </div>
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
          onClick={openSheet}
          className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-accent"
        >
          Definir peso
        </button>
      )}

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Definir peso"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-background p-5 pb-8 text-foreground sm:rounded-3xl"
            >
              <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-border" />
              <p className="mb-6 text-center text-base font-bold">Definir peso</p>
              <div className="mb-7 flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={() => setDraft((value) => Math.max(WEIGHT_MIN_KG, value - 1))}
                  aria-label="Diminuir peso"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl font-bold hover:border-accent"
                >
                  –
                </button>
                <p className="min-w-28 text-center font-mono text-4xl font-extrabold tabular-nums">
                  {draft}
                  <span className="ml-1 text-base font-semibold text-muted">kg</span>
                </p>
                <button
                  type="button"
                  onClick={() => setDraft((value) => Math.min(WEIGHT_MAX_KG, value + 1))}
                  aria-label="Aumentar peso"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl font-bold hover:border-accent"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={save}
                className="min-h-12 w-full rounded-full bg-accent px-4 py-3 text-sm font-bold text-accent-foreground"
              >
                Salvar
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </Card>
  );
}

export default function DadosPessoaisPage() {
  useHeaderClose("/perfil");
  const [profile, updateProfile] = useRunnerProfile();

  return (
    <>
      <ScreenHeader panel title="Dados pessoais" />

      <Screen panel>
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
