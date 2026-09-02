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
import { clearMyPresence, listFriendsPresence } from "@/lib/friendPresence";
import { haversineMeters } from "@/lib/tracking/geoFilter";
import { updateProfile } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { useHeaderClose } from "../app-shell";
import { Avatar } from "../avatar";
import {
  Card,
  CardTitle,
  delay,
  EmptyState,
  NoticeBadge,
  PillTabs,
  PreferenceToggle,
  Screen,
  ScreenHeader,
} from "../ui";

const RETURN_TO = "/amigos";

/** Same threshold `/treinador/aluno`/`ao-vivo` use for "this ping is stale, treat as not live" — kept in sync by eye since this list only needs it for the badge, not the full live card those screens render. */
const LIVE_STALE_MS = 45_000;
/** A once-in-a-while badge on a list, not a map someone's staring at — much less frequent than the 5s poll the actual live-viewing screens use. */
const LIVE_LIST_POLL_MS = 15_000;
/** A presence ping is a one-shot foreground read (see friend-presence-ping.tsx), not a 6s stream like live_runs — 15min is generous enough that "just opened the app a few minutes ago" still counts as "nearby now" instead of flickering off between pings. */
const PRESENCE_STALE_MS = 15 * 60_000;
/** Loose enough to mean "close enough to meet up" (walking/driving distance), not "standing in the exact same spot" — the tighter 150m `placeMatch.ts` uses is answering a different question ("are you at this specific park"). */
const NEARBY_THRESHOLD_METERS = 1000;

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
        <Link
          href={`/perfil/ver?h=${profile.handle}`}
          className="pr-press flex min-w-0 flex-1 items-center gap-3 hover:text-accent active:scale-[0.98]"
        >
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

// "Amigos" first/default — the "ação mais frequente é a aba de um toque
// só" rule (see PROJECT-CONTEXT.md, 2026-08-29). The activity feed that
// used to live here as a third tab moved out to its own top-level /feed
// screen (bottom nav: Corrida, Feed, Plano, Perfil) — this page went back
// to being just Amigos/Convites, managing who you're connected to.
const FRIEND_TABS = [
  { id: "amigos", label: "Amigos" },
  { id: "convites", label: "Convites" },
] as const;

/**
 * "Correr por amigo por perto" opt-in — moved here from /perfil per direct
 * request: the config for a friends-only feature belongs on the friends
 * screen, not buried in account settings. Same shape/reasoning as before
 * (`try/finally` around the toggle), but much shorter than a leaderboard
 * opt-in: there's no scan/confirm step here, just a switch. Turning it off
 * calls `clearMyPresence()` so the last known location stops being visible
 * to friends immediately, not just "stops updating."
 */
function NearbyFriendsCard() {
  const { status, account, profile, refresh } = useAuth();
  const [savingToggle, setSavingToggle] = useState(false);
  const [toggleError, setToggleError] = useState(false);
  const optedIn = profile?.nearbyOptIn ?? false;

  async function handleToggle(next: boolean) {
    if (!account || savingToggle) return;
    setSavingToggle(true);
    setToggleError(false);
    try {
      await updateProfile(account.id, { nearbyOptIn: next });
      if (!next) await clearMyPresence();
      await refresh();
    } catch {
      setToggleError(true);
    } finally {
      setSavingToggle(false);
    }
  }

  if (status !== "signed-in") return null;

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(50)}
    >
      <CardTitle aside={<NoticeBadge>desligado por padrão</NoticeBadge>}>Amigo por perto</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Leitura pontual da localização ao abrir o app — nunca rastreamento contínuo. Só amigos
        aceitos veem isso.
      </p>
      <PreferenceToggle
        label="Avisar quando um amigo estiver por perto"
        hint="desligar apaga sua última leitura na hora"
        checked={optedIn}
        onChange={handleToggle}
      />
      {toggleError && (
        <p className="mt-2 text-xs leading-relaxed text-bad">
          Não deu pra salvar agora — tenta de novo em instantes.
        </p>
      )}
    </Card>
  );
}

