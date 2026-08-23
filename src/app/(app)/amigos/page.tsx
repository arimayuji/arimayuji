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
import { getActiveLiveSession, type LiveRun } from "@/lib/liveRuns";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { useHeaderClose } from "../app-shell";
import { Avatar } from "../avatar";
import { Card, CardTitle, delay, NoticeBadge, PillTabs, Screen, ScreenHeader } from "../ui";

const RETURN_TO = "/amigos";

/** Same threshold `/treinador/aluno`/`ao-vivo` use for "this ping is stale, treat as not live" — kept in sync by eye since this list only needs it for the badge, not the full live card those screens render. */
const LIVE_STALE_MS = 45_000;
/** A once-in-a-while badge on a list, not a map someone's staring at — much less frequent than the 5s poll the actual live-viewing screens use. */
const LIVE_LIST_POLL_MS = 15_000;

const SEND_ERRORS: Record<string, string> = {
  "not-found": "Ninguém com esse @ por aqui. Confere a escrita — o @ é o mesmo que a pessoa escolheu ao criar a conta.",
  self: "Esse @ é o seu.",
  duplicate: "Vocês já têm um convite ou uma amizade em aberto.",
  unavailable: "Os recursos de conta estão indisponíveis agora.",
  failed: "Não deu pra enviar agora — tenta de novo em instantes.",
};

/**
 * Name + @ for one person, with whatever profile we could resolve. The
 * avatar/name block links to /perfil/ver when `linkToProfile` is set (only
 * accepted friends — a pending request's PersonRow never gets it) — kept
 * to just that inner block, not the whole row, since the row's own
 * actions (Aceitar/Recusar/Desfazer) are buttons that must not double as
 * navigation targets.
 */
function PersonRow({
  connection,
  children,
  linkToProfile = false,
}: {
  connection: FriendConnection;
  children: React.ReactNode;
  linkToProfile?: boolean;
}) {
  const { profile } = connection;
  const info = (
    <>
      <Avatar name={profile?.displayName ?? "?"} avatarUrl={profile?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{profile?.displayName ?? "Corredor(a)"}</p>
        <p className="truncate font-mono text-xs text-muted">
          {profile ? `@${profile.handle}` : "conta sem @ ainda"}
        </p>
      </div>
    </>
  );
  return (
    <li className="flex items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      {linkToProfile && profile ? (
        <Link href={`/perfil/ver?h=${profile.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
          {info}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{info}</div>
      )}
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

  // Prefills from an invite link (?h=) — either the web landing page's own
  // fallback instructions, or the deep-link handler in
  // oauth-callback-listener.tsx navigating here directly. Read straight off
  // `window.location.search` instead of `useSearchParams()` so this page
  // doesn't need a Suspense boundary just for a value only ever read once,
  // on mount.
  useEffect(() => {
    const fromInvite = new URLSearchParams(window.location.search).get("h");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (the URL), not from other React state; there's nothing to read this from except an effect.
    if (fromInvite) setHandle(fromInvite.toLowerCase());
  }, []);

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

  /**
   * Which accepted friends are live right now, keyed by their account id —
   * only polled while the "Amigos" tab is actually showing, since nobody's
   * looking at this list otherwise. A friend's own `startLiveSession` call
   * (see /run) already restricted read access to whoever they picked, so
   * this simply comes back empty for anyone who didn't include this
   * account — no extra filtering needed here, same reasoning
   * `listSessionLiveRuns` documents for the longão case.
   */
  const [liveFriends, setLiveFriends] = useState<Map<string, LiveRun>>(new Map());
  useEffect(() => {
    if (activeTab !== "amigos" || friends.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      const rows = await Promise.all(friends.map((c) => getActiveLiveSession(c.otherId)));
      if (cancelled) return;
      const now = Date.now();
      const next = new Map<string, LiveRun>();
      rows.forEach((row, i) => {
        if (row && now - row.updatedAtMs <= LIVE_STALE_MS) next.set(friends[i].otherId, row);
      });
      setLiveFriends(next);
    };
    void poll();
    const interval = setInterval(poll, LIVE_LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `friends` is a new array every render (derived from `connections` above); keying off `connections` itself instead avoids re-polling every render while still refetching whenever who's actually a friend changes.
  }, [activeTab, connections]);

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
                  <div className="py-2 text-center">
                    <div className="mx-auto mb-4 h-32 w-full max-w-[220px] overflow-hidden rounded-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
                      <img
                        src="/amigos-empty.png"
                        alt="Ilustração de dois amigos correndo juntos"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-muted">
                      Nenhum amigo ainda. Adicione pelo @ acima.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {friends.map((connection) => (
                      <FriendRow
                        key={connection.friendship.$id}
                        connection={connection}
                        busy={busyId === connection.friendship.$id}
                        live={liveFriends.has(connection.otherId)}
                        onRemove={() => act(connection.friendship.$id, () => removeFriendship(connection.friendship.$id))}
                      />
                    ))}
                  </ul>
                ))}
            </Card>

            <p className="pr-enter text-center text-xs leading-relaxed text-muted text-pretty" style={delay(140)}>
              Um amigo aceito pode escolher te ver ao vivo enquanto corre (tela Preparar Corrida) — o
              selo verde Ao vivo aqui aparece na hora. Ver o histórico de corridas passadas de um amigo,
              como já dá pra fazer com um treinador, ainda está por vir.
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
  live,
  onRemove,
}: {
  connection: FriendConnection;
  busy: boolean;
  /** Whether this friend currently has a live run this account is included in — see the polling effect in `AmigosPage`. */
  live: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <PersonRow connection={connection} linkToProfile>
      {live && !confirming && (
        <Link
          href={`/amigos/ao-vivo?id=${connection.otherId}`}
          className="flex items-center gap-1.5 self-center rounded-full border border-good/30 bg-good/10 px-3 py-1.5 text-xs font-medium text-good"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
          Ao vivo
        </Link>
      )}
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
