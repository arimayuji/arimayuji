"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Where the "Baixar" button on the landing page and any shared link points
 * now, instead of straight at the raw binary — hitting the `.apk` URL
 * directly handed the browser's own generic "baixar de novo?" dialog with
 * zero context, which is what this page exists to replace. Every link here
 * is relative (`/download/...`), never the hardcoded
 * `xanthus.yujiarima.workers.dev` host the raw binary link used to carry —
 * so this keeps working unchanged the moment `xanthus.app.br` (or any other
 * domain) serves the same Worker.
 *
 * The app has been on the Play Store (Teste Fechado - Alpha track) since
 * 2026-08-25, via this same Google Group. That's the primary path now — it
 * gets Play Store auto-updates and skips the "fonte desconhecida" warnings
 * entirely — with the raw APK kept only as a fallback for whoever doesn't
 * want to join a Google group just to install a running app.
 */
const BETA_GROUP_URL = "https://groups.google.com/g/xanthus-runner-tester";
const BETA_OPTIN_URL = "https://play.google.com/apps/testing/com.xanthus.app";

interface VersionInfo {
  versionCode: number;
  versionName: string;
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M6.5 9.5v6M17.5 9.5v6M8 8h8v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8ZM9.5 8 8 5.2M14.5 8 16 5.2M10 5h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export default function DownloadPage() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/download/version.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: VersionInfo) => {
        if (!cancelled) setVersion(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-foreground">
        Xanthus
      </Link>

      <div className="mt-10 flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/12 text-accent">
          <AndroidIcon />
        </span>
        <h1 className="mt-4 font-mono text-2xl font-semibold text-balance">Baixar o Xanthus</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          App nativo pra Android — o GPS continua registrando rota e pace mesmo
          com a tela travada. Em Teste Fechado na própria Play Store: dois
          passos rápidos e você instala e atualiza por lá, sem download avulso.
        </p>

        <p className="mt-3 font-mono text-xs text-muted">
          {failed
            ? "Última versão publicada"
            : version
              ? `Versão ${version.versionName}`
              : "Carregando versão…"}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <h2 className="font-mono text-sm font-semibold">Instalar pela Play Store</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Atualização automática, sem avisos de &quot;fonte desconhecida&quot;.
        </p>
        <ol className="mt-4 flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <StepNumber n={1} />
            <p className="text-sm leading-relaxed text-muted">
              Entra no{" "}
              <a href={BETA_GROUP_URL} className="font-semibold text-accent underline underline-offset-2">
                grupo de testadores
              </a>{" "}
              — não precisa pedir aprovação, é na hora.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={2} />
            <p className="text-sm leading-relaxed text-muted">
              Depois de entrar, abre{" "}
              <a href={BETA_OPTIN_URL} className="font-semibold text-accent underline underline-offset-2">
                esse link do Google Play
              </a>{" "}
              e aceita o convite — a ordem importa, só funciona depois do
              passo 1.
            </p>
          </li>
        </ol>
        <a
          href={BETA_GROUP_URL}
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Entrar no grupo de testadores
        </a>
      </div>

      <details className="mt-6 rounded-2xl border border-border bg-background/60 p-5">
        <summary className="cursor-pointer font-mono text-sm font-semibold">
          Prefere não entrar no grupo? Baixe o APK direto
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Funciona igual, mas sem atualização automática — você precisa voltar
          aqui pra baixar cada versão nova.
        </p>
        <a
          href="/download/xanthus.apk"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-border px-5 py-3.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
        >
          Baixar APK
        </a>
        <ol className="mt-4 flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <StepNumber n={1} />
            <p className="text-sm leading-relaxed text-muted">
              Toque em <strong className="text-foreground">Baixar APK</strong> acima
              e espere o download terminar.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={2} />
            <p className="text-sm leading-relaxed text-muted">
              Abra o arquivo baixado. Se o Chrome avisar que o app não é
              comum, toque em <strong className="text-foreground">Baixar mesmo assim</strong> — o
              aviso aparece pra qualquer app fora da Play Store, não é um
              problema com o Xanthus.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={3} />
            <p className="text-sm leading-relaxed text-muted">
              Se o Android pedir permissão pra instalar apps de fontes
              desconhecidas, ative só pra esse navegador e toque em{" "}
              <strong className="text-foreground">Instalar</strong>.
            </p>
          </li>
        </ol>
      </details>
    </main>
  );
}
