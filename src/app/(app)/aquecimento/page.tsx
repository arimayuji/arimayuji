"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WakeLockController } from "@/lib/tracking/wakeLock";
import { routineByType, totalDurationSeconds, type WarmupRoutine } from "@/lib/warmupRoutines";
import { useHeaderClose } from "../app-shell";
import { Card, Screen, ScreenHeader } from "../ui";

type PlayerPhase = "intro" | "playing" | "done";

function formatMinSec(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min` : `${seconds}s`;
}

/** Best-effort — never blocks the routine if unsupported, never a hard requirement like the pre-recorded voice bank used elsewhere in the app. No new recorded clips for this: exercise names vary per routine, so pre-recording would mean a growing clip list every time a step is added. */
function announceStepName(name: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(name);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  } catch {
    // Unsupported/blocked — the visual countdown already carries the routine.
  }
}

const RING_RADIUS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Big countdown ring — the "video-like" rhythm this feature was asked for comes from this ticking down and the auto-advance, not from any exercise-demo image/video (never generated here, see warmupRoutines.ts's own comment). */
function CountdownRing({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-4xl font-bold tabular-nums">{secondsLeft}</span>
      </div>
    </div>
  );
}

function IntroScreen({ routine, onStart }: { routine: WarmupRoutine; onStart: () => void }) {
  return (
    <Card>
      {/* No repeated <h1> here — ScreenHeader above already shows routine.title (found duplicated on screen, 2026-08-31). */}
      <p className="mb-4 text-xs leading-relaxed text-muted">{routine.rationale}</p>
      <p className="mb-3 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {routine.steps.length} passos · {formatMinSec(totalDurationSeconds(routine.steps))} no total
      </p>
      <ul className="mb-5 space-y-1.5">
        {routine.steps.map((step) => (
          <li key={step.id} className="flex items-center justify-between text-sm">
            <span>{step.name}</span>
            <span className="font-mono text-xs text-muted">{step.durationSeconds}s</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground"
      >
        Começar
      </button>
    </Card>
  );
}

function PlayerScreen({
  routine,
  stepIndex,
  secondsLeft,
  paused,
  onTogglePause,
  onSkip,
  onExit,
}: {
  routine: WarmupRoutine;
  stepIndex: number;
  secondsLeft: number;
  paused: boolean;
  onTogglePause: () => void;
  onSkip: () => void;
  onExit: () => void;
}) {
  const step = routine.steps[stepIndex];
  return (
    <Card>
      <p className="mb-4 text-center text-[11px] font-semibold tracking-wide text-muted uppercase">
        Passo {stepIndex + 1} de {routine.steps.length}
      </p>
      <CountdownRing secondsLeft={secondsLeft} totalSeconds={step.durationSeconds} />
      <h2 className="mt-4 text-center font-mono text-lg font-semibold text-balance">{step.name}</h2>
      <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-muted text-pretty">{step.instruction}</p>

      <div className="mt-5 flex justify-center gap-1.5">
        {routine.steps.map((s, i) => (
          <span
            key={s.id}
            className={`h-1.5 w-1.5 rounded-full ${i === stepIndex ? "bg-accent" : i < stepIndex ? "bg-border" : "bg-border/50"}`}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onTogglePause}
          className="rounded-full border border-accent bg-accent/10 px-5 py-2.5 text-xs font-semibold text-accent"
        >
          {paused ? "Continuar" : "Pausar"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-border px-5 py-2.5 text-xs font-medium text-muted hover:border-accent hover:text-foreground"
        >
          Pular passo
        </button>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="mt-4 block w-full text-center text-xs text-muted underline underline-offset-2"
      >
        Sair
      </button>
    </Card>
  );
}

function DoneScreen({ routine }: { routine: WarmupRoutine }) {
  return (
    <Card className="text-center">
      <h1 className="mb-2 font-mono text-xl font-semibold">Sessão concluída</h1>
      <p className="mb-6 text-sm text-muted">
        {routine.steps.length} passos · {formatMinSec(totalDurationSeconds(routine.steps))}
      </p>
      <Link
        href="/run"
        className="inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
      >
        Voltar
      </Link>
    </Card>
  );
}

export default function AquecimentoPage() {
  useHeaderClose("/run");

  const [tipo, setTipo] = useState<"aquecimento" | "alongamento">("aquecimento");
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("tipo");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL, same pattern as amigos/page.tsx's `?h=` read.
    if (fromQuery === "alongamento") setTipo("alongamento");
  }, []);

  const routine = routineByType(tipo);
  const [phase, setPhase] = useState<PlayerPhase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(routine.steps[0]?.durationSeconds ?? 0);
  const [paused, setPaused] = useState(false);
  const wakeLockRef = useRef<WakeLockController | null>(null);
  /** Kept in sync below so `advanceToNextStep` (called from a `setInterval` closure that only resubscribes on `phase`/`paused`) always advances from the real current step, without reading stale state from when the interval was set up. */
  const stepIndexRef = useRef(0);
  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (!wakeLockRef.current) wakeLockRef.current = new WakeLockController();
    void wakeLockRef.current.acquire();
    return () => {
      void wakeLockRef.current?.release();
    };
  }, [phase]);

  /**
   * Deliberately reads/writes `stepIndexRef` rather than `setStepIndex(prev => ...)`
   * with side effects (announcing, resetting the timer) tucked inside the
   * updater — React updater functions are expected to be pure, and Strict
   * Mode's double-invoke-to-check-purity would otherwise double-announce
   * the next step's name in dev.
   */
  const advanceToNextStep = useCallback(() => {
    const nextIndex = stepIndexRef.current + 1;
    if (nextIndex >= routine.steps.length) {
      setPhase("done");
      return;
    }
    stepIndexRef.current = nextIndex;
    setStepIndex(nextIndex);
    setSecondsLeft(routine.steps[nextIndex].durationSeconds);
    announceStepName(routine.steps[nextIndex].name);
  }, [routine]);

  useEffect(() => {
    if (phase !== "playing" || paused) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          advanceToNextStep();
          return prev;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, paused, advanceToNextStep]);

  const handleStart = () => {
    setStepIndex(0);
    setSecondsLeft(routine.steps[0].durationSeconds);
    announceStepName(routine.steps[0].name);
    setPaused(false);
    setPhase("playing");
  };

  const handleExit = () => {
    if (window.confirm("Sair da sessão? O progresso não fica salvo.")) {
      setPhase("intro");
    }
  };

  return (
    <>
      <ScreenHeader title={routine.title} />
      <Screen>
        {phase === "intro" && <IntroScreen routine={routine} onStart={handleStart} />}
        {phase === "playing" && (
          <PlayerScreen
            routine={routine}
            stepIndex={stepIndex}
            secondsLeft={secondsLeft}
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            onSkip={advanceToNextStep}
            onExit={handleExit}
          />
        )}
        {phase === "done" && <DoneScreen routine={routine} />}
      </Screen>
    </>
  );
}
