"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listCoachConnections,
  proposeCoachRelationship,
  removeCoachRelationship,
  respondToCoachRequest,
  type CoachConnection,
  type MyCoachRole,
} from "@/lib/coachRelationships";
import { normalizeHandle } from "@/lib/friendships";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { useHeaderClose } from "../app-shell";
import { Avatar } from "../avatar";
import { Card, CardTitle, delay, EmptyState, NoticeBadge, PillTabs, Screen, ScreenHeader, SPAN_COLUMNS } from "../ui";

const RETURN_TO = "/treinador";

type CoachTab = "convites" | "treinadores" | "alunos";

const COACH_TABS = [
  { id: "convites", label: "Convites" },
  { id: "treinadores", label: "Treinadores" },
  { id: "alunos", label: "Alunos" },
] as const;

const SEND_ERRORS: Record<string, string> = {
  "not-found": "Ninguém com esse @ por aqui. Confere a escrita — o @ é o mesmo que a pessoa escolheu ao criar a conta.",
  self: "Esse @ é o seu.",
  duplicate: "Já existe um convite ou uma relação em aberto com essa pessoa nesse papel.",
  unavailable: "Os recursos de conta estão indisponíveis agora.",
  failed: "Não deu pra enviar agora — tenta de novo em instantes.",
};

