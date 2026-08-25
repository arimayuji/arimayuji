"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Where the "Baixar APK" button on the landing page and any shared link
 * points now, instead of straight at the raw binary — hitting the `.apk`
 * URL directly handed the browser's own generic "baixar de novo?" dialog
 * with zero context, which is what this page exists to replace. Every link
 * here is relative (`/download/...`), never the hardcoded
 * `xanthus.yujiarima.workers.dev` host the raw binary link used to carry —
 * so this keeps working unchanged the moment `xanthus.app.br` (or any other
 * domain) serves the same Worker.
 */

/**
 * Fill these in once the Google Group exists (groups.google.com — create
 * one set to "qualquer pessoa pode entrar", no approval needed) and the
 * Closed Testing track's "Testers" tab is switched from an email list to
 * that group. `BETA_OPTIN_URL` is the link Play Console shows on that same
 * tab once a group is configured (looks like
 * play.google.com/apps/testing/com.xanthus.app). Two links, two steps —
 * joining the group alone doesn't enroll anyone; they still need to accept
 * on the Play link afterward. This section renders nothing until both are set.
 */
const BETA_GROUP_URL: string | null = null;
const BETA_OPTIN_URL: string | null = null;

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
          com a tela travada. Ainda não está na Play Store, então a instalação
          é direta, pelo arquivo abaixo.
        </p>

        <p className="mt-3 font-mono text-xs text-muted">
          {failed
            ? "Última versão publicada"
            : version
              ? `Versão ${version.versionName}`
              : "Carregando versão…"}
        </p>

        <a
          href="/download/xanthus.apk"
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Baixar APK
        </a>
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-background/60 p-5">
        <h2 className="font-mono text-sm font-semibold">Como instalar</h2>
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
      </div>

      {BETA_GROUP_URL && BETA_OPTIN_URL && (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
          <h2 className="font-mono text-sm font-semibold">Quer testar antes de todo mundo?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Instala pela própria Play Store em vez do APK — recebe atualização
            automática, sem os avisos de &quot;fonte desconhecida&quot; acima.
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
        </div>
      )}
    </main>
  );
}