export default function AmigosPage() {
  useHeaderClose("/feed");
  const { status, account } = useAuth();
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
  const [activeTab, setActiveTab] = useState<FriendTab>("amigos");

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

  /**
   * "Correr por amigo por perto" — reuses this exact same tab-gated polling
   * shape as the "Ao vivo" effect above, just against `friend_presence`
   * instead of `live_runs`. Distance is computed from THIS account's own
   * presence row (fetched in the same batched call, not a fresh GPS
   * request on this screen) — if that row doesn't exist yet (opted out, or
   * no ping has landed recently), nothing here can ever show a distance,
   * which is exactly the right degrade: no separate "you're not opted in"
   * UI needed, the feature is just quietly a no-op.
   */
  const [nearbyFriends, setNearbyFriends] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (activeTab !== "amigos" || friends.length === 0 || !account) return;
    let cancelled = false;
    const poll = async () => {
      const rows = await listFriendsPresence([account.id, ...friends.map((c) => c.otherId)]);
      if (cancelled) return;
      const now = Date.now();
      const mine = rows.find((row) => row.$id === account.id);
      if (!mine || now - mine.updatedAtMs > PRESENCE_STALE_MS) {
        setNearbyFriends(new Set());
        return;
      }
      const next = new Set<string>();
      for (const row of rows) {
        if (row.$id === account.id) continue;
        if (now - row.updatedAtMs > PRESENCE_STALE_MS) continue;
        if (haversineMeters(mine, row) <= NEARBY_THRESHOLD_METERS) next.add(row.$id);
      }
      setNearbyFriends(next);
    };
    void poll();
    const interval = setInterval(poll, LIVE_LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as the "Ao vivo" effect above: keying off `connections` (not the derived `friends` array) avoids re-polling every render.
  }, [activeTab, connections, account]);

  return (
    <>
      <ScreenHeader
        title="Amigos"
        badge={<NoticeBadge>precisa de conta</NoticeBadge>}
      />

      <Screen>
        {status === "loading" && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {status === "signed-out" && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
            <CardTitle>Entra pra adicionar amigos</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Amizade é entre duas contas — é a única parte disso que precisa de login.
            </p>
            <button
              type="button"
              onClick={() => setShowAccountPrompt(true)}
              className="pr-press mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent hover:bg-accent/10 active:scale-[0.98]"
            >
              Entrar
            </button>
          </Card>
        )}

        {status === "needs-handle" && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
            <CardTitle>Falta escolher seu @</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Seu @ é como as pessoas te acham aqui.{" "}
              <Link href="/perfil" className="pr-press underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra adicionar amigos.
            </p>
          </Card>
        )}

        {status === "signed-in" && (
          <>
            <Card
              className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
              style={delay(40)}
            >
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
                  className="pr-press mt-3 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
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

            <NearbyFriendsCard />

            {loadFailed && (
              <Card
                className="pr-enter border-bad/30 bg-bad/5 lg:rounded-none lg:border-0 lg:border-t lg:border-bad/30 lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
                style={delay(60)}
              >
                <p className="text-sm leading-relaxed text-bad text-pretty">
                  Não deu pra carregar seus amigos agora — pode ser a conexão.
                </p>
                <button
                  type="button"
                  onClick={reload}
                  className="pr-press mt-3 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent active:scale-95"
                >
                  Tentar de novo
                </button>
              </Card>
            )}

            <Card
              className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
              style={delay(80)}
            >
              <div className="mb-4">
                <PillTabs tabs={FRIEND_TABS} active={activeTab} onChange={setActiveTab} />
              </div>

              {activeTab === "convites" ? (
                connections === null ? (
                  <div className="h-12 animate-pulse rounded-lg bg-background" />
                ) : incoming.length === 0 && outgoing.length === 0 ? (
                  <EmptyState
                    title="Nenhum convite esperando resposta"
                    description="Enviados ou recebidos."
                  />
                ) : (
                  <div className="flex flex-col gap-6">
                    {incoming.length > 0 && (
                      <div>
                        <p className="mb-2.5 text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
                          Recebidos
                        </p>
                        <ul className="flex flex-col gap-3.5">
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
                                className="pr-press rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/90 active:scale-95 disabled:opacity-60"
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
                                className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad active:scale-95 disabled:opacity-60"
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
                        <ul className="flex flex-col gap-3.5">
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
                  <EmptyState title="Nenhum amigo ainda" description="Adicione pelo @ acima." />
                ) : (
                  <ul className="flex flex-col gap-3.5">
                    {friends.map((connection) => (
                      <FriendRow
                        key={connection.friendship.$id}
                        connection={connection}
                        busy={busyId === connection.friendship.$id}
                        live={liveFriends.has(connection.otherId)}
                        nearby={nearbyFriends.has(connection.otherId)}
                        onRemove={() => act(connection.friendship.$id, () => removeFriendship(connection.friendship.$id))}
                      />
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
            className="pr-press rounded-full bg-bad px-3 py-1.5 text-xs font-semibold text-white hover:bg-bad/90 active:scale-95 disabled:opacity-60"
          >
            {busy ? "Cancelando…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground active:scale-95"
          >
            Voltar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad active:scale-95"
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
  nearby,
  onRemove,
}: {
  connection: FriendConnection;
  busy: boolean;
  /** Whether this friend currently has a live run this account is included in — see the polling effect in `AmigosPage`. */
  live: boolean;
  /** Whether this friend's last presence ping landed within NEARBY_THRESHOLD_METERS of this account's own — see the polling effect in `AmigosPage`. Only shown when not already `live`: an active run is the stronger, more specific signal. */
  nearby: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <PersonRow connection={connection} linkToProfile>
      {live && !confirming && (
        <Link
          href={`/amigos/ao-vivo?id=${connection.otherId}`}
          className="pr-press flex items-center gap-1.5 self-center rounded-full border border-good/30 bg-good/10 px-3 py-1.5 text-xs font-medium text-good hover:bg-good/15 active:scale-95"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
          Ao vivo
        </Link>
      )}
      {!live && nearby && !confirming && (
        <Link
          href="/run"
          className="pr-press flex items-center gap-1.5 self-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 active:scale-95"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Por perto agora
        </Link>
      )}
      {confirming ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="pr-press rounded-full bg-bad px-3 py-1.5 text-xs font-semibold text-white hover:bg-bad/90 active:scale-95 disabled:opacity-60"
          >
            {busy ? "Desfazendo…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground active:scale-95"
          >
            Voltar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="pr-press rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad active:scale-95"
        >
          Desfazer
        </button>
      )}
    </PersonRow>
  );
}

