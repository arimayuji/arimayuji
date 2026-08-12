"use client";

import { useState } from "react";

const STORAGE_KEY = "xanthus:run-tips-seen";

/** Read lazily inside the start-run click handler — this never gates a render, so no hydration dance needed. */
export function hasSeenRunTips(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // storage disabled: don't block starting a run over it
  }
}

export function markRunTipsSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // not persisted: the checklist just reappears next time, harmless
  }
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function StepIcon({ children }: { children: React.ReactElement }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true" {...STROKE}>
      {children}
    </svg>
  );
}

interface Step {
  title: string;
  body: string;
  icon: React.ReactElement;
}

/**
 * What actually breaks GPS tracking mid-run on iOS Safari (researched, not
 * guessed): the app leaving the foreground, full stop — no OS setting
 * un-breaks that for a web app. So the tips target the *causes* of leaving
 * the foreground the runner controls (touching the phone to skip a song,
 * an unfiltered call taking over the screen), plus one honest disclaimer
 * for what's left over once those are handled.
 */
const STEPS: Step[] = [
  {
    title: "Deixe o app aberto",
    body: "O GPS só grava enquanto o Xanthus está na tela. Trocar de app ou travar a tela pausa o rastreio.",
    icon: (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
        <path d="M11 18.5h2" />
      </>
    ),
  },
  {
    title: "Troque de música pelo fone",
    body: "Usa os botões do fone de ouvido pra pular faixa — abrir o app de música na tela tira o Xanthus de primeiro plano.",
    icon: (
      <>
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <rect x="2.5" y="13" width="4" height="6.5" rx="1.6" />
        <rect x="17.5" y="13" width="4" height="6.5" rx="1.6" />
      </>
    ),
  },
  {
    title: "Ative o Foco antes de sair",
    body: "Com o Foco ligado, ligação de quem não tá na lista de permitidos não toma a tela inteira no meio da corrida.",
    icon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />,
  },
  {
    title: "Se algo escapar, a gente avisa",
    body: "Se a tela travar mesmo assim, o Xanthus marca o trecho sem sinal no mapa — nada de dado inventado.",
    icon: (
      <>
        <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ),
  },
];

/**
 * Shown once, the first time someone taps "Iniciar corrida" — gated in
 * run/page.tsx via `hasSeenRunTips`, not auto-played on load like the brand
 * splash. Each step needs an explicit tap to advance; there's no
 * auto-advance timer, on purpose — a checklist that scrolls past on its own
 * teaches nothing and just becomes something to dismiss.
 */
export function RunOnboarding({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const advance = () => {
    if (isLast) {
      onDone();
      return;
    }
    setIndex((i) => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="flex justify-end px-5 pt-4">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted transition-colors hover:text-foreground"
        >
          Pular
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div key={index} className="pr-enter flex flex-col items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <StepIcon>{step.icon}</StepIcon>
          </span>
          <h2 className="font-mono text-xl font-semibold text-balance">{step.title}</h2>
          <p className="max-w-xs text-sm leading-relaxed text-muted">{step.body}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 px-6 pb-10">
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-accent" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={advance}
          className="w-full max-w-xs rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
        >
          {isLast ? "Vamos correr!" : "Entendi"}
        </button>
      </div>
    </div>
  );
}