function PersonRow({ connection, children }: { connection: CoachConnection; children: React.ReactNode }) {
  const { profile } = connection;
  return (
    <li className="flex items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <Avatar name={profile?.displayName ?? "?"} avatarUrl={profile?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{profile?.displayName ?? "Corredor(a)"}</p>
        <p className="truncate font-mono text-xs text-muted">
          {profile ? `@${profile.handle}` : "conta sem @ ainda"}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

/** What the *other* person's role is, from my point of view — the mirror of `connection.myRole`. */
function otherRoleLabel(myRole: MyCoachRole): string {
  return myRole === "coach" ? "seu aluno" : "seu treinador";
}

export default function TreinadorPage() {
  useHeaderClose("/perfil");
  const { status } = useAuth();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [connections, setConnections] = useState<CoachConnection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [handle, setHandle] = useState("");
  const [inviteRole, setInviteRole] = useState<MyCoachRole>("student");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad"; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which of the two actions on the *same* incoming request `busyId` is currently mid-flight — `busyId` alone can't tell Aceitar and Recusar's busy labels apart, since both buttons share it. */
  const [busyAction, setBusyAction] = useState<"accept" | "decline" | null>(null);
  const [activeTab, setActiveTab] = useState<CoachTab>("convites");

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listCoachConnections()
      .then((rows) => {
        if (!cancelled) {
          setConnections(rows);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConnections([]);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, reloadKey]);

  const reload = () => setReloadKey((key) => key + 1);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending || !normalizeHandle(handle)) return;
    setSending(true);
    setFeedback(null);
    const result = await proposeCoachRelationship(handle, inviteRole);
    setSending(false);
    if (result.ok) {
      setFeedback({
        tone: "good",
        message:
          inviteRole === "student"
            ? `Convite enviado pra @${normalizeHandle(handle)} pra ser seu treinador.`
            : `Convite enviado pra @${normalizeHandle(handle)} pra ser seu aluno.`,
      });
      setHandle("");
      reload();
    } else {
      setFeedback({ tone: "bad", message: SEND_ERRORS[result.reason] ?? SEND_ERRORS.failed });
    }
  };

  const act = async (
    relationshipId: string,
    action: () => Promise<boolean>,
    kind: "accept" | "decline" | null = null,
  ) => {
    setBusyId(relationshipId);
    setBusyAction(kind);
    const ok = await action();
    setBusyId(null);
    setBusyAction(null);
    if (ok) reload();
    else setFeedback({ tone: "bad", message: "Não deu pra concluir agora — tenta de novo em instantes." });
  };

  const incoming = (connections ?? []).filter(
    (c) => c.relationship.status === "pending" && c.direction === "incoming",
  );
  const outgoing = (connections ?? []).filter(
    (c) => c.relationship.status === "pending" && c.direction === "outgoing",
  );
  const accepted = (connections ?? []).filter((c) => c.relationship.status === "accepted");
  const myCoaches = accepted.filter((c) => c.myRole === "student");
  const myStudents = accepted.filter((c) => c.myRole === "coach");

  /**
   * Cada aba só existe quando tem o que mostrar. Antes eram sempre três,
   * e pra quase todo mundo as três estão vazias: quem nunca convidou
   * ninguém abria em "Convites" (vazia), e as outras duas ofereciam
   * navegar entre dois vazios. "Alunos", em particular, só faz sentido pra
   * quem treina gente — a minoria — e ficava ali sugerindo o contrário.
   *
   * Enquanto `connections` é `null` (carregando) a lista é montada como se
   * tudo tivesse conteúdo, pra barra não aparecer e sumir a cada carga.
   *
   * Esconder as abas não esconde nenhuma ação: convidar pelo @ é o
   * formulário acima, fora das abas. Mesmo padrão do card "Compartilhar
   * corrida" em /run, que também não desenha a barra com uma aba só.
   */
  const loading = connections === null;
  const visibleTabs = COACH_TABS.filter((tab) => {
    if (loading) return true;
    if (tab.id === "convites") return incoming.length > 0 || outgoing.length > 0;
    if (tab.id === "treinadores") return myCoaches.length > 0;
    return myStudents.length > 0;
  });
  /** A aba escolhida pode sumir da lista (o último convite foi aceito com "Convites" aberta) — cai pra primeira que sobrou. */
  const effectiveTab: CoachTab | null = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id ?? null);

  return (
    <>
      {/* panel, not wide: this page is one form plus one tabbed list — the
          same "settings panel" shape as /perfil, not a multi-column
          dashboard like /treinador/sala. `wide` centered that short content
          in a mostly-empty 6xl column, which read as the native screen
          just stretched wider ("o que incomoda é a forma como o conteúdo
          está jogado na tela", 2026-09-02); `panel` anchors it left at a
          reading width instead, same as account-card.tsx/perfil. */}
      <ScreenHeader
        panel
        title="Treinador"
        badge={<NoticeBadge>precisa de conta</NoticeBadge>}
      />

      <Screen panel>
        {status === "loading" && (
          <Card className={`pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`} style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {status === "signed-out" && (
          <Card className={`pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`} style={delay(40)}>
            <CardTitle>Entra pra conectar com seu treinador</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Essa relação é entre duas contas — é a única parte disso que precisa de login.
            </p>
            <button
              type="button"
              onClick={() => setShowAccountPrompt(true)}
              className="pr-press mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent hover:bg-accent/[0.06] active:scale-[0.98] lg:mt-4 lg:w-auto lg:rounded-md lg:px-4 lg:py-1.5"
            >
              Entrar
            </button>
          </Card>
        )}

        {status === "needs-handle" && (
          <Card className={`pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`} style={delay(40)}>
            <CardTitle>Falta escolher seu @</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Seu @ é como as pessoas te acham aqui.{" "}
              <Link href="/perfil" className="pr-press underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra convidar um treinador ou aluno.
            </p>
          </Card>
        )}

        {status === "signed-in" && (
          <>
            {connections !== null && connections.some((c) => c.myRole === "coach" && c.relationship.status === "accepted") && (
              <Link
                href="/treinador/sala"
                className="pr-enter pr-press flex items-center justify-between gap-3 rounded-2xl border border-accent bg-accent/10 px-5 py-4 active:scale-[0.98] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2 lg:hover:opacity-70"
                style={delay(20)}
              >
                <span>
                  <span className="block text-sm font-semibold text-accent">Sala de Treino</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Veja todos os seus alunos de uma vez — quem está correndo agora, planilha da semana.
                  </span>
                </span>
                <span className="shrink-0 text-accent">→</span>
              </Link>
            )}

            <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
              <CardTitle aside={<NoticeBadge>dados reais</NoticeBadge>}>Convidar</CardTitle>
              {/* Mobile: pill toggle, thumb-sized. Desktop: a real <select> —
                  two mutually-exclusive options read as a form field on a
                  browser, not a segmented touch control ("o design de
                  widget não funciona", 2026-09-02). */}
              <div className="mb-3 flex gap-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => setInviteRole("student")}
                  className={`pr-press flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold active:scale-95 ${
                    inviteRole === "student"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  É meu treinador
                </button>
                <button
                  type="button"
                  onClick={() => setInviteRole("coach")}
                  className={`pr-press flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold active:scale-95 ${
                    inviteRole === "coach"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  É meu aluno
                </button>
              </div>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as MyCoachRole)}
                className="pr-press mb-3 hidden h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none hover:border-accent/60 focus:border-accent lg:block"
              >
                <option value="student">É meu treinador</option>
                <option value="coach">É meu aluno</option>
              </select>
              <form onSubmit={handleSend}>
                <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-3.5 py-3 lg:h-9 lg:rounded-md lg:px-3 lg:py-0">
                  <span className="font-semibold text-muted">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(event) => setHandle(event.target.value.toLowerCase())}
                    placeholder="identificador"
                    maxLength={20}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || normalizeHandle(handle).length === 0}
                  className="pr-press mt-3 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-60 lg:min-h-0 lg:w-auto lg:rounded-md lg:px-4 lg:py-1.5"
                >
                  {sending ? "Enviando…" : "Enviar convite"}
                </button>
              </form>
              {feedback && (
                <p className={`mt-3 text-xs leading-relaxed ${feedback.tone === "good" ? "text-good" : "text-bad"}`}>
                  {feedback.message}
                </p>
              )}
            </Card>

            {loadFailed && (
              <Card
                className="pr-enter border-bad/30 bg-bad/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
                style={delay(60)}
              >
                <p className="text-sm leading-relaxed text-bad text-pretty">
                  Não deu pra carregar suas relações agora — pode ser a conexão.
                </p>
                <button
                  type="button"
                  onClick={reload}
                  className="pr-press mt-3 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent active:scale-95 lg:rounded-md"
                >
                  Tentar de novo
                </button>
              </Card>
            )}

            <Card
              className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
              style={delay(80)}
            >
              {visibleTabs.length > 1 && (
                <div className="mb-4">
                  <PillTabs tabs={visibleTabs} active={effectiveTab ?? visibleTabs[0].id} onChange={setActiveTab} />
                </div>
              )}

              {effectiveTab === null && (
                <EmptyState
                  title="Você ainda não tem treinador nem aluno"
                  description="Convide pelo @ acima — marque “É meu aluno” pra treinar alguém, ou deixe desmarcado pra pedir que essa pessoa te treine."
                />
              )}

              {effectiveTab === "convites" &&
                (loading ? (
                  <div className="h-12 animate-pulse rounded-lg bg-background" />
                ) : (
                  <div className="flex flex-col gap-6">
                    {incoming.length > 0 && (
                      <div>
                        <p className="mb-2.5 text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
                          Recebidos
                        </p>
                        <ul className="flex flex-col gap-3.5">
                          {incoming.map((connection) => (
                            <PersonRow key={connection.relationship.$id} connection={connection}>
                              <div className="flex flex-col items-end gap-1.5">
                                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                                  quer ser {otherRoleLabel(connection.myRole)}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={busyId === connection.relationship.$id}
                                    onClick={() =>
                                      act(
                                        connection.relationship.$id,
                                        () => respondToCoachRequest(connection.relationship.$id, true),
                                        "accept",
                                      )
                                    }
                                    className="pr-press rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 active:scale-95 disabled:opacity-60 lg:rounded-md"
                                  >
                                    {busyId === connection.relationship.$id && busyAction === "accept"
                                      ? "Aceitando…"
                                      : "Aceitar"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === connection.relationship.$id}
                                    onClick={() =>
                                      act(
                                        connection.relationship.$id,
                                        () => respondToCoachRequest(connection.relationship.$id, false),
                                        "decline",
                                      )
                                    }
                                    className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad active:scale-95 disabled:opacity-60 lg:rounded-md"
                                  >
                                    {busyId === connection.relationship.$id && busyAction === "decline"
                                      ? "Recusando…"
                                      : "Recusar"}
                                  </button>
                                </div>
                              </div>
                            </PersonRow>
                          ))}
                        </ul>
                      </div>
                    )}

                    {outgoing.length > 0 && (
                      <div>
                        <p className="mb-2.5 text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
                          Enviados
                        </p>
                        <ul className="flex flex-col gap-3.5">
                          {outgoing.map((connection) => (
                            <OutgoingRequestRow
                              key={connection.relationship.$id}
                              connection={connection}
                              busy={busyId === connection.relationship.$id}
                              onCancel={() =>
                                act(connection.relationship.$id, () =>
                                  removeCoachRelationship(connection.relationship.$id),
                                )
                              }
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}

              {effectiveTab === "treinadores" &&
                (loading ? (
                  <div className="h-12 animate-pulse rounded-lg bg-background" />
                ) : (
                  <ul className="flex flex-col gap-3.5">
                    {myCoaches.map((connection) => (
                      <RelationshipRow
                        key={connection.relationship.$id}
                        connection={connection}
                        busy={busyId === connection.relationship.$id}
                        onRemove={() =>
                          act(connection.relationship.$id, () => removeCoachRelationship(connection.relationship.$id))
                        }
                      />
                    ))}
                  </ul>
                ))}

              {effectiveTab === "alunos" &&
                (loading ? (
                  <div className="h-12 animate-pulse rounded-lg bg-background" />
                ) : (
                  <ul className="flex flex-col gap-3.5">
                    {myStudents.map((connection) => (
                      <li
                        key={connection.relationship.$id}
                        className="border-t border-border pt-3 first:border-t-0 first:pt-0"
                      >
                        <Link
                          href={`/treinador/aluno?id=${connection.otherId}`}
                          className="pr-press flex items-center gap-3 hover:bg-foreground/[0.04] active:scale-[0.98]"
                        >
                          <Avatar name={connection.profile?.displayName ?? "?"} avatarUrl={connection.profile?.avatarUrl} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {connection.profile?.displayName ?? "Corredor(a)"}
                            </p>
                            <p className="truncate font-mono text-xs text-muted">
                              {connection.profile ? `@${connection.profile.handle}` : "conta sem @ ainda"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground lg:rounded-md">
                            Ver corridas
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ))}
            </Card>
          </>
        )}
      </Screen>

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo={RETURN_TO} />}
    </>
  );
}

/** Cancelling a sent invite asks twice too — same rule as any other delete in this app, even for a request nobody accepted yet. */
function OutgoingRequestRow({
  connection,
  busy,
  onCancel,
}: {
  connection: CoachConnection;
  busy: boolean;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <PersonRow connection={connection}>
      <span className="self-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        aguardando
      </span>
      {confirming ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="pr-press rounded-full bg-bad px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 disabled:opacity-60 lg:rounded-md"
          >
            {busy ? "Cancelando…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground active:scale-95 lg:rounded-md"
          >
            Voltar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad active:scale-95 lg:rounded-md"
        >
          Cancelar
        </button>
      )}
    </PersonRow>
  );
}

/** Ending a coach relationship asks twice — same two-step the shoe list and the friends list use. */
function RelationshipRow({
  connection,
  busy,
  onRemove,
}: {
  connection: CoachConnection;
  busy: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <PersonRow connection={connection}>
      {confirming ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="pr-press rounded-full bg-bad px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 disabled:opacity-60 lg:rounded-md"
          >
            {busy ? "Desfazendo…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground active:scale-95 lg:rounded-md"
          >
            Voltar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad active:scale-95 lg:rounded-md"
        >
          Desfazer
        </button>
      )}
    </PersonRow>
  );
}
