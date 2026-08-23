"use client";

import Link from "next/link";

/**
 * Where the landing's "Entrar no TestFlight" button points, instead of
 * straight at the raw testflight.apple.com link — same reasoning as
 * `/download` for Android: a bare deep link with zero context reads as a
 * dead end to anyone who doesn't already know what TestFlight is or that
 * they need to install it first. This page exists to close that gap before
 * handing off to the real link.
 */

const TESTFLIGHT_URL = "https://testflight.apple.com/join/RMqtChWj";

function AppleGlyphIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.417 2.196-1.244 3.06-.9.94-2.276 1.657-3.436 1.564-.144-1.096.437-2.24 1.216-3.024.87-.887 2.34-1.545 3.464-1.6zM20.5 17.313c-.505 1.157-.747 1.674-1.396 2.703-.907 1.44-2.187 3.234-3.774 3.246-1.412.012-1.775-.917-3.69-.906-1.916.012-2.317.923-3.73.911-1.586-.012-2.798-1.633-3.706-3.073-2.54-4.01-2.808-8.716-1.24-11.222 1.113-1.78 2.874-2.821 4.531-2.821 1.686 0 2.747.938 4.142.938 1.353 0 2.178-.94 4.132-.94 1.478 0 3.042.804 4.157 2.194-3.653 2.002-3.06 7.216.574 8.97z" />
    </svg>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/12 font-mono text-xs font-semibold text-accent">
      {n}
    </span>
  );
}

export default function DownloadIosPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-foreground">
        Xanthus
      </Link>

      <div className="mt-10 flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/12 text-accent">
          <AppleGlyphIcon />
        </span>
        <h1 className="mt-4 font-mono text-2xl font-semibold text-balance">Testar o Xanthus no iPhone</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          O app nativo já roda no iPhone — mesmo GPS confiável, sem pausar com
          a tela travada. Só que ainda não está na App Store: enquanto isso, a
          Apple exige que a instalação passe pelo TestFlight, o app oficial
          dela pra testar apps antes do lançamento.
        </p>

        <a
          href={TESTFLIGHT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Entrar no TestFlight
        </a>
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-background/60 p-5">
        <h2 className="font-mono text-sm font-semibold">Como funciona</h2>
        <ol className="mt-4 flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <StepNumber n={1} />
            <p className="text-sm leading-relaxed text-muted">
              Se ainda não tem, instale o <strong className="text-foreground">TestFlight</strong> —
              é grátis, é da própria Apple, está na App Store normal.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={2} />
            <p className="text-sm leading-relaxed text-muted">
              Toque em <strong className="text-foreground">Entrar no TestFlight</strong> acima
              — o link abre dentro do próprio TestFlight.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={3} />
            <p className="text-sm leading-relaxed text-muted">
              Toque em <strong className="text-foreground">Aceitar</strong> e depois em{" "}
              <strong className="text-foreground">Instalar</strong> — o Xanthus aparece na
              tela inicial como qualquer outro app.
            </p>
          </li>
        </ol>
      </div>

      <details className="mt-4 rounded-2xl border border-border bg-background/60 p-5">
        <summary className="cursor-pointer font-mono text-sm font-semibold marker:content-none">
          Por que preciso de outro app pra instalar?
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
          É uma regra da própria Apple, não uma limitação do Xanthus: todo app
          em teste (antes de passar pela revisão completa da App Store)
          só pode ser instalado através do TestFlight, nunca direto pela App
          Store. Depois que o Xanthus passar por essa revisão — sem prazo
          definido ainda — a instalação vira uma busca normal na App Store,
          sem esse passo extra.
        </p>
      </details>
    </main>
  );
}
