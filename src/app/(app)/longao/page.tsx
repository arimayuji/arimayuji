"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  closeGroupRun,
  createGroupRun,
  CODE_LENGTH,
  getActiveGroupRunCode,
  getGroupRun,
  joinGroupRun,
  leaveGroupRun,
  listMyGroupRuns,
  listParticipants,
  normalizeJoinCode,
  type GroupRun,
  type GroupRunParticipantConnection,
} from "@/lib/groupRuns";
import { publicOrigin } from "@/lib/platform";
import { useAuth } from "@/lib/useAuth";
import { useShareSupport } from "@/lib/share";
import { AccountPrompt } from "../account-prompt";
import { useHeaderClose } from "../app-shell";
import { ParticipantRow } from "../participant-row";
import { Card, CardTitle, delay, NoticeBadge, PillTabs, Screen, ScreenHeader } from "../ui";

const RETURN_TO = "/longao";

type LongaoTab = "criar" | "entrar";

const LONGAO_TABS = [
  { id: "criar", label: "Criar" },
  { id: "entrar", label: "Entrar" },
] as const;

const JOIN_ERRORS: Record<string, string> = {
  "not-found": "Nenhum longão com esse código. Confere com quem te chamou.",
  expired: "Esse longão já venceu.",
  closed: "O criador encerrou esse longão.",
  "not-friends": "Só quem é amigo de quem criou pode entrar — manda um convite de amizade primeiro.",
  unavailable: "Os recursos de conta estão indisponíveis agora.",
  failed: "Não deu pra entrar agora — tenta de novo em instantes.",
};

/**
 * Renders the join link as a scannable code — same URL `handleShare` sends
 * (`/longao?c=CODE`, which pre-fills the join field), so scanning it does
 * exactly what typing the 6-char code does, just without typing. Generated
 * client-side (`qrcode`'s `toDataURL`) since this is a static export with
 * no server to render one on. Fixed black-on-white regardless of app theme
 * — that's what scanners actually expect, not a dark-mode nicety.
 */
function GroupRunQr({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: "#0b0e11", light: "#ffffff" } })
      .then((result) => {
        if (!cancelled) setDataUrl(result);
      })
      .catch(() => {
        // No QR this time — the text code above still works fine on its own.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!dataUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not an optimizable remote asset
    <img src={dataUrl} alt="QR code do longão" width={140} height={140} className="rounded-xl" />
  );
}

export default function LongaoPage() {
  return (
    <Suspense fallback={null}>
      <LongaoContent />
    </Suspense>
  );
}

/**
 * The lobby: create a session (get a code to share), or join one by code.
 * Deliberately no map here yet — this is Phase 1 of the plan, the session
 * object and who's in it. A runner already mid-run also can't navigate away
 * from /run to reach this page without ending their own run (see the plan's
 * "descoberta 1"), so this screen is for before/after running, or for
 * someone spectating without running themselves.
 */
