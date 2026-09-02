"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, NoticeBadge, PillTabs, Screen, ScreenHeader } from "../../ui";
import { PillSlider } from "../../pill-slider";
import { ModalPortal } from "../../modal-portal";
import { usePreferences } from "@/lib/usePreferences";
import {
  listPainCheckIns,
  reportPain,
  type PainCheckIn,
  type PainSeverity,
} from "@/lib/tracking/storage";
import { activePainSignal } from "@/lib/plan";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import type { RunnerProfile } from "@/lib/runnerProfile";
import { ShoesCard } from "../shoes-card";
import { PlaylistCard } from "../playlist-card";
import { HealthDataCard } from "../health-data-card";

/**
 * Split out of `/perfil` on request: everything here is a property of the
 * athlete/account (corpo, tênis, playlists, dado de saúde), not an app
 * setting — sitting mixed in with run-experience preferences made the main
 * screen read as one long undifferentiated list ("tem muita coisa na aba de
 * perfil"). Reached from the "Conta" card rather than the bottom nav — this
 * widget has no destination of its own beyond these four tabs.
 */

type DataTab = "corpo" | "tenis" | "playlists" | "relogio";

const DATA_TABS: { id: DataTab; label: string }[] = [
  { id: "corpo", label: "Corpo" },
  { id: "tenis", label: "Tênis" },
  { id: "playlists", label: "Playlists" },
  { id: "relogio", label: "Saúde do relógio" },
];

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
  const [zoneQuery, setZoneQuery] = useState("");
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
    setZoneQuery("");
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
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(60)}
    >
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
          {selectedZone ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{selectedZone.label}</span>
                {selectedZone.hint && <span className="block text-[11px] text-muted">{selectedZone.hint}</span>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setZoneId(null);
                  setZoneQuery("");
                }}
                aria-label={`Remover ${selectedZone.label}`}
                className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="mb-4">
              <input
                type="text"
                value={zoneQuery}
                onChange={(event) => setZoneQuery(event.target.value)}
                placeholder="Buscar (ex.: joelho, lombar…)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {zoneQuery.trim() && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {BODY_ZONES.filter((zone) => zone.label.toLowerCase().includes(zoneQuery.trim().toLowerCase())).map(
                    (zone) => (
                      <li key={zone.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setZoneId(zone.id);
                            setZoneQuery("");
                          }}
                          className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left hover:bg-background"
                        >
                          <span className="text-sm font-medium">{zone.label}</span>
                          {zone.hint && <span className="text-[11px] text-muted">{zone.hint}</span>}
                        </button>
                      </li>
                    ),
                  )}
                  {BODY_ZONES.every((zone) => !zone.label.toLowerCase().includes(zoneQuery.trim().toLowerCase())) && (
                    <li className="px-2.5 py-2 text-xs text-muted">Nada encontrado.</li>
                  )}
                </ul>
              )}
            </div>
          )}

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
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(90)}
    >
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
  const [prefs] = usePreferences();
  const [tab, setTab] = useState<DataTab>("corpo");

  const trackRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<DataTab, HTMLDivElement | null>>({
    corpo: null,
    tenis: null,
    playlists: null,
    relogio: null,
  });
  /** Set right before a programmatic `scrollIntoView` (tapping a pill) so the scroll listener below doesn't fight it mid-animation by "correcting" `tab` back from whatever panel is passing under the viewport. Cleared once the smooth scroll settles. */
  const programmaticScrollRef = useRef(false);

  const goToTab = useCallback((next: DataTab) => {
    setTab(next);
    programmaticScrollRef.current = true;
    panelRefs.current[next]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 500);
  }, []);

  // Swiping between panels updates which pill reads as active — same
  // "one state, two ways to change it" relationship as a native iOS
  // settings carousel (tap a dot, or swipe; either one syncs the other).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      const next = DATA_TABS[index]?.id;
      if (next) setTab((current) => (current === next ? current : next));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <ScreenHeader panel title="Dados pessoais" />

      <Screen panel>
        <div className="pr-enter mb-4">
          <PillTabs tabs={DATA_TABS} active={tab} onChange={goToTab} />
        </div>

        <div ref={trackRef} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
          <div
            ref={(el) => {
              panelRefs.current.corpo = el;
            }}
            className="flex w-full shrink-0 snap-start flex-col gap-5 lg:gap-4"
          >
            <PainCard />
            <WeightCard profile={profile} updateProfile={updateProfile} />
          </div>

          <div
            ref={(el) => {
              panelRefs.current.tenis = el;
            }}
            className="w-full shrink-0 snap-start"
          >
            <ShoesCard unit={prefs.distanceUnit} />
          </div>

          <div
            ref={(el) => {
              panelRefs.current.playlists = el;
            }}
            className="w-full shrink-0 snap-start"
          >
            <PlaylistCard />
          </div>

          <div
            ref={(el) => {
              panelRefs.current.relogio = el;
            }}
            className="w-full shrink-0 snap-start"
          >
            <HealthDataCard />
          </div>
        </div>

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
