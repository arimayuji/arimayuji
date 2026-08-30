"use client";

import { useState } from "react";
import Link from "next/link";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, NoticeBadge, PreferenceToggle, Screen, ScreenHeader } from "../../ui";
import { useAuth } from "@/lib/useAuth";
import { updateProfile } from "@/lib/auth";
import { syncRunnerProfile } from "@/lib/runnerProfileSync";
import { backfillRunSummaries } from "@/lib/runSummariesSync";
import { listCompletedRuns } from "@/lib/tracking/storage";

/**
 * Consent screen for cross-device sync of the goal/plan (`RunnerProfile`)
 * and a lightweight per-run summary (date/distance/moving time — never the
 * GPS trace) — off by default, same reasoning as `/perfil/relogio`'s health
 * consent: this is personal data leaving the device for the first time,
 * so it needs its own explicit switch, not just "being signed in already
 * covers it" (signing in today only ever unlocked amigos/treinador/longão,
 * never this).
 *
 * Conflict rule is last-write-wins by timestamp, not a merge — deliberately
 * simple (see `runnerProfileSync.ts`'s own header comment), so this screen
 * says that plainly rather than implying anything smarter is happening.
 */
export default function SincronizacaoPage() {
  useHeaderClose("/perfil");
  const { status, account, profile, refresh } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const optedIn = profile?.runSyncOptIn ?? false;

  async function handleToggle(next: boolean) {
    if (!account || saving) return;
    setSaving(true);
    setError(false);
    try {
      await updateProfile(account.id, { runSyncOptIn: next });
      await refresh();
      if (next) {
        setBackfilling(true);
        await syncRunnerProfile();
        const runs = await listCompletedRuns();
        await backfillRunSummaries(runs);
        setBackfilling(false);
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScreenHeader title="Sincronização entre aparelhos" />

      <Screen>
        <Card className="pr-enter" style={delay(20)}>
          <CardTitle aside={<NoticeBadge>{optedIn ? "ativado" : "desligado"}</NoticeBadge>}>
            Sincronizar plano e histórico
          </CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
            Sua meta de prova, tempo recente e um resumo de cada corrida (data, distância, tempo em
            movimento) passam a existir também na nuvem — não só no aparelho que gravou. O traçado
            GPS de cada corrida nunca sai do aparelho.
          </p>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Ligar isso é o que deixa outro aparelho (por exemplo, um navegador no computador) ver o
            mesmo plano e o mesmo progresso — hoje cada aparelho guarda o seu, sem saber do outro.
          </p>

          {status !== "signed-in" ? (
            <p className="text-xs text-muted">Precisa de conta pra sincronizar (Google ou Apple, em Conta).</p>
          ) : (
            <>
              <PreferenceToggle
                label="Sincronizar entre aparelhos"
                hint="desligado por padrão — liga aqui, em qualquer aparelho"
                checked={optedIn}
                onChange={handleToggle}
              />
              {backfilling && (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Enviando seu histórico já gravado…
                </p>
              )}
              {error && (
                <p className="mt-2 text-xs leading-relaxed text-bad">
                  Não deu pra salvar agora — tenta de novo em instantes.
                </p>
              )}
            </>
          )}
        </Card>

        <Card className="pr-enter" style={delay(40)}>
          <CardTitle>Como o conflito é resolvido</CardTitle>
          <p className="text-xs leading-relaxed text-muted text-pretty">
            Se você editar a meta em dois aparelhos antes de sincronizar, a edição mais recente
            vence e a outra é descartada — não existe uma tela pra escolher qual manter. Isso é
            raro na prática (editar meta não é algo que se faz todo dia), e é a troca consciente
            por nunca precisar resolver um conflito na mão.
          </p>
        </Card>

        <Link
          href="/perfil"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(100)}
        >
          Voltar pro perfil
        </Link>
      </Screen>
    </>
  );
}