function LongaoContent() {
  useHeaderClose("/perfil");
  const { status: authStatus } = useAuth();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const codeParam = useSearchParams().get("c");
  const shareSupport = useShareSupport();

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState(codeParam ? normalizeJoinCode(codeParam) : "");
  const [joining, setJoining] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad"; message: string } | null>(null);

  const [activeSession, setActiveSession] = useState<GroupRun | null>(null);
  const [participants, setParticipants] = useState<GroupRunParticipantConnection[] | null>(null);
  const [mySessions, setMySessions] = useState<GroupRun[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sharing, setSharing] = useState(false);
  /** Which remembered session's "Abrir" is mid-join — distinct from `joining`, which only tracks the code-entry form's own submit button below. */
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LongaoTab>("criar");

  const reload = () => setReloadKey((key) => key + 1);

  // Picks up whatever session create()/join() just left active, or one
  // still remembered from a previous visit — resolved fresh on every
  // reload so leaving/closing elsewhere (another tab, another device)
  // doesn't leave this screen showing a stale session. Every branch's first
  // setState sits behind an `await`, never synchronously in the effect
  // body, since the two are otherwise flagged as a cascading-render risk.
  useEffect(() => {
    if (authStatus !== "signed-in") return;
    let cancelled = false;
    (async () => {
      const code = getActiveGroupRunCode();
      if (!code) {
        const rows = await listMyGroupRuns();
        if (cancelled) return;
        setActiveSession(null);
        setMySessions(rows);
        return;
      }
      const session = await getGroupRun(code);
      if (cancelled) return;
      setActiveSession(session);
      if (session) {
        const rows = await listParticipants(code);
        if (!cancelled) setParticipants(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, reloadKey]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setFeedback(null);
    const result = await createGroupRun(name, Date.now());
    setCreating(false);
    if (result.ok) {
      setName("");
      reload();
    } else {
      setFeedback({ tone: "bad", message: "Não deu pra criar agora — tenta de novo em instantes." });
    }
  };

  /** `sessionId` set only when called from a "Seus longões recentes" row's own "Abrir" button — tracked in `openingId` instead of `joining`, so that row's busy label doesn't also light up the unrelated code-entry form's submit button below. */
  const performJoin = async (code: string, sessionId?: string) => {
    if (joining || openingId || !normalizeJoinCode(code)) return;
    if (sessionId) setOpeningId(sessionId);
    else setJoining(true);
    setFeedback(null);
    const result = await joinGroupRun(code);
    if (sessionId) setOpeningId(null);
    else setJoining(false);
    if (result.ok) {
      setJoinCode("");
      reload();
    } else {
      setFeedback({ tone: "bad", message: JOIN_ERRORS[result.reason] ?? JOIN_ERRORS.failed });
    }
  };

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    void performJoin(joinCode);
  };

  const handleShare = async (code: string, name: string) => {
    setSharing(true);
    try {
      const url = `${publicOrigin()}/longao?c=${code}`;
      const text = `Bora correr o "${name}" comigo? Entra com o código ${code} no Xanthus, ou abre: ${url}`;
      if (shareSupport === "share") {
        try {
          await navigator.share({ title: "Longão no Xanthus", text, url });
          return;
        } catch {
          // Cancelled or failed — clipboard below is the fallback either way.
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        setFeedback({ tone: "good", message: "Convite copiado — cola onde quiser mandar." });
      } catch {
        setFeedback({ tone: "bad", message: "Não deu pra copiar — o código é " + code + "." });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleLeave = async () => {
    if (!activeSession || leaving) return;
    setLeaving(true);
    await leaveGroupRun(activeSession.$id);
    setLeaving(false);
    reload();
  };

  const handleClose = async () => {
    if (!activeSession || closing) return;
    setClosing(true);
    const ok = await closeGroupRun(activeSession.$id);
    setClosing(false);
    if (ok) reload();
    else setFeedback({ tone: "bad", message: "Não deu pra encerrar agora — tenta de novo em instantes." });
  };

  return (
    <>
      <ScreenHeader
        title="Longão"
        badge={<NoticeBadge>precisa de conta</NoticeBadge>}
      />

      <Screen>
        {authStatus === "loading" && (
          <Card className="pr-enter" style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {authStatus === "signed-out" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Entra pra criar ou entrar num longão</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              O longão precisa de conta pra saber quem é amigo de quem.
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

        {authStatus === "needs-handle" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Falta escolher seu @</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Seu @ é como as pessoas te acham aqui.{" "}
              <Link href="/perfil" className="underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra criar ou entrar num longão.
            </p>
          </Card>
        )}

        {authStatus === "signed-in" && (
          <>
            {feedback && (
              <p
                className={`pr-enter text-center text-xs leading-relaxed ${feedback.tone === "good" ? "text-good" : "text-bad"}`}
                style={delay(30)}
              >
                {feedback.message}
              </p>
            )}

            {activeSession ? (
              <Card className="pr-enter" style={delay(40)}>
                <CardTitle aside={activeSession.status === "closed" ? <NoticeBadge>encerrado</NoticeBadge> : undefined}>
                  {activeSession.name}
                </CardTitle>
                <div className="mt-2 flex items-center gap-3">
                  <span className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-lg font-semibold tracking-[0.2em]">
                    {activeSession.$id}
                  </span>
                  <button
                    type="button"
                    disabled={sharing}
                    onClick={() => void handleShare(activeSession.$id, activeSession.name)}
                    className="rounded-full border border-accent px-3.5 py-2 text-xs font-semibold text-accent disabled:opacity-60"
                  >
                    {sharing ? "Compartilhando…" : "Compartilhar"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Manda esse código pra quem já é seu amigo aqui no app, ou deixa a pessoa escanear o QR.
                  Vence em algumas horas.
                </p>
                <div className="mt-3 flex justify-center">
                  <GroupRunQr url={`${publicOrigin()}/longao?c=${activeSession.$id}`} />
                </div>
                <Link
                  href={`/longao/mapa?c=${activeSession.$id}`}
                  className="mt-3 inline-block text-xs text-accent underline underline-offset-2"
                >
                  Ver mapa do grupo
                </Link>
                <p className="text-xs text-muted">
                  Quem está correndo abre o mapa de dentro da própria tela de corrida — esse link aqui é
                  pra acompanhar sem estar correndo.
                </p>

                <div className="mt-5 border-t border-border pt-4">
                  <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                    Quem já entrou
                  </span>
                  {participants === null ? (
                    <div className="h-10 animate-pulse rounded-lg bg-background" />
                  ) : (
                    <ul className="flex flex-col gap-3.5">
                      {participants.map((connection) => (
                        <ParticipantRow key={connection.participant.$id} connection={connection} />
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-5 flex gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    disabled={leaving}
                    onClick={handleLeave}
                    className="flex-1 rounded-full border border-border py-2.5 text-xs font-semibold text-muted hover:border-bad hover:text-bad disabled:opacity-60"
                  >
                    {leaving ? "Saindo…" : "Sair do longão"}
                  </button>
                  <button
                    type="button"
                    disabled={closing || activeSession.status === "closed"}
                    onClick={handleClose}
                    className="flex-1 rounded-full border border-bad/40 py-2.5 text-xs font-semibold text-bad disabled:opacity-60"
                  >
                    {closing ? "Encerrando…" : "Encerrar pra todo mundo"}
                  </button>
                </div>
              </Card>
            ) : (
              <>
                <Card className="pr-enter" style={delay(40)}>
                  <div className="mb-4">
                    <PillTabs tabs={LONGAO_TABS} active={activeTab} onChange={setActiveTab} />
                  </div>

                  {activeTab === "criar" ? (
                    <form onSubmit={handleCreate}>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Nome — ex: Longão de domingo no Ibira"
                        maxLength={60}
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:border-accent"
                      />
                      <button
                        type="submit"
                        disabled={creating}
                        className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                      >
                        {creating ? "Criando…" : "Criar e gerar código"}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleJoin}>
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                        placeholder={`Código de ${CODE_LENGTH} letras`}
                        maxLength={CODE_LENGTH}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-accent"
                      />
                      <button
                        type="submit"
                        disabled={joining || !normalizeJoinCode(joinCode)}
                        className="mt-3 min-h-12 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent disabled:opacity-60"
                      >
                        {joining ? "Entrando…" : "Entrar"}
                      </button>
                    </form>
                  )}
                </Card>

                {mySessions !== null && mySessions.length > 0 && (
                  <Card className="pr-enter" style={delay(80)}>
                    <CardTitle>Seus longões recentes</CardTitle>
                    <ul className="flex flex-col gap-3.5">
                      {mySessions.map((session) => (
                        <li
                          key={session.$id}
                          className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{session.name}</p>
                            <p className="font-mono text-xs text-muted">{session.$id}</p>
                          </div>
                          <button
                            type="button"
                            disabled={openingId === session.$id}
                            onClick={() => void performJoin(session.$id, session.$id)}
                            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-60"
                          >
                            {openingId === session.$id ? "Abrindo…" : "Abrir"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </Screen>

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo={RETURN_TO} />}
    </>
  );
}
