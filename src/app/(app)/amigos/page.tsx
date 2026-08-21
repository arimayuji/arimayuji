"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listFriendConnections,
  normalizeHandle,
  removeFriendship,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendConnection,
} from "@/lib/friendships";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { useHeaderClose } from "../app-shell";
import { Avatar } from "../avatar";
import { Card, CardTitle, delay, NoticeBadge, PillTabs, Screen, ScreenHeader } from "../ui";

const RETURN_TO = "/amigos";

const SEND_ERRORS: Record<string, string> = {
  "not-found": "Ninguém com esse @ por aqui. Confere a escrita — o @ é o mesmo que a pessoa escolheu ao criar a conta.",
  self: "Esse @ é o seu.",
  duplicate: "Vocês já têm um convite ou uma amizade em aberto.",
  unavailable: "Os recursos de conta estão indisponíveis agora.",
  failed: "Não deu pra enviar agora — tenta de novo em instantes.",
};

/** Name + @ for one person, with whatever profile we could resolve. */
function PersonRow({ connection, children }: { connection: FriendConnection; children: React.ReactNode }) {
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

type FriendTab = "convites" | "amigos";

const FRIEND_TABS = [
  { id: "convites", label: "Convites" },
  { id: "amigos", label: "Amigos" },
] as const;

export default function AmigosPage() {
  useHeaderClose("/perfil");
  const { status } = useAuth();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [connections, setConnections] = useState<FriendConnection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [handle, setHandle] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad"; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which of the two actions on the *same* incoming request `busyId` is currently mid-flight — `busyId` alone can't tell Aceitar and Recusar's busy labels apart, since both buttons share it. */
  const [busyAction, setBusyAction] = useState<"accept" | "decline" | null>(null);
  const [activeTab, setActiveTab] = useState<FriendTab>("convites");

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listFriendConnections()
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
    const result = await sendFriendRequest(handle);
    setSending(false);
    if (result.ok) {
      setFeedback({ tone: "good", message: `Convite enviado pra @${normalizeHandle(handle)}.` });
      setHandle("");
      reload();
    } else {
      setFeedback({ tone: "bad", message: SEND_ERRORS[result.reason] ?? SEND_ERRORS.failed });
    }
  };

  const act = async (
    friendshipId: string,
    action: () => Promise<boolean>,
    kind: "accept" | "decline" | null = null,
  ) => {
    setBusyId(friendshipId);
    setBusyAction(kind);
    const ok = await action();
    setBusyId(null);
    setBusyAction(null);
    if (ok) reload();
    else setFeedback({ tone: "bad", message: "Não deu pra concluir agora — tenta de novo em instantes." });
  };

  const incoming = (connections ?? []).filter(
    (c) => c.friendship.status === "pending" && c.direction === "incoming",
  );
  const outgoing = (connections ?? []).filter(
    (c) => c.friendship.status === "pending" && c.direction === "outgoing",
  );
  const friends = (connections ?? []).filter((c) => c.friendship.status === "accepted");

  return (
    <>
      <ScreenHeader
        title="Amigos"
        badge={<NoticeBadge>precisa de conta</NoticeBadge>}
        subtitle="Adicione pelo @ de quem você corre junto. É a base pra, mais pra frente, ver as corridas que cada um decidir compartilhar."
      />

      <Screen>
        {status === "loading" && (
          <Card className="pr-enter" style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {status === "signed-out" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Entra pra adicionar amigos</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Amizade é entre duas contas — é a única parte disso que precisa de login. Gravar corrida,
              histórico e conquistas continuam locais e sem conta, do mesmo jeito.
            </p>
            <button
              type="button"
              onClick={() => setShowAccountPrompt(true)}
              className="mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent"
            >
              Entrar
            </button>
          </Card>
        )}

        {status === "needs-handle" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Falta escolher seu @</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Seu @ é como as pessoas te acham aqui.{" "}
              <Link href="/perfil" className="underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra adicionar amigos.
            </p>
          </Card>
        )}

        {status === "signed-in" && (
          <>
            <Card className="pr-enter" style={delay(40)}>
              <CardTitle aside={<NoticeBadge>dados reais</NoticeBadge>}>Adicionar amigo</CardTitle>
              <form onSubmit={handleSend}>
                <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-3.5 py-3">
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
                  className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
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
              <Card className="pr-enter border-bad/30 bg-bad/5" style={delay(60)}>
                <p className="text-sm leading-relaxed text-bad text-pretty">
                  Não deu pra carregar seus amigos agora — pode ser a conexão.
                </p>
                <button
                  type="button"
                  onClick={reload}
                  className="mt-3 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent"
                >
                  Tentar de novo
                </button>
              </Card>
            )}

            <Card className="pr-enter" style={delay(80)}>
              <div className="mb-4">
                <PillTabs tabs={FRIEND_TABS} active={activeTab} onChange={setActiveTab} />
              </div>

              {activeTab === "convites" ? (
                connections === null ? (
                  <div className="h-12 animate-pulse rounded-lg bg-background" />
                ) : incoming.length === 0 && outgoing.length === 0 ? (
                  <p className="py-2 text-center text-xs leading-relaxed text-muted">
                    Nenhum convite esperando resposta — enviados ou recebidos.
                  </p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {incoming.length > 0 && (
                      <div>
                        <p className="mb-2.5 text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
                          Recebidos
                        </p>
                        <ul className="flex flex-col gap-3">
                          {incoming.map((connection) => (
                            <PersonRow key={connection.friendship.$id} connection={connection}>
                              <button
                                type="button"
                                disabled={busyId === connection.friendship.$id}
                                onClick={() =>
                                  act(
                                    connection.friendship.$id,
                                    () => respondToFriendRequest(connection.friendship.$id, true),
                                    "accept",
                                  )
                                }
                                className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
                              >
                                {busyId === connection.friendship.$id && busyAction === "accept"
                                  ? "Aceitando…"
                                  : "Aceitar"}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === connection.friendship.$id}
                                onClick={() =>
                                  act(
                                    connection.friendship.$id,
                                    () => respondToFriendRequest(connection.friendship.$id, false),
                                    "decline",
                                  )
                                }
                                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad disabled:opacity-60"
                              >
                                {busyId === connection.friendship.$id && busyAction === "decline"
                                  ? "Recusando…"
                                  : "Recusar"}
                              </button>
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
                        <ul className="flex flex-col gap-3">
                          {outgoing.map((connection) => (
                            <OutgoingRequestRow
                              key={connection.friendship.$id}
                              connection={connection}
                              busy={busyId === connection.friendship.$id}
                              onCancel={() =>
                                act(connection.friendship.$id, () => removeFriendship(connection.friendship.$id))
                              }
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              ) : null}

              {activeTab === "amigos" &&
                (connections === null ? (
                  <div className="h-12 animate-pulse rounded-lg bg-background" />
                ) : friends.length === 0 ? (
                  <p className="py-2 text-center text-xs leading-relaxed text-muted">
                    Nenhum amigo ainda. Adicione pelo @ acima.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {friends.map((connection) => (
                      <FriendRow
                        key={connection.friendship.$id}
                        connection={connection}
                        busy={busyId === connection.friendship.$id}
                        onRemove={() => act(connection.friendship.$id, () => removeFriendship(connection.friendship.$id))}
                      />
                    ))}
                  </ul>
                ))}
            </Card>

            <p className="pr-enter text-center text-xs leading-relaxed text-muted text-pretty" style={delay(140)}>
              Por enquanto a amizade é só a conexão em si — compartilhar corridas com quem você aceitou
              ainda está por vir, e a gente não vai fingir que já está aí.
            </p>
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
  connection: FriendConnection;
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
            className="rounded-full border border-bad px-3 py-1.5 text-xs font-semibold text-bad disabled:opacity-60"
          >
            {busy ? "Cancelando…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            Voltar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad"
        >
          Cancelar
        </button>
      )}
    </PersonRow>
  );
}

/** Unfriending asks twice — same two-step the shoe list uses for delete. */
function FriendRow({
  connection,
  busy,
  onRemove,
}: {
  connection: FriendConnection;
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
            className="rounded-full border border-bad px-3 py-1.5 text-xs font-semibold text-bad disabled:opacity-60"
          >
            {busy ? "Desfazendo…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            Voltar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad"
        >
          Desfazer
        </button>
      )}
    </PersonRow>
  );
}
