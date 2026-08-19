"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  side?: "E" | "D";
  cx: number;
  cy: number;
}

/** The running-specific injury sites a tap-to-select diagram actually needs — shoulders down to ankles, the same list a physio would ask about after an overuse complaint. */
const BODY_ZONES: BodyZone[] = [
  { id: "ombro-e", label: "Ombro", side: "E", cx: 32, cy: 66 },
  { id: "ombro-d", label: "Ombro", side: "D", cx: 128, cy: 66 },
  { id: "lombar", label: "Lombar", cx: 80, cy: 138 },
  { id: "quadril", label: "Quadril", cx: 80, cy: 172 },
  { id: "coxa-e", label: "Coxa", side: "E", cx: 58, cy: 225 },
  { id: "coxa-d", label: "Coxa", side: "D", cx: 102, cy: 225 },
  { id: "joelho-e", label: "Joelho", side: "E", cx: 56, cy: 272 },
  { id: "joelho-d", label: "Joelho", side: "D", cx: 104, cy: 272 },
  { id: "canela-e", label: "Canela", side: "E", cx: 55, cy: 315 },
  { id: "canela-d", label: "Canela", side: "D", cx: 105, cy: 315 },
  { id: "tornozelo-e", label: "Tornozelo", side: "E", cx: 54, cy: 350 },
  { id: "tornozelo-d", label: "Tornozelo", side: "D", cx: 106, cy: 350 },
];

type BodyZoneId = string;

function zoneLabel(zone: BodyZone): string {
  return zone.side ? `${zone.label} ${zone.side}` : zone.label;
}

/** Front-view silhouette traced once from the design handoff, recolored with `currentColor`/opacity so it follows the app's own light/dark tokens instead of the mock's hardcoded dark-theme rgba values. */
function BodyDiagram({
  zoneId,
  onSelect,
}: {
  zoneId: BodyZoneId | null;
  onSelect: (id: BodyZoneId | null) => void;
}) {
  return (
    <svg viewBox="0 0 160 365" className="mx-auto block h-auto w-full max-w-[190px]" aria-hidden="true">
      <g className="fill-foreground/20 stroke-foreground/55" strokeWidth={1.8} strokeLinejoin="round">
        <ellipse cx={80} cy={26} rx={17} ry={20} />
        <path d="M71 42 L71 56 L89 56 L89 42" />
        <path d="M80 56 C60 56 48 62 42 74 C38 82 36 92 37 102 L22 148 C19 158 25 166 33 163 C37 161 39 157 41 152 L52 116 C50 132 48 148 45 164 L36 240 C34 250 42 257 50 251 C54 248 56 243 57 237 L68 233 L92 233 L103 237 C104 243 106 248 110 251 C118 257 126 250 124 240 L115 164 C112 148 110 132 108 116 L119 152 C121 157 123 161 127 163 C135 166 141 158 138 148 L123 102 C124 92 122 82 118 74 C112 62 100 56 80 56 Z" />
        <path d="M57 237 C54 258 52 278 50 296 C49 305 48 314 47 322 C46 330 52 335 57 330 C60 327 61 322 62 316 L68 262 L68 240 Z M103 237 C106 258 108 278 110 296 C111 305 112 314 113 322 C114 330 108 335 103 330 C100 327 99 322 98 316 L92 262 L92 240 Z" />
        <path
          d="M47 322 C44 326 42 332 48 334 L60 334 C61 330 60 326 59 322 Z M113 322 C116 326 118 332 112 334 L100 334 C99 330 100 326 101 322 Z"
          strokeWidth={1.6}
        />
      </g>
      <g className="stroke-foreground/35" strokeWidth={1.1} fill="none">
        <path d="M56 66 C64 61 72 59 80 59 C88 59 96 61 104 66 M62 82 C65 90 70 96 80 98 C90 96 95 90 98 82 M80 78 L80 112 M68 116 L68 172 M92 116 L92 172 M68 132 L92 132 M68 152 L92 152 M50 100 C54 116 58 132 62 148 M110 100 C106 116 102 132 98 148" />
        <path d="M45 90 C42 100 40 112 40 122 M39 128 C38 138 39 148 41 156 M115 90 C118 100 120 112 120 122 M121 128 C122 138 121 148 119 156" />
        <path d="M60 190 C58 208 56 224 57 237 M75 185 L75 235 M90 190 C92 208 94 224 93 237 M50 296 C48 306 50 314 55 320 M60 300 C58 310 58 318 60 326 M110 296 C112 306 110 314 105 320 M100 300 C102 310 102 318 100 326" />
      </g>
      {BODY_ZONES.map((zone) => {
        const active = zoneId === zone.id;
        return (
          <circle
            key={zone.id}
            cx={zone.cx}
            cy={zone.cy}
            r={active ? 9 : 7}
            strokeWidth={2}
            tabIndex={0}
            role="button"
            aria-label={zoneLabel(zone)}
            aria-pressed={active}
            className={`cursor-pointer outline-none transition-[r] ${
              active ? "fill-accent stroke-accent" : "fill-foreground/50 stroke-foreground/70 hover:fill-accent/70"
            }`}
            onClick={() => onSelect(active ? null : zone.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(active ? null : zone.id);
              }
            }}
          />
        );
      })}
    </svg>
  );
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
    await reportPain({ severity: selected.value, region: selectedZone ? zoneLabel(selectedZone) : undefined });
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
          <div className="mb-4 rounded-2xl bg-background pt-2 pb-3">
            <BodyDiagram zoneId={zoneId} onSelect={setZoneId} />
            <p
              className={`mt-1 text-center text-sm font-bold ${selectedZone ? "text-foreground" : "text-muted font-semibold"}`}
            >
              {selectedZone ? zoneLabel(selectedZone) : "Toque no local da dor (opcional)"}
            </p>
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
