import { createHash } from "node:crypto";
import { Client, ID, Messaging, Permission, Query, Role, Storage, TablesDB, Users } from "node-appwrite";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";
// Same fixed ID as src/lib/appwrite.ts's AVATARS_BUCKET_ID.
const AVATARS_BUCKET_ID = "avatars";
// Same literal as src/lib/auth.ts's APPLE_BUNDLE_ID — the `aud` claim Apple
// signs into the identity token when ASAuthorizationAppleIDProvider
// authenticates natively (no Services ID/browser involved, unlike the web
// OAuth2 flow's `aud`, which is the Services ID instead).
const APPLE_BUNDLE_ID = "com.xanthus.app";
// Module-level, not per-invocation: `createRemoteJWKSet` caches the fetched
// keys internally and only refetches when a token's `kid` isn't in its
// cache, so a warm container (the common case under real traffic) reuses
// this across executions instead of hitting appleid.apple.com every time.
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
// Same idea as APPLE_JWKS above, for Google's native Sign-In identity token
// (see src/lib/auth.ts's nativeGoogleSignIn). Unlike APPLE_BUNDLE_ID (a
// fixed literal — the app's own bundle ID never changes), the Google OAuth
// client id is an external value only the account owner can create in
// Google Cloud Console, so it's a Function variable rather than baked in
// here — see this Function's README section for the exact console steps.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;

const GEMINI_MODEL = "gemini-2.5-flash";
const WEEK_START_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_KINDS = ["rest", "easy", "quality", "long"];

// Same table id as scripts/appwrite-setup.ts's city_races.
const CITY_RACES_TABLE_ID = "city_races";
// FPA's API is queried one calendar month at a time (see fetchFpaRaces) —
// this many months, starting with the current one, is enough runway for
// someone browsing "what's coming up" without querying a year of months
// nobody will scroll to on a weekly cron.
const FPA_MONTHS_AHEAD = 6;
// Both source APIs are public and unauthenticated — found by inspecting
// each site's own JS bundle for its real fetch call (documented in
// PROJECT-CONTEXT.md's "Calendário de corridas de rua por cidade"), not
// from any published API doc.
const CORRIDA_PERFEITA_ENDPOINT = "https://v2.api.corridaperfeita.com/race_calendar/all";
const FPA_EVENTS_ENDPOINT = "https://api.atletismopaulista.com.br/site/events";
const VALID_ZONES = ["easy", "marathon", "threshold", "interval", "repetition"];
const MAX_KM_PER_WEEK = 500;
// Mirrors src/lib/plan/volumeProgression.ts — see that file's own comment
// for why these two numbers, and suggest-plan-override's original comment
// (git history) for why this can't just import that module: Functions here
// have no build step or shared import across the appwrite-functions/
// boundary, same reasoning src/lib/evidence/facts.ts's own header gives.
const WEEKLY_STEP = 1.1;
const TWO_WEEK_CEILING = 1.3;
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "Xanthus <noreply@xanthus.app.br>";
const LOGO_URL = "https://xanthus.app.br/pwa-icon-192.png";

// Every table with a column that identifies its owner, and which column
// that is — mirrors scripts/appwrite-setup.ts's schema. See delete-account's
// original comment (git history) for why place_run_stats/profile_stats/
// group_runs/group_run_participants are included: all four have public
// (`Role.any()`) read and were left behind entirely by an account deletion
// before an LGPD audit pass caught it.
const OWNED_ROWS = [
  { tableId: "friendships", columns: ["requesterId", "addresseeId"] },
  { tableId: "coach_relationships", columns: ["coachId", "studentId"] },
  { tableId: "place_ratings", columns: ["userId"] },
  { tableId: "place_run_stats", columns: ["userId"] },
  { tableId: "profile_stats", columns: ["userId"] },
  { tableId: "live_runs", columns: ["userId"] },
  { tableId: "run_comments", columns: ["authorId"] },
  { tableId: "run_kudos", columns: ["giverId"] },
  { tableId: "group_runs", columns: ["hostId"] },
  { tableId: "group_run_participants", columns: ["userId"] },
];

const EVIDENCE_EXCERPT = [
  { id: "ten-percent-rule-rct-null", strength: "forte", claim: "Ensaio controlado randomizado comparou progressão de volume de 10%/semana contra ~24%/semana e a taxa de lesão foi estatisticamente igual (20,8% vs 20,3%) — a regra dos 10% sozinha não reduziu lesão." },
  { id: "nielsen-30-percent-2-weeks", strength: "moderada", claim: "O sinal real de risco é um salto de volume acima de 30% em 2 semanas (HR 1.59); aumentos entre 10% e 30% não diferiram do grupo abaixo de 10%." },
  { id: "nata-10-percent-grade-c", strength: "consenso", claim: "A regra dos 10%/semana é classificada pela própria NATA como consenso de especialista (grau C), não achado experimental forte." },
  { id: "acsm-fitt-vp-gradual-progression", strength: "forte", claim: "ACSM recomenda ≥150 min/semana de atividade moderada (ou ≥75 min vigorosa) e afirma que progressão gradual de volume/intensidade reduz o risco do exercício." },
  { id: "80-20-polarized-training", strength: "moderada", claim: "Distribuição 80/20 (80% do treino em intensidade baixa, 20% em alta, pouco no meio) tem respaldo observacional e experimental." },
  { id: "long-run-cap-convention", strength: "consenso", claim: "O teto de ~3h / 32km pro longão de maratona é convenção de treinador, não achado experimental controlado." },
  { id: "taper-2-weeks-exponential", strength: "forte", claim: "O taper mais bem evidenciado é de 2 semanas, com redução exponencial de 41–60% do volume, mantendo intensidade e frequência." },
  { id: "strict-taper-beats-relaxed-taper", strength: "moderada", claim: "Um taper disciplinado (queda de volume consistente, sem picos) supera um taper relaxado em desempenho final, em dados reais de mais de 158 mil maratonistas." },
  { id: "ecss-acsm-overtraining-consensus", strength: "forte", claim: "Existe um espectro overreaching funcional → não-funcional → overtraining; o marcador-chave de alerta é queda de performance prolongada, não um único biomarcador." },
  { id: "previous-injury-strongest-risk-factor", strength: "forte", claim: "O fator de risco mais consistente pra uma nova lesão de corrida é já ter tido uma lesão antes." },
  { id: "runner-specific-prevention-null", strength: "forte", claim: "Em corredores especificamente, o que separa um programa preventivo funcionar de não funcionar é a aderência ao plano, não o conteúdo do exercício em si." },
];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sessions: {
      type: "ARRAY",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: VALID_KINDS },
          km: { type: "NUMBER" },
          paceZone: { type: "STRING", enum: VALID_ZONES },
        },
        required: ["kind", "km"],
      },
    },
    note: { type: "STRING" },
    // Coach-facing, distinct from "note" (athlete-facing tone). Exists
    // because of a 2026-08 competitive read of Runna's coaching-quality
    // reviews (WSJ-reported injury pattern, blog testimonials): the
    // recurring complaint wasn't that an AI-generated plan felt generic,
    // it's that the plan didn't visibly *react* to the runner's own signals
    // (fatigue, a missed week, an injury note), so people ended up trusting
    // an opaque output more than they should have. Required, not optional,
    // specifically so the model can't skip explaining itself.
    reasoning: { type: "STRING" },
  },
  required: ["sessions", "note", "reasoning"],
};

/**
 * Copy for `sendMilestoneNotification` below — kept server-side (not
 * client-supplied) so a client can only ever trigger one of these fixed
 * messages to itself, never send arbitrary push text. Each milestone has a
 * few variants, picked at random per send — the whole point raised for
 * building this ("a mensagem vai alterando") is that the same congrats
 * text every time reads as a bot, not a product that noticed what you did.
 */
const MILESTONE_MESSAGES = {
  "boas-vindas": [
    { title: "Bem-vindo ao Xanthus!", body: "Sua primeira corrida está a um toque de distância — sem anúncio, sem paywall escondido." },
    { title: "Você chegou.", body: "Aperta Iniciar corrida quando quiser e deixa o GPS fazer o resto." },
  ],
  "primeira-corrida": [
    { title: "Primeira corrida registrada!", body: "Foi só o começo — compartilha esse marco com quem te acompanha." },
    { title: "Você correu de verdade.", body: "Sua primeira corrida já está guardada no histórico. Bora compartilhar?" },
  ],
  "novo-recorde": [
    (ctx) =>
      ctx?.label
        ? { title: "Novo recorde!", body: `Você bateu seu recorde nos ${ctx.label}. Compartilha essa conquista.` }
        : { title: "Novo recorde!", body: "Você bateu um recorde pessoal. Compartilha essa conquista." },
    (ctx) =>
      ctx?.label
        ? { title: "Recorde quebrado.", body: `${ctx.label} nunca foram tão rápidos pra você. Mostra pra todo mundo.` }
        : { title: "Recorde quebrado.", body: "Você foi mais rápido que nunca. Mostra pra todo mundo." },
  ],
};

function welcomeEmailHtml(name) {
  const greeting = name ? `Oi, ${name}!` : "Oi!";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14181c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #dde1e6;">
            <tr>
              <td style="padding:32px 28px;">
                <img src="${LOGO_URL}" width="40" height="40" alt="Xanthus" style="display:block;margin:0 0 12px;border-radius:10px;" />
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#2f6fed;font-weight:600;">Xanthus</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${greeting} Bem-vindo(a).</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#5c6570;">
                  Sua conta t&#225; pronta. Pre&#231;o travado, GPS que n&#227;o inventa e os dados s&#227;o
                  seus &#8212; cada corrida fica salva primeiro no seu aparelho, com ou sem conta.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5c6570;">
                  Quando quiser, &#233; s&#243; abrir o app e apertar &#8220;Come&#231;ar a correr&#8221;.
                </p>
                <a href="https://xanthus.app.br" style="display:inline-block;background:#2f6fed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">
                  Abrir o Xanthus
                </a>
                <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#93a0ab;">
                  D&#250;vida ou problema? Escreve pra
                  <a href="mailto:contato@xanthus.app.br" style="color:#2f6fed;">contato@xanthus.app.br</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Local calendar date (America/Sao_Paulo, fixed UTC-3 — Brazil has had no DST since 2019) for weekly bucketing, matching client-side `mondayOf`/`currentMondayIsoDate`. */
function mondayIsoDate(ms) {
  const local = new Date(ms - SAO_PAULO_OFFSET_MS);
  const day = local.getUTCDay();
  const sinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(local.getTime() - sinceMonday * MS_PER_DAY);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function capNextWeekKm(recentWeeksKm, suggestedKm) {
  if (recentWeeksKm.length === 0) return suggestedKm;
  const lastWeek = recentWeeksKm[recentWeeksKm.length - 1];
  const twoWeeksAgo = recentWeeksKm.length >= 2 ? recentWeeksKm[recentWeeksKm.length - 2] : lastWeek;
  const cap = Math.min(lastWeek * WEEKLY_STEP, twoWeeksAgo * TWO_WEEK_CEILING);
  return Math.min(suggestedKm, Math.round(cap * 10) / 10);
}

/** action: "delete-account" — deletes the account, profile and every row this user owns elsewhere. Originally appwrite-functions/delete-account. */
async function deleteAccount({ userId, client, res, error }) {
  const tablesDB = new TablesDB(client);
  const users = new Users(client);
  const storage = new Storage(client);

  let ownRunIds = [];
  try {
    const ownRuns = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "runs",
      queries: [Query.equal("userId", userId), Query.select(["$id"]), Query.limit(500)],
    });
    ownRunIds = ownRuns.rows.map((row) => row.$id);
  } catch (err) {
    error(`Falha listando runs de ${userId} antes de apagar: ${err.message}`);
  }

  for (const { tableId, columns } of OWNED_ROWS) {
    for (const column of columns) {
      try {
        await tablesDB.deleteRows({ databaseId: DATABASE_ID, tableId, queries: [Query.equal(column, userId)] });
      } catch (err) {
        error(`Falha apagando linhas de ${tableId}.${column} para ${userId}: ${err.message}`);
      }
    }
  }

  try {
    await tablesDB.deleteRows({ databaseId: DATABASE_ID, tableId: "runs", queries: [Query.equal("userId", userId)] });
  } catch (err) {
    error(`Falha apagando runs de ${userId}: ${err.message}`);
  }

  for (const runRowId of ownRunIds) {
    try {
      await tablesDB.deleteRows({
        databaseId: DATABASE_ID,
        tableId: "run_comments",
        queries: [Query.equal("runRowId", runRowId)],
      });
    } catch (err) {
      error(`Falha apagando comentários do run ${runRowId}: ${err.message}`);
    }
  }

  try {
    await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "profiles", rowId: userId });
  } catch (err) {
    error(`Falha apagando profile de ${userId}: ${err.message}`);
  }

  try {
    await storage.deleteFile({ bucketId: AVATARS_BUCKET_ID, fileId: userId });
  } catch (err) {
    error(`Falha apagando avatar de ${userId}: ${err.message}`);
  }

  await users.delete({ userId });
  return res.json({ ok: true });
}

/** action: "send-welcome-email" — best-effort, called right after createProfile() succeeds. Originally appwrite-functions/send-welcome-email. */
async function sendWelcomeEmail({ userId, client, res, log, error }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    error("RESEND_API_KEY não configurada nas Variables da function.");
    return res.json({ error: "missing-api-key" }, 500);
  }

  const users = new Users(client);
  let user;
  try {
    user = await users.get({ userId });
  } catch (err) {
    error(`Falha buscando usuário ${userId}: ${err.message}`);
    return res.json({ error: "user-lookup-failed" }, 500);
  }

  if (!user.email) {
    log(`Usuário ${userId} sem e-mail (provedor não devolveu um) — nada pra enviar.`);
    return res.json({ skipped: true });
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: user.email,
      subject: "Bem-vindo(a) ao Xanthus",
      html: welcomeEmailHtml(user.name),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    error(`Resend recusou o envio (${response.status}): ${body}`);
    return res.json({ error: "resend-failed" }, 502);
  }

  log(`Welcome email enviado pra ${user.email}.`);
  return res.json({ ok: true });
}

/**
 * Resolves which of `viewerIds` this athlete is actually entitled to share a
 * live run with, dropping anything else. Three legitimate audiences, matching
 * exactly what /run's own picker offers (src/app/(app)/run/page.tsx):
 * an accepted coach, accepted friends, and — when a "longão" is running —
 * whoever else joined that same session code.
 *
 * Without this the action would be a bare "grant user X read on my row"
 * primitive. The blast radius is only the caller's own position (a reader
 * still has to know to query for it, and every viewer screen queries by its
 * own friend/student list), but the project's rule is that sharing is a
 * negotiated relationship, not something one side asserts — same reasoning
 * that put send-friend-request in this Function in the first place.
 */
/** Accepted friendships in either direction — same two-query merge as src/lib/friendships.ts (Appwrite has no OR across columns). Shared by resolveLiveViewers below and the presence-sharing action, which both need "who is this account's accepted friends." */
async function listAcceptedFriendIds(tablesDB, userId) {
  const [asRequester, asAddressee] = await Promise.all([
    tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      queries: [Query.equal("requesterId", userId), Query.equal("status", "accepted"), Query.limit(100)],
    }),
    tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      queries: [Query.equal("addresseeId", userId), Query.equal("status", "accepted"), Query.limit(100)],
    }),
  ]);
  const ids = new Set();
  for (const row of asRequester.rows) ids.add(row.addresseeId);
  for (const row of asAddressee.rows) ids.add(row.requesterId);
  return ids;
}

/** Same fallback-to-"Alguém" pattern every push-copy call site here needs when naming who did something — a profile row missing (handle never finished) or a lookup failure both degrade to that instead of failing the push entirely. */
async function resolveDisplayName(tablesDB, userId) {
  return tablesDB
    .getRow({ databaseId: DATABASE_ID, tableId: "profiles", rowId: userId })
    .then((row) => row.displayName || `@${row.handle}`)
    .catch(() => "Alguém");
}

async function resolveLiveViewers(tablesDB, athleteId, viewerIds, sessionCode) {
  const requested = [...new Set(viewerIds.filter((id) => typeof id === "string" && id && id !== athleteId))];
  if (requested.length === 0) return [];

  const allowed = await listAcceptedFriendIds(tablesDB, athleteId);

  // Accepted coaches of this athlete.
  const coaches = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "coach_relationships",
    queries: [Query.equal("studentId", athleteId), Query.equal("status", "accepted"), Query.limit(100)],
  });
  for (const row of coaches.rows) allowed.add(row.coachId);

  // Fellow participants of the group run this athlete is actually in — the
  // athlete's own membership is checked first so a made-up code can't be
  // used to harvest an unrelated session's roster.
  if (sessionCode) {
    const mine = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      queries: [Query.equal("sessionCode", sessionCode), Query.equal("userId", athleteId), Query.limit(1)],
    });
    if (mine.rows.length > 0) {
      const participants = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "group_run_participants",
        queries: [Query.equal("sessionCode", sessionCode), Query.limit(100)],
      });
      for (const row of participants.rows) allowed.add(row.userId);
    }
  }

  allowed.delete(athleteId);
  return requested.filter((id) => allowed.has(id));
}

/** The athlete always keeps full control of their own live row; viewers only ever get read. */
function liveRunPermissions(athleteId, viewerIds) {
  return [
    Permission.read(Role.user(athleteId)),
    Permission.update(Role.user(athleteId)),
    Permission.delete(Role.user(athleteId)),
    ...viewerIds.map((viewerId) => Permission.read(Role.user(viewerId))),
  ];
}

/**
 * action: "start-live-session" — same root cause and fix as
 * send-friend-request below: the row has to grant read to viewers who aren't
 * the caller, and a plain client session can never assign a permission to
 * someone else's "user:<id>" (Appwrite answers `401 user_unauthorized:
 * "Permissions must be one of: (any, users, user:<caller>, ...)"`).
 *
 * src/lib/liveRuns.ts did exactly that from the client and swallowed the
 * rejection in a bare `catch`, so live sharing failed silently for every
 * audience — coach, friends and group run alike — from the day the table was
 * created. Reproduced against production on 2026-08-27 with two throwaway
 * accounts; `live_runs` had 0 rows at the time, i.e. not one live run had
 * ever been created by a real user.
 *
 * Deliberately NOT covering updateLiveSession: that one only writes data,
 * never permissions, so the client can keep doing it directly at its 6s
 * cadence. Only the two calls that touch permissions (this one and
 * refresh-live-audience) need the privileged key, which keeps this Function
 * to roughly one execution per run instead of one every six seconds.
 */
async function startLiveSession({ userId: athleteId, body, client, res, error }) {
  const runId = String(body.runId ?? "").trim();
  if (!runId) return res.json({ error: "missing-run-id" }, 400);

  const data = body.data && typeof body.data === "object" ? body.data : null;
  if (!data) return res.json({ error: "missing-data" }, 400);

  const sessionCode = body.sessionCode ? String(body.sessionCode).toUpperCase() : "";
  const tablesDB = new TablesDB(client);

  let viewerIds;
  try {
    viewerIds = await resolveLiveViewers(tablesDB, athleteId, Array.isArray(body.viewerIds) ? body.viewerIds : [], sessionCode);
  } catch (err) {
    error(`start-live-session: falha resolvendo audiência de ${athleteId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  // Nothing to share with — the client already skips the call in this case,
  // but a stale friend list on the device could still get here.
  if (viewerIds.length === 0) return res.json({ error: "no-viewers" }, 400);

  try {
    const row = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "live_runs",
      rowId: runId,
      // userId is taken from the authenticated caller, never from the body —
      // same rule as claim-owned-row.
      data: {
        userId: athleteId,
        startedAt: data.startedAt,
        distanceMeters: data.distanceMeters,
        currentPaceSecPerKm: data.currentPaceSecPerKm ?? undefined,
        elapsedSeconds: data.elapsedSeconds,
        lat: data.lat,
        lon: data.lon,
        updatedAtMs: data.updatedAtMs,
        sessionCode: sessionCode || undefined,
        heartRateBpm: data.heartRateBpm ?? undefined,
        forecastSecondsRemaining: data.forecastSecondsRemaining ?? undefined,
      },
      permissions: liveRunPermissions(athleteId, viewerIds),
    });
    return res.json({ ok: true, row });
  } catch (err) {
    if (err.code === 409) return res.json({ error: "duplicate" }, 409);
    error(`start-live-session: falha criando live_run ${runId} de ${athleteId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "refresh-live-audience" — the permissions-only half of the same
 * fix, for when a longão's roster changes mid-run (someone joins after the
 * row was created). Rewrites permissions and nothing else, and refuses to
 * touch a row that isn't the caller's.
 */
async function refreshLiveAudience({ userId: athleteId, body, client, res, error }) {
  const runId = String(body.runId ?? "").trim();
  if (!runId) return res.json({ error: "missing-run-id" }, 400);

  const sessionCode = body.sessionCode ? String(body.sessionCode).toUpperCase() : "";
  const tablesDB = new TablesDB(client);

  try {
    const existing = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "live_runs", rowId: runId });
    if (existing.userId !== athleteId) return res.json({ error: "forbidden" }, 403);

    const viewerIds = await resolveLiveViewers(
      tablesDB,
      athleteId,
      Array.isArray(body.viewerIds) ? body.viewerIds : [],
      sessionCode,
    );
    const row = await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: "live_runs",
      rowId: runId,
      data: {},
      permissions: liveRunPermissions(athleteId, viewerIds),
    });
    return res.json({ ok: true, row });
  } catch (err) {
    if (err.code === 404) return res.json({ error: "not-found" }, 404);
    error(`refresh-live-audience: falha atualizando ${runId} de ${athleteId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "refresh-presence" — the "correr por perto" one-shot ping. Unlike
 * live_runs' split between start/refresh (built for a run's 6s-cadence
 * position writes), presence pings are rare — at most once per app
 * foreground, throttled client-side to every ~10min — so it's cheap enough
 * to always recompute the friend audience and rewrite the whole row
 * together in one call, no separate "refresh audience" action needed the
 * way live_runs has one.
 *
 * Requires `profiles.nearbyOptIn` to already be on: a client-side toggle
 * alone protects nothing (anyone could call this action directly), so the
 * actual gate is checked here, server-side, before ever writing a
 * location anywhere a friend could read it.
 */
async function refreshPresence({ userId, body, client, res, error }) {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.json({ error: "invalid-location" }, 400);

  const tablesDB = new TablesDB(client);
  try {
    const profile = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "profiles", rowId: userId });
    if (!profile.nearbyOptIn) return res.json({ error: "not-opted-in" }, 403);
  } catch (err) {
    if (err.code === 404) return res.json({ error: "no-profile" }, 404);
    error(`refresh-presence: falha lendo profile de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  let friendIds;
  try {
    friendIds = [...(await listAcceptedFriendIds(tablesDB, userId))];
  } catch (err) {
    error(`refresh-presence: falha resolvendo amigos de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  const permissions = [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
    ...friendIds.map((id) => Permission.read(Role.user(id))),
  ];

  try {
    const row = await tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: "friend_presence",
      rowId: userId,
      data: { lat, lon, updatedAtMs: Date.now() },
      permissions,
    });
    return res.json({ ok: true, row });
  } catch (err) {
    error(`refresh-presence: falha gravando presença de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

const VALID_COACH_CUES = new Set(["reduce-pace", "increase-pace", "stop"]);

/** Push copy for each cue — the exact same fixed phrase voiceBank.ts's COACH_CUE_CLIPS already announces by voice, so a push landing on a locked screen says the same thing the athlete would have heard live. */
const COACH_CUE_PUSH_BODY = {
  "reduce-pace": "Seu treinador está pedindo pra você reduzir o ritmo.",
  "increase-pace": "Seu treinador quer que você acelere.",
  stop: "Seu treinador está pedindo pra você parar.",
};

/**
 * action: "send-coach-cue" — the pre-recorded voice-message half of "coach
 * ao vivo". A coach only ever holds `read` on a student's live_runs row
 * (see `liveRunPermissions` above), never `update` — writing the cue
 * signal has to go through here for the same reason `refresh-live-audience`
 * does: a plain client session can't touch a row it doesn't own. Clearing
 * the signal after the clip plays is NOT done here — the athlete already
 * owns `update` on their own row, so that ack is a direct client write
 * (see `ackCoachCue` in src/lib/liveRuns.ts).
 */
async function sendCoachCue({ userId: coachId, body, client, res, error }) {
  const studentId = String(body.studentId ?? "").trim();
  const cueId = String(body.cueId ?? "");
  if (!studentId) return res.json({ error: "missing-student-id" }, 400);
  if (!VALID_COACH_CUES.has(cueId)) return res.json({ error: "invalid-cue" }, 400);

  const tablesDB = new TablesDB(client);
  try {
    const accepted = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "coach_relationships",
      queries: [
        Query.equal("coachId", coachId),
        Query.equal("studentId", studentId),
        Query.equal("status", "accepted"),
        Query.limit(1),
      ],
    });
    if (accepted.rows.length === 0) return res.json({ error: "not-coach" }, 403);

    const liveRows = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "live_runs",
      queries: [Query.equal("userId", studentId), Query.limit(1)],
    });
    const liveRow = liveRows.rows[0];
    if (!liveRow) return res.json({ error: "not-live" }, 404);

    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: "live_runs",
      rowId: liveRow.$id,
      data: { pendingCueId: cueId, pendingCueAtMs: Date.now() },
    });

    // Best-effort, alongside the realtime `pendingCueId` above (which only
    // reaches the student while the running screen is actually open and
    // polling) — a push covers the screen-locked/backgrounded case the
    // realtime path can't, so the cue still lands even if it isn't heard.
    try {
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Aviso do treinador",
        body: COACH_CUE_PUSH_BODY[cueId],
        users: [studentId],
      });
    } catch (err) {
      error(`send-coach-cue: push best-effort falhou pra ${studentId}: ${err.message}`);
    }

    return res.json({ ok: true });
  } catch (err) {
    error(`send-coach-cue: falha (${coachId} -> ${studentId}): ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "share-run" — replaces src/lib/runsSync.ts's client-side
 * shareRunWithCoaches, which tried to grant Permission.read(Role.user(coachId))
 * straight from a plain client session and got refused by Appwrite every
 * time (same `401 user_unauthorized` root cause already fixed in
 * send-friend-request/start-live-session — see those comments; this one
 * went unnoticed because the client swallowed the rejection in a bare
 * `catch`). Also the only place a run's `visibility` ever becomes
 * "friends", which is what list-friends-feed below reads.
 *
 * `coachIds`/`shareWithFriends` are independent knobs, not one combined
 * "audience" — "Enviar pro treinador" (coachIds only) and "Compartilhar
 * com amigos" (shareWithFriends only) are two separate buttons in
 * run-detail.tsx, and neither should silently undo the other's effect on
 * the same row. `shareWithFriends` is tri-state on the wire (omitted vs.
 * true vs. false): omitted means "this call isn't about friend
 * visibility, leave whatever it already was" — otherwise sharing with a
 * new coach would quietly turn friend-sharing back off, and vice versa.
 */
async function shareRun({ userId, body, client, res, error }) {
  const startedAtMs = Number(body.startedAtMs);
  const finishedAtMs = Number(body.finishedAtMs);
  const distanceMeters = Number(body.distanceMeters);
  const movingSeconds = Number(body.movingSeconds);
  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(finishedAtMs) ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(movingSeconds)
  ) {
    return res.json({ error: "invalid-run" }, 400);
  }

  const requestedCoachIds = Array.isArray(body.coachIds)
    ? body.coachIds.filter((id) => typeof id === "string" && id)
    : [];
  const shareWithFriends = typeof body.shareWithFriends === "boolean" ? body.shareWithFriends : null;
  const points = typeof body.points === "string" ? body.points : undefined;
  const shoeName = typeof body.shoeName === "string" ? body.shoeName : undefined;

  // Both computed client-side (the athlete's own device already has the
  // full history/track list needed) and only ever taken as a snapshot —
  // this Function never re-derives a PR against anyone else's data, it
  // just stores what was sent. Kept short (`.slice`) since these only
  // feed compact feed-card badges, not a source of truth for anything.
  const achievements = Array.isArray(body.achievements)
    ? body.achievements.filter((label) => typeof label === "string" && label).slice(0, 20)
    : undefined;
  const tracks = Array.isArray(body.tracks)
    ? body.tracks
        .filter((t) => t && typeof t.name === "string" && typeof t.artist === "string")
        .slice(0, 10)
        .map((t) => ({ name: t.name, artist: t.artist }))
    : undefined;
  // The athlete's own free-text vibe for the post ("pace paquera" and
  // friends) — trimmed and capped to the column size, never templated or
  // suggested server-side.
  const caption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim().slice(0, 140) : undefined;
  const placeName = typeof body.placeName === "string" && body.placeName.trim() ? body.placeName.trim() : undefined;
  const elevationGainMeters = Number.isFinite(body.elevationGainMeters) ? Number(body.elevationGainMeters) : undefined;
  // A real photo of the post itself (2026-09-01), not just of a comment on
  // it — already uploaded to the shared avatars bucket client-side (see
  // uploadSharedPhoto in src/lib/avatar.ts); this only ever stores the URL.
  const photoUrl =
    typeof body.photoUrl === "string" && body.photoUrl.trim() ? body.photoUrl.trim().slice(0, 2000) : undefined;

  const tablesDB = new TablesDB(client);
  const startedAtIso = new Date(startedAtMs).toISOString();

  let existingRow = null;
  try {
    const existing = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "runs",
      queries: [Query.equal("userId", userId), Query.equal("startedAt", startedAtIso), Query.limit(1)],
    });
    existingRow = existing.rows[0] ?? null;
  } catch (err) {
    error(`share-run: falha buscando corrida existente de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  let coachIds = [];
  if (requestedCoachIds.length > 0) {
    try {
      const accepted = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "coach_relationships",
        queries: [Query.equal("studentId", userId), Query.equal("status", "accepted"), Query.limit(100)],
      });
      const acceptedCoachIds = new Set(accepted.rows.map((row) => row.coachId));
      coachIds = requestedCoachIds.filter((id) => acceptedCoachIds.has(id));
    } catch (err) {
      error(`share-run: falha validando treinadores de ${userId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
    }
  }

  if (!existingRow && coachIds.length === 0 && shareWithFriends !== true) {
    return res.json({ error: "no-audience" }, 400);
  }

  const visibility =
    shareWithFriends === null ? (existingRow?.visibility ?? "private") : shareWithFriends ? "friends" : "private";

  const data = {
    userId,
    startedAt: startedAtIso,
    finishedAt: new Date(finishedAtMs).toISOString(),
    distanceMeters,
    movingSeconds,
    points,
    shoeName,
    achievements: achievements && achievements.length > 0 ? JSON.stringify(achievements) : undefined,
    tracks: tracks && tracks.length > 0 ? JSON.stringify(tracks) : undefined,
    caption,
    placeName,
    elevationGainMeters,
    photoUrl,
    visibility,
  };

  const ownerPermissions = [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
  const coachPermissions = coachIds.map((coachId) => Permission.read(Role.user(coachId)));

  // Only coaches newly granted `read` on this row get pushed below — a
  // coach already reading it (re-sharing/editing caption, etc.) already
  // knows, and every field here is real Appwrite $permissions syntax
  // (`read("user:<id>")`), not a guess at the format.
  const existingCoachReadIds = new Set(
    (existingRow?.$permissions ?? [])
      .map((p) => /^read\("user:([^"]+)"\)$/.exec(p)?.[1])
      .filter((id) => typeof id === "string"),
  );
  const newCoachIds = coachIds.filter((id) => !existingCoachReadIds.has(id));

  try {
    let row;
    if (existingRow) {
      const permissions = [...new Set([...existingRow.$permissions, ...ownerPermissions, ...coachPermissions])];
      row = await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: "runs",
        rowId: existingRow.$id,
        data,
        permissions,
      });
    } else {
      row = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: "runs",
        rowId: ID.unique(),
        data,
        permissions: [...ownerPermissions, ...coachPermissions],
      });
    }

    if (newCoachIds.length > 0) {
      try {
        const athleteName = await resolveDisplayName(tablesDB, userId);
        const km = (distanceMeters / 1000).toFixed(1).replace(".", ",");
        const messaging = new Messaging(client);
        await messaging.createPush({
          messageId: ID.unique(),
          title: "Nova corrida compartilhada",
          body: `${athleteName} compartilhou uma corrida de ${km} km com você.`,
          users: newCoachIds,
        });
      } catch (err) {
        error(`share-run: push best-effort falhou pra ${newCoachIds.join(",")}: ${err.message}`);
      }
    }

    return res.json({ ok: true, row });
  } catch (err) {
    error(`share-run: falha compartilhando corrida de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "share-custom-route" — grants read on a saved, hand-drawn route
 * (`custom_routes`) to a specific, currently-checked set of accepted
 * friends. Same root cause as send-friend-request/share-run: a plain
 * client session can never assign Permission.read(Role.user(friendId)) to
 * anyone but itself, so this has to run with the privileged key. Creating
 * the route itself never goes through this Function — see
 * `src/lib/customRoutes.ts`'s `createCustomRoute` and its own comment for
 * why that step only ever needs the owner's own permissions, which a
 * plain client session already holds.
 *
 * Unlike share-run's coachIds (additive-only — a button per coach, never a
 * revoke path in the UI), this is a real multi-select picker: the caller
 * always sends the FULL set of friend ids that should currently have
 * access, and this replaces the friend-read grants wholesale (an
 * unchecked friend loses read here, not just a newly-checked one gaining
 * it). The owner's own three permissions are always re-asserted
 * regardless.
 */
async function shareCustomRoute({ userId, body, client, res, error }) {
  const routeId = String(body.routeId ?? "").trim();
  if (!routeId) return res.json({ error: "missing-route-id" }, 400);

  const requestedFriendIds = Array.isArray(body.friendIds)
    ? body.friendIds.filter((id) => typeof id === "string" && id && id !== userId)
    : [];

  const tablesDB = new TablesDB(client);
  let route;
  try {
    route = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "custom_routes", rowId: routeId });
  } catch (err) {
    if (err.code === 404) return res.json({ error: "not-found" }, 404);
    error(`share-custom-route: falha lendo rota ${routeId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  if (route.ownerId !== userId) return res.json({ error: "forbidden" }, 403);

  let friendIds;
  try {
    const accepted = await listAcceptedFriendIds(tablesDB, userId);
    friendIds = requestedFriendIds.filter((id) => accepted.has(id));
  } catch (err) {
    error(`share-custom-route: falha resolvendo amigos de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  const previousFriendIds = new Set(
    (route.$permissions ?? [])
      .map((p) => /^read\("user:([^"]+)"\)$/.exec(p)?.[1])
      .filter((id) => typeof id === "string" && id !== userId),
  );
  const newlyAddedIds = friendIds.filter((id) => !previousFriendIds.has(id));

  const permissions = [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
    ...friendIds.map((id) => Permission.read(Role.user(id))),
  ];

  let updated;
  try {
    updated = await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: "custom_routes",
      rowId: routeId,
      data: {},
      permissions,
    });
  } catch (err) {
    error(`share-custom-route: falha atualizando permissões de ${routeId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  if (newlyAddedIds.length > 0) {
    try {
      const ownerName = await resolveDisplayName(tablesDB, userId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Nova rota compartilhada",
        body: `${ownerName} compartilhou uma rota com você: "${route.name}".`,
        users: newlyAddedIds,
      });
    } catch (err) {
      error(`share-custom-route: push best-effort falhou pra ${newlyAddedIds.join(",")}: ${err.message}`);
    }
  }

  return res.json({ ok: true, row: updated });
}

/**
 * action: "list-friends-feed" — the read half of the friends activity
 * feed. Deliberately NOT a per-row `Permission.read(Role.user(friendId))`
 * grant on each `runs` row, unlike coach-sharing above — a friends feed's
 * audience is "whoever is an accepted friend right now", which changes
 * continuously, and re-granting permission on every past run each time a
 * new friendship is accepted doesn't scale (and old runs would stay
 * invisible to a brand-new friend forever). Instead this resolves the
 * friend list fresh on every call with the privileged key and reads
 * `runs` directly; `visibility: "friends"` on a row is a filter value
 * this query reads, never a real ACL grant.
 */
/**
 * Whether `run` also has a coach reading it — asked for directly ("se a
 * corrida for compartilhada... com supervisao de treinador seria legal
 * mostrar isso no card", 2026-09-01). share-run is the only place that ever
 * grants a per-row `read` on a `runs` row (see its own comment: friends
 * never get one, list-friends-feed resolves that audience fresh instead),
 * so any `read("user:<id>")` permission other than the owner's own three
 * (read/update/delete, always granted to `userId`) can only be a coach.
 * Cheaper than a coach_relationships lookup per run, and just as correct —
 * a permission that exists at all already proves share-run validated it.
 */
function hasCoachPermission(run) {
  return (run.$permissions ?? []).some((permission) => {
    const match = /^read\("user:([^"]+)"\)$/.exec(permission);
    return match !== null && match[1] !== run.userId;
  });
}

/** `run.achievements`/`run.tracks` are JSON strings written by share-run — never trust a stored string is still valid JSON of the right shape (a future schema change, or a row from before either column existed), so a parse failure degrades to "no badges/no track" rather than failing the whole feed item. */
function safeParseJsonArray(json) {
  if (typeof json !== "string" || !json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function listFriendsFeed({ userId, client, res, error }) {
  const tablesDB = new TablesDB(client);

  let friendIds;
  try {
    friendIds = [...(await listAcceptedFriendIds(tablesDB, userId))];
  } catch (err) {
    error(`list-friends-feed: falha resolvendo amigos de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  // Includes the caller's own id — a Strava-style feed shows your own
  // shared runs interleaved with friends', not just friends'. Still gated
  // by `visibility: "friends"` below: your own run only shows here once
  // you've actually toggled "Compartilhar com amigos" on it, same as any
  // friend's — this is "everyone the friends audience can see, including
  // me", not a bypass of that toggle for your own posts.
  const audienceIds = [userId, ...friendIds];

  let runs;
  try {
    const result = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "runs",
      queries: [
        Query.equal("userId", audienceIds),
        Query.equal("visibility", "friends"),
        Query.orderDesc("startedAt"),
        Query.limit(30),
      ],
    });
    runs = result.rows;
  } catch (err) {
    error(`list-friends-feed: falha lendo runs pra ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  if (runs.length === 0) return res.json({ ok: true, items: [] });

  const ownerIds = [...new Set(runs.map((run) => run.userId))];
  const profilesById = new Map();
  try {
    const profiles = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      queries: [Query.equal("$id", ownerIds), Query.limit(ownerIds.length)],
    });
    for (const profile of profiles.rows) profilesById.set(profile.$id, profile);
  } catch (err) {
    // Feed sem nome/avatar ainda é mais útil que feed nenhum.
    error(`list-friends-feed: falha lendo profiles pra ${userId}: ${err.message}`);
  }

  const runIds = runs.map((run) => run.$id);
  const kudosByRun = new Map();
  try {
    const kudosRows = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "run_kudos",
      queries: [Query.equal("runRowId", runIds), Query.limit(1000)],
    });
    for (const kudo of kudosRows.rows) {
      const entry = kudosByRun.get(kudo.runRowId) ?? { count: 0, givenByMe: false };
      entry.count += 1;
      if (kudo.giverId === userId) entry.givenByMe = true;
      kudosByRun.set(kudo.runRowId, entry);
    }
  } catch (err) {
    // Mesma degradação: feed sem contagem de kudos em vez de falhar tudo.
    error(`list-friends-feed: falha lendo run_kudos pra ${userId}: ${err.message}`);
  }

  const items = runs.map((run) => {
    const profile = profilesById.get(run.userId);
    const kudos = kudosByRun.get(run.$id) ?? { count: 0, givenByMe: false };
    return {
      runRowId: run.$id,
      userId: run.userId,
      displayName: profile?.displayName ?? "Corredor(a)",
      avatarUrl: profile?.avatarUrl ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      distanceMeters: run.distanceMeters,
      movingSeconds: run.movingSeconds,
      shoeName: run.shoeName ?? null,
      // Raw JSON strings, parsed client-side (same shape the client sent
      // to share-run) — `points` in particular can be a ~200KB string
      // across 30 rows, no reason to parse-and-reserialize it here.
      points: run.points ?? null,
      achievements: safeParseJsonArray(run.achievements),
      tracks: safeParseJsonArray(run.tracks),
      caption: run.caption ?? null,
      placeName: run.placeName ?? null,
      elevationGainMeters: run.elevationGainMeters ?? null,
      photoUrl: run.photoUrl ?? null,
      kudosCount: kudos.count,
      kudosGivenByMe: kudos.givenByMe,
      coachSupervised: hasCoachPermission(run),
    };
  });

  return res.json({ ok: true, items });
}

/**
 * action: "toggle-run-kudos" — give or take back a kudos on a friend's
 * shared run. Same relationship check as list-friends-feed above (a
 * fresh listAcceptedFriendIds call, not a stored permission): kudos is
 * only legitimate on an actual accepted friend's run that they chose to
 * share with friends, never your own run or a stranger's who happens to
 * know a row id.
 *
 * `run_kudos`'s row id is a hash of `runRowId:giverId`, not the two
 * concatenated raw (`.slice(0, 36)` on a plain concatenation is exactly
 * the bug that caused real id collisions in city_races, see
 * PROJECT-CONTEXT.md) — deterministic either way, so a repeat call is a
 * clean toggle (create if absent, delete if present) without needing a
 * query first.
 */
async function toggleRunKudos({ userId, body, client, res, error }) {
  const runRowId = String(body.runRowId ?? "").trim();
  if (!runRowId) return res.json({ error: "missing-run-row-id" }, 400);

  const tablesDB = new TablesDB(client);
  let run;
  try {
    run = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "runs", rowId: runRowId });
  } catch (err) {
    if (err.code === 404) return res.json({ error: "not-found" }, 404);
    error(`toggle-run-kudos: falha lendo run ${runRowId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  if (run.userId === userId) return res.json({ error: "self" }, 400);
  if (run.visibility !== "friends") return res.json({ error: "not-shared" }, 403);

  try {
    const friendIds = await listAcceptedFriendIds(tablesDB, userId);
    if (!friendIds.has(run.userId)) return res.json({ error: "not-friends" }, 403);
  } catch (err) {
    error(`toggle-run-kudos: falha resolvendo amigos de ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  const kudosRowId = createHash("sha256").update(`${runRowId}:${userId}`).digest("hex").slice(0, 36);

  try {
    await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "run_kudos", rowId: kudosRowId });
    await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "run_kudos", rowId: kudosRowId });
  } catch (err) {
    if (err.code !== 404) {
      error(`toggle-run-kudos: falha checando kudos existente ${kudosRowId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
    }
    try {
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: "run_kudos",
        rowId: kudosRowId,
        data: { runRowId, giverId: userId },
        permissions: [
          Permission.read(Role.user(userId)),
          Permission.delete(Role.user(userId)),
          Permission.read(Role.user(run.userId)),
        ],
      });
    } catch (createErr) {
      error(`toggle-run-kudos: falha criando kudos ${kudosRowId}: ${createErr.message}`);
      return res.json({ error: "failed" }, 500);
    }

    // Best-effort, giving-kudos direction only — removing one stays quiet,
    // same as Strava's own kudos never notifying an un-kudos. `run.userId`
    // already holds `read` on this exact kudos row (granted above), so this
    // can't be used to push anyone the row itself doesn't already concern.
    try {
      const giverName = await resolveDisplayName(tablesDB, userId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Kudos!",
        body: `${giverName} deu kudos na sua corrida.`,
        users: [run.userId],
      });
    } catch (err) {
      error(`toggle-run-kudos: push best-effort falhou pra ${run.userId}: ${err.message}`);
    }
  }

  try {
    const kudosRows = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "run_kudos",
      queries: [Query.equal("runRowId", runRowId), Query.limit(1000)],
    });
    return res.json({
      ok: true,
      kudosCount: kudosRows.total,
      kudosGivenByMe: kudosRows.rows.some((row) => row.giverId === userId),
    });
  } catch (err) {
    error(`toggle-run-kudos: falha recontando kudos de ${runRowId}: ${err.message}`);
    return res.json({ ok: true });
  }
}

const MAX_COMMENT_TEXT = 500;
const MAX_COMMENT_PHOTO_URL = 2000;

/**
 * Whether `callerId` is allowed to see/comment on `run` — the run's own
 * owner, an accepted coach of the owner, or (only when the owner actually
 * turned it on) an accepted friend. Shared by add-run-comment and
 * list-run-comments below so a comment can never be written under an
 * access rule its own reader wouldn't also honor.
 */
async function canAccessRun(tablesDB, callerId, run) {
  if (run.userId === callerId) return true;

  if (run.visibility === "friends") {
    const friendIds = await listAcceptedFriendIds(tablesDB, run.userId);
    if (friendIds.has(callerId)) return true;
  }

  const coaches = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "coach_relationships",
    queries: [
      Query.equal("coachId", callerId),
      Query.equal("studentId", run.userId),
      Query.equal("status", "accepted"),
      Query.limit(1),
    ],
  });
  return coaches.rows.length > 0;
}

/**
 * action: "add-run-comment" — replaces src/lib/runComments.ts's old
 * client-side addRunComment, which tried to grant
 * Permission.read(Role.user(run.userId)) straight from a plain client
 * session (the commenting coach) — the exact same 401 user_unauthorized
 * root cause already fixed for friendships/live_runs/share-run/run_kudos,
 * just never noticed here because the bare `catch` swallowed the rejection
 * and nobody had checked whether a coach's comment ever actually landed.
 *
 * Follows run_kudos's model instead: rows get `permissions: []` (no
 * per-commenter grant at all — an audience for a run's comments changes
 * over time exactly like list-friends-feed's audience does, so there's no
 * stable per-row grant worth assigning), and every read goes through
 * list-run-comments below rather than a direct client query.
 *
 * Three legitimate callers, checked by canAccessRun: the run's own owner
 * (commenting on their own post, same as Strava), an accepted coach of the
 * owner (the original treinador/aluno.tsx use case), or an accepted friend
 * of the owner when the run is visible to friends (the new Feed comment
 * box). `photoUrl` is optional and never uploaded here — the client
 * uploads to the shared avatars Storage bucket first (see uploadCommentPhoto
 * in src/lib/avatar.ts) and only sends the resulting URL.
 */
async function addRunComment({ userId: authorId, body, client, res, error }) {
  const runRowId = String(body.runRowId ?? "").trim();
  if (!runRowId) return res.json({ error: "missing-run-row-id" }, 400);

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_COMMENT_TEXT) : "";
  const photoUrl =
    typeof body.photoUrl === "string" && body.photoUrl.trim()
      ? body.photoUrl.trim().slice(0, MAX_COMMENT_PHOTO_URL)
      : undefined;
  if (!text && !photoUrl) return res.json({ error: "empty-comment" }, 400);

  const tablesDB = new TablesDB(client);
  let run;
  try {
    run = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "runs", rowId: runRowId });
  } catch (err) {
    if (err.code === 404) return res.json({ error: "not-found" }, 404);
    error(`add-run-comment: falha lendo run ${runRowId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  let allowed;
  try {
    allowed = await canAccessRun(tablesDB, authorId, run);
  } catch (err) {
    error(`add-run-comment: falha checando acesso de ${authorId} a ${runRowId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  if (!allowed) return res.json({ error: "forbidden" }, 403);

  let comment;
  try {
    comment = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "run_comments",
      rowId: ID.unique(),
      data: { runRowId, authorId, text, photoUrl },
      permissions: [],
    });
  } catch (err) {
    error(`add-run-comment: falha criando comentário em ${runRowId} de ${authorId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  // Best-effort, same as every other Feed/coach notification here — never
  // notify yourself for a comment on your own run.
  if (run.userId !== authorId) {
    try {
      const authorName = await resolveDisplayName(tablesDB, authorId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Novo comentário",
        body: `${authorName} comentou na sua corrida.`,
        users: [run.userId],
      });
    } catch (err) {
      error(`add-run-comment: push best-effort falhou pra ${run.userId}: ${err.message}`);
    }
  }

  const authorProfile = await tablesDB
    .getRow({ databaseId: DATABASE_ID, tableId: "profiles", rowId: authorId })
    .catch(() => null);

  return res.json({
    ok: true,
    comment: {
      id: comment.$id,
      runRowId,
      authorId,
      displayName: authorProfile?.displayName ?? "Alguém",
      avatarUrl: authorProfile?.avatarUrl ?? null,
      text,
      photoUrl: photoUrl ?? null,
      createdAt: comment.$createdAt,
    },
  });
}

/**
 * action: "list-run-comments" — the read half. `permissions: []` on every
 * row (see add-run-comment above) means there's no client-side query left
 * that could ever work, so this is now the only way anyone — the athlete
 * looking at their own run, a coach, or a friend viewing the feed — sees a
 * comment. Access is re-checked per run with the same canAccessRun used to
 * write one, exactly like list-friends-feed re-checks "still friends" on
 * every read instead of trusting a permission stored at write time.
 */
async function listRunCommentsAction({ userId: callerId, body, client, res, error }) {
  const runRowIds = Array.isArray(body.runRowIds)
    ? [...new Set(body.runRowIds.filter((id) => typeof id === "string" && id))].slice(0, 50)
    : [];
  if (runRowIds.length === 0) return res.json({ ok: true, byRun: {} });

  const tablesDB = new TablesDB(client);
  let runs;
  try {
    const result = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "runs",
      queries: [Query.equal("$id", runRowIds), Query.limit(runRowIds.length)],
    });
    runs = result.rows;
  } catch (err) {
    error(`list-run-comments: falha lendo runs pra ${callerId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  const allowedRunIds = [];
  for (const run of runs) {
    try {
      if (await canAccessRun(tablesDB, callerId, run)) allowedRunIds.push(run.$id);
    } catch (err) {
      error(`list-run-comments: falha checando acesso de ${callerId} a ${run.$id}: ${err.message}`);
    }
  }
  if (allowedRunIds.length === 0) return res.json({ ok: true, byRun: {} });

  let comments;
  try {
    const result = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "run_comments",
      queries: [Query.equal("runRowId", allowedRunIds), Query.orderAsc("$createdAt"), Query.limit(500)],
    });
    comments = result.rows;
  } catch (err) {
    error(`list-run-comments: falha lendo comentários: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  if (comments.length === 0) return res.json({ ok: true, byRun: {} });

  const authorIds = [...new Set(comments.map((c) => c.authorId))];
  const profilesById = new Map();
  try {
    const profiles = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      queries: [Query.equal("$id", authorIds), Query.limit(authorIds.length)],
    });
    for (const profile of profiles.rows) profilesById.set(profile.$id, profile);
  } catch (err) {
    error(`list-run-comments: falha lendo profiles: ${err.message}`);
  }

  const byRun = {};
  for (const comment of comments) {
    const profile = profilesById.get(comment.authorId);
    const entry = {
      id: comment.$id,
      runRowId: comment.runRowId,
      authorId: comment.authorId,
      displayName: profile?.displayName ?? "Alguém",
      avatarUrl: profile?.avatarUrl ?? null,
      text: comment.text ?? "",
      photoUrl: comment.photoUrl ?? null,
      createdAt: comment.$createdAt,
    };
    (byRun[comment.runRowId] ??= []).push(entry);
  }

  return res.json({ ok: true, byRun });
}

/** action: "join-group-run" — privileged "friend of host" check before creating a group_run_participants row. Originally appwrite-functions/join-group-run. */
async function joinGroupRun({ userId, body, client, res, error }) {
  const sessionCode = String(body.sessionCode ?? "").toUpperCase();
  if (!sessionCode) {
    return res.json({ error: "missing-session-code" }, 400);
  }

  const tablesDB = new TablesDB(client);
  let groupRun;
  try {
    groupRun = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "group_runs", rowId: sessionCode });
  } catch {
    return res.json({ error: "not-found" }, 404);
  }
  if (groupRun.status === "closed") {
    return res.json({ error: "closed" }, 403);
  }
  if (new Date(groupRun.expiresAt).getTime() < Date.now()) {
    return res.json({ error: "expired" }, 403);
  }

  if (groupRun.hostId !== userId) {
    const [asRequester, asAddressee] = await Promise.all([
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "friendships",
        queries: [
          Query.equal("requesterId", userId),
          Query.equal("addresseeId", groupRun.hostId),
          Query.equal("status", "accepted"),
          Query.limit(1),
        ],
      }),
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "friendships",
        queries: [
          Query.equal("requesterId", groupRun.hostId),
          Query.equal("addresseeId", userId),
          Query.equal("status", "accepted"),
          Query.limit(1),
        ],
      }),
    ]);
    const isFriendOfHost = asRequester.rows.length > 0 || asAddressee.rows.length > 0;
    if (!isFriendOfHost) {
      return res.json({ error: "not-friends" }, 403);
    }
  }

  let joined = true;
  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      rowId: `${sessionCode}_${userId}`,
      // Update granted alongside delete — a self-grant (the row's own
      // userId getting update on its own row), not the "permission for
      // another user's role" bug class documented in PROJECT-CONTEXT.md.
      // It's what lets the lobby's "mark myself ready" toggle be a plain
      // client-direct updateRow afterward, no Function needed for that.
      data: { sessionCode, userId, joinedAt: new Date().toISOString(), ready: false },
      permissions: [Permission.delete(Role.user(userId)), Permission.update(Role.user(userId))],
    });
  } catch (err) {
    if (err.code === 409) {
      joined = false; // already a participant — not a fresh join, skip the host push below
    } else {
      error(`Falha ao entrar em ${sessionCode} para ${userId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
    }
  }

  // Best-effort, same reasoning as send-friend-request's own push: a missed
  // notification just means the host finds out next time they check the
  // lobby instead of right away. Never fires for the host auto-joining
  // their own session (createGroupRun's own call into this action), nor
  // for a redundant re-join (409 above).
  if (joined && groupRun.hostId !== userId) {
    try {
      const joinerName = await resolveDisplayName(tablesDB, userId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Alguém entrou na corrida",
        body: `${joinerName} entrou na sua sala de espera.`,
        users: [groupRun.hostId],
      });
    } catch (err) {
      error(`join-group-run: push best-effort falhou pra ${groupRun.hostId}: ${err.message}`);
    }
  }

  return res.json({ ok: true, groupRun });
}

/** Mirrors friendships.ts's own `pairKeyOf` exactly — same colon-joined, sorted-pair convention, so a row this Function creates dedupes against one the client created and vice versa. */
function pairKeyOf(a, b) {
  return [a, b].sort().join(":");
}

/**
 * action: "pair-run-session" — the QR-pairing path for "corrida em dupla"
 * (see PROJECT-CONTEXT.md). Scanning a session QR calls this instead of
 * "join-group-run" directly, because that action requires the joiner to
 * already be an accepted friend of the host — a real privacy boundary "o
 * atleta pediu" for longão (see join-group-run's own comment), which a
 * QR-paired stranger obviously isn't yet. Rather than carve a
 * friendship-free exception into that boundary (reopening exactly the kind
 * of access an LGPD audit pass already hardened), this action creates —
 * or upgrades an existing pending one to — an ACCEPTED friendship between
 * host and scanner first, then joins the same way join-group-run does.
 * Physical QR scanning is a strong enough mutual-consent signal that
 * skipping the normal request/accept dance is the deliberate trade-off
 * here (product decision, 2026-08-23) — the two really do become friends,
 * not just "run buddies for one session".
 */
async function pairRunSession({ userId, body, client, res, error }) {
  const sessionCode = String(body.sessionCode ?? "").toUpperCase();
  if (!sessionCode) {
    return res.json({ error: "missing-session-code" }, 400);
  }

  const tablesDB = new TablesDB(client);
  let groupRun;
  try {
    groupRun = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "group_runs", rowId: sessionCode });
  } catch {
    return res.json({ error: "not-found" }, 404);
  }
  if (groupRun.status === "closed") {
    return res.json({ error: "closed" }, 403);
  }
  if (new Date(groupRun.expiresAt).getTime() < Date.now()) {
    return res.json({ error: "expired" }, 403);
  }

  const hostId = groupRun.hostId;
  if (hostId === userId) {
    return res.json({ error: "self" }, 400);
  }

  const pairKey = pairKeyOf(hostId, userId);
  try {
    const existing = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      queries: [Query.equal("pairKey", pairKey), Query.limit(1)],
    });
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status !== "accepted") {
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: "friendships",
          rowId: row.$id,
          data: { status: "accepted" },
        });
      }
    } else {
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: "friendships",
        rowId: ID.unique(),
        data: { requesterId: hostId, addresseeId: userId, status: "accepted", pairKey },
        permissions: [
          Permission.read(Role.user(hostId)),
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(hostId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(hostId)),
          Permission.delete(Role.user(userId)),
        ],
      });
    }
  } catch (err) {
    error(`pair-run-session: falha ao criar/aceitar amizade entre ${hostId} e ${userId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  let joined = true;
  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      rowId: `${sessionCode}_${userId}`,
      // See join-group-run's identical grant for why `update` is safe to
      // add here (self-grant, unlocks the lobby's client-direct "ready" toggle).
      data: { sessionCode, userId, joinedAt: new Date().toISOString(), ready: false },
      permissions: [Permission.delete(Role.user(userId)), Permission.update(Role.user(userId))],
    });
  } catch (err) {
    if (err.code === 409) {
      joined = false; // already a participant — skip the host push below
    } else {
      error(`pair-run-session: falha ao entrar em ${sessionCode} para ${userId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
    }
  }

  // Best-effort — see join-group-run's identical push for the reasoning.
  // `hostId === userId` is already rejected above ("self"), so no extra
  // guard needed here.
  if (joined) {
    try {
      const joinerName = await resolveDisplayName(tablesDB, userId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Alguém entrou na corrida",
        body: `${joinerName} escaneou seu QR e já está na sala de espera.`,
        users: [hostId],
      });
    } catch (err) {
      error(`pair-run-session: push best-effort falhou pra ${hostId}: ${err.message}`);
    }
  }

  return res.json({ ok: true, groupRun });
}

/**
 * action: "start-group-run" — writes the shared "go" signal every lobby
 * poll reacts to (`group_runs.startedAt`), then best-effort pushes every
 * other participant that the run is starting. Function-mediated rather
 * than a plain client-side updateRow because only the host holds
 * row-level `update` on `group_runs` (granted at createGroupRun time) —
 * a non-host participant's client has no permission to write this row at
 * all, same reasoning that already moved start-live-session/
 * refresh-live-audience server-side. Idempotent: a second call after
 * `startedAt` is already set is a no-op success, so two people tapping
 * "Começar" within the same lobby poll window can't double-fire the push
 * or clobber an earlier startedAt with a later one.
 */
async function startGroupRun({ userId, body, client, res, error }) {
  const sessionCode = String(body.sessionCode ?? "").toUpperCase();
  if (!sessionCode) {
    return res.json({ error: "missing-session-code" }, 400);
  }

  const tablesDB = new TablesDB(client);
  let groupRun;
  try {
    groupRun = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "group_runs", rowId: sessionCode });
  } catch {
    return res.json({ error: "not-found" }, 404);
  }
  if (groupRun.status === "closed") {
    return res.json({ error: "closed" }, 403);
  }

  // Caller must actually be a participant — not open to anyone who merely
  // knows the code, unlike the read-only listParticipants call.
  try {
    await tablesDB.getRow({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      rowId: `${sessionCode}_${userId}`,
    });
  } catch {
    return res.json({ error: "not-a-participant" }, 403);
  }

  if (groupRun.startedAt) {
    return res.json({ ok: true, groupRun }); // already started — idempotent no-op
  }

  const startedAt = new Date().toISOString();
  let updated;
  try {
    updated = await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: "group_runs",
      rowId: sessionCode,
      data: { startedAt },
    });
  } catch (err) {
    error(`start-group-run: falha ao marcar início de ${sessionCode}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  try {
    const participants = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      queries: [Query.equal("sessionCode", sessionCode), Query.limit(50)],
    });
    const others = participants.rows.map((row) => row.userId).filter((id) => id !== userId);
    if (others.length > 0) {
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "A corrida vai começar",
        body: `${groupRun.name} está começando agora.`,
        users: others,
      });
    }
  } catch (err) {
    error(`start-group-run: push best-effort falhou pra ${sessionCode}: ${err.message}`);
  }

  return res.json({ ok: true, groupRun: updated });
}

/**
 * Whitelists+validates the `RunnerProfile` fields out of a request body —
 * shared by `claim-owned-row`'s `runner_profile_sync` branch (first row)
 * and nothing else, since every later write goes through a direct client
 * `updateRow` (see runnerProfileSync.ts). Mirrors the same optionality and
 * range checks as `sanitize()` in src/lib/runnerProfile.ts (kept in sync by
 * hand, same reasoning as facts.ts/volumeProgression.ts's own duplication
 * comments — this Function has no build step to import from the app).
 */
function runnerProfileSyncFields(body) {
  const out = {};
  if (typeof body.goalDistanceMeters === "number" && body.goalDistanceMeters > 0) {
    out.goalDistanceMeters = body.goalDistanceMeters;
  }
  if (typeof body.goalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.goalDate)) {
    out.goalDate = body.goalDate;
  }
  if (typeof body.planStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.planStartDate)) {
    out.planStartDate = body.planStartDate;
  }
  if (typeof body.recentRaceDistanceMeters === "number" && body.recentRaceDistanceMeters > 0) {
    out.recentRaceDistanceMeters = body.recentRaceDistanceMeters;
  }
  if (typeof body.recentRaceTimeSeconds === "number" && body.recentRaceTimeSeconds > 0) {
    out.recentRaceTimeSeconds = body.recentRaceTimeSeconds;
  }
  if (typeof body.weeklyRunDays === "number" && body.weeklyRunDays >= 2 && body.weeklyRunDays <= 6) {
    out.weeklyRunDays = body.weeklyRunDays;
  }
  if (typeof body.weightKg === "number" && body.weightKg >= 25 && body.weightKg <= 250) {
    out.weightKg = body.weightKg;
  }
  if (body.weeklyTargetKind === "runs" || body.weeklyTargetKind === "km") {
    out.weeklyTargetKind = body.weeklyTargetKind;
  }
  if (typeof body.weeklyTargetValue === "number" && body.weeklyTargetValue > 0) {
    out.weeklyTargetValue = body.weeklyTargetValue;
  }
  return out;
}

/** action: "claim-owned-row" — the only path allowed to create the first profiles/profile_stats/place_run_stats/runner_profile_sync row for an account. Originally appwrite-functions/claim-owned-row. */
async function claimOwnedRow({ userId, body, client, res, error }) {
  const { tableId } = body;
  const tablesDB = new TablesDB(client);

  let rowId;
  let data;
  let permissions;

  if (tableId === "profiles") {
    const handle = String(body.handle ?? "").trim();
    const displayName = String(body.displayName ?? "").trim();
    if (!handle || !displayName) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = userId;
    data = { handle, displayName };
    permissions = [`update("user:${userId}")`, `delete("user:${userId}")`];
  } else if (tableId === "profile_stats") {
    const totalMeters = Number(body.totalMeters);
    const totalRuns = Number(body.totalRuns);
    if (!Number.isFinite(totalMeters) || totalMeters < 0 || !Number.isFinite(totalRuns) || totalRuns < 0) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = userId;
    data = { userId, totalMeters, totalRuns };
    permissions = [`read("any")`, `update("user:${userId}")`, `delete("user:${userId}")`];
  } else if (tableId === "runner_profile_sync") {
    const updatedAtMs = Number(body.updatedAtMs);
    if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = userId;
    data = { userId, ...runnerProfileSyncFields(body), updatedAtMs };
    // No read("any") — unlike profile_stats/place_run_stats, this is
    // private goal/weight data, never shown to anyone else (not even an
    // accepted coach — see runnerProfileSync.ts's own comment on why).
    permissions = [`read("user:${userId}")`, `update("user:${userId}")`, `delete("user:${userId}")`];
  } else if (tableId === "place_run_stats") {
    const placeId = String(body.placeId ?? "").trim();
    const totalMeters = Number(body.totalMeters);
    const runCount = Number(body.runCount);
    const lastRunAt = String(body.lastRunAt ?? "");
    if (!placeId || !Number.isFinite(totalMeters) || totalMeters < 0 || !Number.isFinite(runCount) || runCount < 0 || !lastRunAt) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = `${placeId}_${userId}`;
    data = { placeId, userId, totalMeters, runCount, lastRunAt };
    permissions = [`read("any")`, `update("user:${userId}")`, `delete("user:${userId}")`];
  } else {
    return res.json({ error: "unknown-table" }, 400);
  }

  try {
    const row = await tablesDB.createRow({ databaseId: DATABASE_ID, tableId, rowId, data, permissions });
    return res.json({ ok: true, row });
  } catch (err) {
    if (err.code === 409) {
      return res.json({ error: "already-exists" }, 409);
    }
    error(`claim-owned-row failed for ${tableId}/${rowId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

const RUN_ID_PATTERN = /^run_\d+_[a-z0-9]+$/;

/** Validates+extracts one run-summary payload — shared by `sync-run-summary` and `backfill-run-summaries`. Returns `null` on anything malformed rather than throwing, so a bad item in a backfill batch can be skipped instead of failing the whole call. */
function parseRunSummaryItem(item) {
  const runId = String(item?.runId ?? "");
  const startedAtMs = Number(item?.startedAtMs);
  const distanceMeters = Number(item?.distanceMeters);
  const movingSeconds = Number(item?.movingSeconds);
  if (
    !RUN_ID_PATTERN.test(runId) ||
    runId.length > 64 ||
    !Number.isFinite(startedAtMs) ||
    startedAtMs <= 0 ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    !Number.isFinite(movingSeconds) ||
    movingSeconds < 0
  ) {
    return null;
  }
  return { runId, startedAtMs, distanceMeters, movingSeconds };
}

/**
 * action: "sync-run-summary" — first-time creation of one `run_summaries`
 * row (a lightweight, GPS-free summary of a single completed run, synced
 * only when the athlete opted in — see runnerProfileSync.ts/preferences
 * for the `runSyncOptIn` gate this action's caller already checked before
 * invoking it). Unlike `claim-owned-row` (exactly one row per account),
 * `run_summaries` is many-rows-per-account keyed by the run's own local
 * id, so "is this the first time we've seen this id" is a per-call
 * existence check here rather than the one-row-per-account shape
 * `claim-owned-row` assumes — hence its own dedicated action instead of a
 * new `claim-owned-row` branch. Idempotent: a 409 on create (the row
 * already exists — a retried call, or the row was already synced) falls
 * back to `updateRow` rather than erroring, so a caller never needs to
 * pre-check existence itself.
 */
async function syncRunSummary({ userId, body, client, res, error }) {
  const parsed = parseRunSummaryItem(body);
  if (!parsed) return res.json({ error: "missing-fields" }, 400);

  const tablesDB = new TablesDB(client);
  const data = { userId, startedAtMs: parsed.startedAtMs, distanceMeters: parsed.distanceMeters, movingSeconds: parsed.movingSeconds };
  const permissions = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))];

  try {
    const row = await tablesDB.createRow({ databaseId: DATABASE_ID, tableId: "run_summaries", rowId: parsed.runId, data, permissions });
    return res.json({ ok: true, row });
  } catch (err) {
    if (err.code === 409) {
      try {
        const row = await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "run_summaries", rowId: parsed.runId, data });
        return res.json({ ok: true, row });
      } catch (updateErr) {
        error(`sync-run-summary: update fallback failed for ${parsed.runId}: ${updateErr.message}`);
        return res.json({ error: "failed" }, 500);
      }
    }
    error(`sync-run-summary failed for ${parsed.runId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "backfill-run-summaries" — same per-item create-or-update logic
 * as `sync-run-summary`, batched into one Function execution instead of
 * one per run, so turning `runSyncOptIn` on with years of local history
 * doesn't hammer the Functions API. Capped at 500 items per call
 * (src/lib/runSummariesSync.ts chunks a bigger history client-side); a
 * malformed item is skipped, not fatal to the rest of the batch.
 */
async function backfillRunSummaries({ userId, body, client, res, error }) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
  const tablesDB = new TablesDB(client);
  const permissions = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))];

  let created = 0;
  let skipped = 0;
  for (const item of items) {
    const parsed = parseRunSummaryItem(item);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const data = { userId, startedAtMs: parsed.startedAtMs, distanceMeters: parsed.distanceMeters, movingSeconds: parsed.movingSeconds };
    try {
      await tablesDB.createRow({ databaseId: DATABASE_ID, tableId: "run_summaries", rowId: parsed.runId, data, permissions });
      created += 1;
    } catch (err) {
      if (err.code === 409) {
        try {
          await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "run_summaries", rowId: parsed.runId, data });
          created += 1;
        } catch (updateErr) {
          error(`backfill-run-summaries: update fallback failed for ${parsed.runId}: ${updateErr.message}`);
          skipped += 1;
        }
      } else {
        error(`backfill-run-summaries failed for ${parsed.runId}: ${err.message}`);
        skipped += 1;
      }
    }
  }

  return res.json({ ok: true, created, skipped });
}

const WEEK_START_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validates+extracts one recovery-snapshot payload — every metric is independently optional (a real HealthKit/Health Connect read can come back with only some of the four filled), but at least one has to be present or there's nothing worth a row for. */
function parseRecoverySnapshotItem(body) {
  const weekStartIso = String(body?.weekStartIso ?? "");
  if (!WEEK_START_ISO_PATTERN.test(weekStartIso)) return null;

  const out = { weekStartIso };
  let hasAny = false;
  if (typeof body.restingHeartRateBpm === "number" && body.restingHeartRateBpm >= 0) {
    out.restingHeartRateBpm = body.restingHeartRateBpm;
    hasAny = true;
  }
  if (typeof body.hrvMs === "number" && body.hrvMs >= 0) {
    out.hrvMs = body.hrvMs;
    hasAny = true;
  }
  if (typeof body.vo2Max === "number" && body.vo2Max >= 0) {
    out.vo2Max = body.vo2Max;
    hasAny = true;
  }
  if (typeof body.sleepHours === "number" && body.sleepHours >= 0) {
    out.sleepHours = body.sleepHours;
    hasAny = true;
  }
  return hasAny ? out : null;
}

/**
 * action: "sync-recovery-snapshot" — same create-or-update-on-409 shape as
 * `sync-run-summary` above, one row per account per week
 * (rowId = `${userId}_${weekStartIso}`). Caller (recoverySync.ts) already
 * checked `Profile.recoverySyncOptIn` before invoking this — never
 * re-checked here, same convention as runSyncOptIn/healthDataConsent
 * elsewhere in this file.
 */
async function syncRecoverySnapshot({ userId, body, client, res, error }) {
  const parsed = parseRecoverySnapshotItem(body);
  if (!parsed) return res.json({ error: "missing-fields" }, 400);

  const tablesDB = new TablesDB(client);
  const rowId = `${userId}_${parsed.weekStartIso}`;
  const data = { userId, ...parsed };
  const permissions = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))];

  try {
    const row = await tablesDB.createRow({ databaseId: DATABASE_ID, tableId: "recovery_snapshots", rowId, data, permissions });
    return res.json({ ok: true, row });
  } catch (err) {
    if (err.code === 409) {
      try {
        const row = await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "recovery_snapshots", rowId, data });
        return res.json({ ok: true, row });
      } catch (updateErr) {
        error(`sync-recovery-snapshot: update fallback failed for ${rowId}: ${updateErr.message}`);
        return res.json({ error: "failed" }, 500);
      }
    }
    error(`sync-recovery-snapshot failed for ${rowId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "send-friend-request" — must run privileged, unlike every other
 * table write in this file that a plain client session could do on its own.
 * The row needs read/update/delete permission granted to the ADDRESSEE, a
 * role the requester's own session is never allowed to assign: Appwrite
 * only lets a caller grant permissions to roles it already holds itself
 * ("any", "users", or its own "user:<id>") when writing directly — never an
 * arbitrary other user's "user:<id>". A direct client createRow (the
 * original implementation in src/lib/friendships.ts) always failed with
 * `user_unauthorized` for exactly this reason — confirmed 2026-08-26 by
 * replaying the exact same three calls by hand against two disposable test
 * accounts. friendships had 0 rows in production despite real signups since
 * 2026-08-12 — this was silent since day one, not a regression.
 */
async function sendFriendRequest({ userId: requesterId, body, client, res, error }) {
  const handle = String(body.handle ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return res.json({ error: "not-found" }, 404);

  const tablesDB = new TablesDB(client);
  let target;
  try {
    const found = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      queries: [Query.equal("handle", handle), Query.limit(1)],
    });
    target = found.rows[0];
  } catch (err) {
    error(`send-friend-request: falha buscando handle "${handle}": ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  if (!target) return res.json({ error: "not-found" }, 404);

  const addresseeId = target.$id;
  if (addresseeId === requesterId) return res.json({ error: "self" }, 400);

  const pairKey = [requesterId, addresseeId].sort().join(":");
  try {
    const existing = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      queries: [Query.equal("pairKey", pairKey), Query.limit(1)],
    });
    if (existing.rows.length > 0) return res.json({ error: "duplicate" }, 409);

    const friendship = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      rowId: ID.unique(),
      data: { requesterId, addresseeId, status: "pending", pairKey },
      permissions: [
        Permission.read(Role.user(requesterId)),
        Permission.read(Role.user(addresseeId)),
        Permission.update(Role.user(addresseeId)),
        Permission.delete(Role.user(requesterId)),
        Permission.delete(Role.user(addresseeId)),
      ],
    });

    // Best-effort, same reasoning as sendMilestoneNotification/
    // subscribeUpdateTopic below: a missed push just means the addressee
    // finds out next time they open /amigos instead of right away — not
    // something worth failing the request over. `users: [addresseeId]`,
    // never the requester, so this can't be used to push anyone but the
    // person the friendship row itself already grants read to.
    try {
      const requesterName = await resolveDisplayName(tablesDB, requesterId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Novo pedido de amizade",
        body: `${requesterName} quer ser seu amigo no Xanthus.`,
        users: [addresseeId],
      });
    } catch (err) {
      error(`send-friend-request: push best-effort falhou pra ${addresseeId}: ${err.message}`);
    }

    return res.json({ ok: true, row: friendship });
  } catch (err) {
    if (err.code === 409) return res.json({ error: "duplicate" }, 409);
    error(`send-friend-request: falha criando friendship ${requesterId}->${addresseeId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "propose-coach-relationship" — same root cause and fix as
 * send-friend-request above: the row needs permission granted to whichever
 * side isn't the caller (`otherId`), which a direct client session can
 * never assign to someone else's "user:<id>". coach_relationships had the
 * identical bug, also 0 rows in production since creation.
 */
async function proposeCoachRelationship({ userId: myId, body, client, res, error }) {
  const handle = String(body.handle ?? "").trim().replace(/^@+/, "").toLowerCase();
  const asRole = body.asRole === "student" ? "student" : "coach";
  if (!handle) return res.json({ error: "not-found" }, 404);

  const tablesDB = new TablesDB(client);
  let target;
  try {
    const found = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      queries: [Query.equal("handle", handle), Query.limit(1)],
    });
    target = found.rows[0];
  } catch (err) {
    error(`propose-coach-relationship: falha buscando handle "${handle}": ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
  if (!target) return res.json({ error: "not-found" }, 404);

  const otherId = target.$id;
  if (otherId === myId) return res.json({ error: "self" }, 400);

  const coachId = asRole === "student" ? otherId : myId;
  const studentId = asRole === "student" ? myId : otherId;

  try {
    const existing = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "coach_relationships",
      queries: [Query.equal("coachId", coachId), Query.equal("studentId", studentId), Query.limit(1)],
    });
    if (existing.rows.length > 0) return res.json({ error: "duplicate" }, 409);

    const relationship = await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "coach_relationships",
      rowId: ID.unique(),
      data: { coachId, studentId, proposedBy: myId, status: "pending" },
      permissions: [
        Permission.read(Role.user(coachId)),
        Permission.read(Role.user(studentId)),
        Permission.update(Role.user(otherId)),
        Permission.delete(Role.user(coachId)),
        Permission.delete(Role.user(studentId)),
      ],
    });

    // Best-effort, same reasoning as send-friend-request's own push —
    // `users: [otherId]`, never the proposer, so this can't be used to
    // push anyone but the person the relationship row itself already
    // grants read to. Phrasing depends on which side is asking: asRole
    // "coach" means myId proposed themselves as the coach (otherId is
    // being asked to be the student), "student" is the reverse.
    try {
      const proposerName = await resolveDisplayName(tablesDB, myId);
      const messaging = new Messaging(client);
      await messaging.createPush({
        messageId: ID.unique(),
        title: "Novo pedido de treinador",
        body:
          asRole === "student"
            ? `${proposerName} quer que você seja treinador dele(a) no Xanthus.`
            : `${proposerName} quer ser seu treinador no Xanthus.`,
        users: [otherId],
      });
    } catch (err) {
      error(`propose-coach-relationship: push best-effort falhou pra ${otherId}: ${err.message}`);
    }

    return res.json({ ok: true, row: relationship });
  } catch (err) {
    if (err.code === 409) return res.json({ error: "duplicate" }, 409);
    error(`propose-coach-relationship: falha criando vínculo ${coachId}/${studentId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

/**
 * action: "notify-coach-request-accepted" — best-effort push telling the
 * original proposer that the other side just accepted. Fired by the
 * client (coachRelationships.ts's respondToCoachRequest) right after its
 * own direct `updateRow` succeeds — that update itself doesn't need this
 * Function (the accepter already holds `update` on the row from creation
 * time), but sending a push does, since Messaging is a server-only
 * service. Re-reads the row itself rather than trusting whatever the
 * client claims, and only pushes if it's genuinely accepted and the
 * caller is genuinely the side that isn't `proposedBy` — otherwise a
 * client could fire this at will to spam the other side's push, or to
 * notify someone before they actually accepted.
 */
async function notifyCoachRequestAccepted({ userId, body, client, res, error }) {
  const relationshipId = String(body.relationshipId ?? "").trim();
  if (!relationshipId) return res.json({ error: "missing-relationship-id" }, 400);

  const tablesDB = new TablesDB(client);
  let relationship;
  try {
    relationship = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "coach_relationships", rowId: relationshipId });
  } catch (err) {
    if (err.code === 404) return res.json({ error: "not-found" }, 404);
    error(`notify-coach-request-accepted: falha lendo ${relationshipId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  if (relationship.status !== "accepted") return res.json({ error: "not-accepted" }, 400);
  if (relationship.proposedBy === userId || (userId !== relationship.coachId && userId !== relationship.studentId)) {
    return res.json({ error: "not-accepter" }, 403);
  }

  try {
    const accepterName = await resolveDisplayName(tablesDB, userId);
    const messaging = new Messaging(client);
    await messaging.createPush({
      messageId: ID.unique(),
      title: "Pedido de treinador aceito",
      body:
        userId === relationship.studentId
          ? `${accepterName} aceitou ser seu aluno(a) no Xanthus.`
          : `${accepterName} aceitou ser seu treinador(a) no Xanthus.`,
      users: [relationship.proposedBy],
    });
  } catch (err) {
    error(`notify-coach-request-accepted: push best-effort falhou pra ${relationship.proposedBy}: ${err.message}`);
  }

  return res.json({ ok: true });
}

/** action: "set-plan-override" — a coach's explicit override of one week of a student's plan. Originally appwrite-functions/set-plan-override. */
async function setPlanOverride({ userId: coachId, body, client, res, error }) {
  const { studentId, weekStartDate, totalKm, sessions, note } = body;

  if (typeof studentId !== "string" || !studentId) {
    return res.json({ error: "missing-student-id" }, 400);
  }
  if (typeof weekStartDate !== "string" || !WEEK_START_DATE_RE.test(weekStartDate)) {
    return res.json({ error: "invalid-week-start-date" }, 400);
  }
  if (typeof totalKm !== "number" || !Number.isFinite(totalKm) || totalKm < 0 || totalKm > MAX_KM_PER_WEEK) {
    return res.json({ error: "invalid-total-km" }, 400);
  }
  if (!Array.isArray(sessions) || sessions.length !== 7) {
    return res.json({ error: "invalid-sessions" }, 400);
  }
  for (const session of sessions) {
    const validKind = VALID_KINDS.includes(session?.kind);
    const validKm = typeof session?.km === "number" && Number.isFinite(session.km) && session.km >= 0;
    if (!validKind || !validKm) {
      return res.json({ error: "invalid-sessions" }, 400);
    }
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.json({ error: "invalid-note" }, 400);
  }

  const tablesDB = new TablesDB(client);
  const accepted = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "coach_relationships",
    queries: [
      Query.equal("coachId", coachId),
      Query.equal("studentId", studentId),
      Query.equal("status", "accepted"),
      Query.limit(1),
    ],
  });
  if (accepted.rows.length === 0) {
    return res.json({ error: "not-coach" }, 403);
  }

  const rowId = `${studentId}_${weekStartDate}`;
  const data = {
    coachId,
    studentId,
    weekStartDate,
    totalKm,
    sessions: JSON.stringify(sessions),
    note: note ?? null,
  };

  try {
    await tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: "plan_overrides",
      rowId,
      data,
      permissions: [
        `read("user:${coachId}")`,
        `read("user:${studentId}")`,
        `update("user:${coachId}")`,
        `delete("user:${coachId}")`,
      ],
    });
  } catch (err) {
    error(`Falha ao salvar override de ${studentId} (${weekStartDate}) por ${coachId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  return res.json({ ok: true });
}

/** action: "suggest-plan-override" — read-only AI suggestion for one week, RAG-grounded and capped to the same progression safety limit. Originally appwrite-functions/suggest-plan-override. */
async function suggestPlanOverride({ userId: coachId, body, client, res, error }) {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ error: "ai-not-configured" }, 500);
  }

  const { studentId, weekStartDate } = body;
  const coachNote = typeof body.coachNote === "string" ? body.coachNote.trim().slice(0, 300) : "";

  if (typeof studentId !== "string" || !studentId) {
    return res.json({ error: "missing-student-id" }, 400);
  }
  if (typeof weekStartDate !== "string" || !WEEK_START_DATE_RE.test(weekStartDate)) {
    return res.json({ error: "invalid-week-start-date" }, 400);
  }

  const tablesDB = new TablesDB(client);
  const accepted = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "coach_relationships",
    queries: [
      Query.equal("coachId", coachId),
      Query.equal("studentId", studentId),
      Query.equal("status", "accepted"),
      Query.limit(1),
    ],
  });
  if (accepted.rows.length === 0) {
    return res.json({ error: "not-coach" }, 403);
  }

  const targetWeekMs = new Date(`${weekStartDate}T00:00:00Z`).getTime();
  const lookbackStartMs = targetWeekMs - 35 * MS_PER_DAY;
  const runsResult = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "runs",
    queries: [
      Query.equal("userId", studentId),
      Query.greaterThanEqual("startedAt", new Date(lookbackStartMs).toISOString()),
      Query.lessThan("startedAt", new Date(targetWeekMs).toISOString()),
      Query.limit(100),
    ],
  });

  const kmByWeek = new Map();
  for (const run of runsResult.rows) {
    const weekKey = mondayIsoDate(new Date(run.startedAt).getTime());
    kmByWeek.set(weekKey, (kmByWeek.get(weekKey) ?? 0) + run.distanceMeters / 1000);
  }
  const recentWeeksKm = [...kmByWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-4)
    .map(([, meters]) => Math.round(meters * 10) / 10);

  if (recentWeeksKm.length === 0) {
    return res.json({ error: "no-history" }, 422);
  }

  const lastWeek = recentWeeksKm[recentWeeksKm.length - 1];
  const twoWeeksAgo = recentWeeksKm.length >= 2 ? recentWeeksKm[recentWeeksKm.length - 2] : lastWeek;
  const capKm = Math.round(Math.min(lastWeek * WEEKLY_STEP, twoWeeksAgo * TWO_WEEK_CEILING) * 10) / 10;

  const evidenceBlock = EVIDENCE_EXCERPT.map((f) => `- [${f.strength}] ${f.claim}`).join("\n");
  const trendBlock = recentWeeksKm
    .map((km, i) => `Semana -${recentWeeksKm.length - i}: ${km} km reais`)
    .join("\n");
  const prompt = `Evidência científica disponível (use como base, não invente números além destes):
${evidenceBlock}

Histórico real de volume semanal do aluno (mais recente por último):
${trendBlock}

Semana a planejar: começa em ${weekStartDate} (segunda-feira).
Limite de segurança pra essa semana: no máximo ${capKm} km no total — esse limite já reflete a evidência acima (progressão gradual + teto de 30%/2 semanas) e será aplicado de qualquer forma depois da sua resposta, então sugira dentro dele.
${coachNote ? `Contexto que o treinador passou sobre esse aluno/semana: "${coachNote}"` : "O treinador não passou nenhum contexto adicional."}

Monte UMA semana de treino (domingo a domingo, mas responda os 7 dias na ordem segunda a domingo) pra esse aluno:
- "kind": "rest" (descanso), "easy" (corrida leve), "quality" (treino forte — intervalado/limiar), ou "long" (longão).
- "km": distância do dia (0 se for descanso).
- "paceZone" só quando "kind" for "quality": "easy", "marathon", "threshold", "interval" ou "repetition".
- No máximo 1 dia "quality" e 1 dia "long" na semana — o resto fácil ou descanso (princípio 80/20 acima).
- "note": 1-2 frases curtas em português, em tom de treinador falando com o aluno, explicando o foco da semana.
- "reasoning": 2-3 frases curtas em português, dirigidas ao TREINADOR (não ao aluno) explicando por que essa semana ficou assim — cite os números reais da tendência acima (ex.: "subiu de 12 pra 15km nas últimas 2 semanas, then..."), não frases genéricas tipo "seguindo boas práticas". Se o treinador passou contexto, essa resposta PRECISA dizer explicitamente como esse contexto pesou na escolha (ex.: "por causa do joelho, reduzi o treino forte pra Z2 e tirei o longão") — nunca ignorar em silêncio um contexto que foi passado. Se não veio contexto nenhum, diga isso também ("sem contexto adicional, segui só a tendência de volume").

Responda só o JSON pedido.`;

  let geminiResponse;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.4 },
        }),
      },
    );
  } catch (err) {
    error(`suggest-plan-override: Gemini request failed: ${err.message}`);
    return res.json({ error: "ai-unavailable" }, 502);
  }

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text().catch(() => "");
    error(`suggest-plan-override: Gemini returned ${geminiResponse.status}: ${errorText.slice(0, 500)}`);
    return res.json({ error: "ai-unavailable" }, 502);
  }

  const geminiBody = await geminiResponse.json();
  const text = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text;

  let suggestion;
  try {
    suggestion = JSON.parse(text ?? "");
  } catch {
    return res.json({ error: "ai-invalid-response" }, 502);
  }

  const sessions = suggestion.sessions;
  if (!Array.isArray(sessions) || sessions.length !== 7) {
    return res.json({ error: "ai-invalid-response" }, 502);
  }
  const cleanSessions = [];
  for (const session of sessions) {
    const validKind = VALID_KINDS.includes(session?.kind);
    const validKm = typeof session?.km === "number" && Number.isFinite(session.km) && session.km >= 0;
    if (!validKind || !validKm) {
      return res.json({ error: "ai-invalid-response" }, 502);
    }
    const clean = { kind: session.kind, km: Math.round(session.km * 10) / 10 };
    if (session.kind === "quality" && VALID_ZONES.includes(session.paceZone)) {
      clean.paceZone = session.paceZone;
    }
    cleanSessions.push(clean);
  }

  const suggestedTotalKm = Math.round(cleanSessions.reduce((sum, s) => sum + s.km, 0) * 10) / 10;
  const finalTotalKm = capNextWeekKm(recentWeeksKm, suggestedTotalKm);
  const capped = finalTotalKm < suggestedTotalKm;
  const scale = suggestedTotalKm > 0 ? finalTotalKm / suggestedTotalKm : 1;
  const finalSessions = capped
    ? cleanSessions.map((s) => ({ ...s, km: Math.round(s.km * scale * 10) / 10 }))
    : cleanSessions;

  return res.json({
    ok: true,
    sessions: finalSessions,
    note: typeof suggestion.note === "string" ? suggestion.note.slice(0, 300) : "",
    reasoning: typeof suggestion.reasoning === "string" ? suggestion.reasoning.slice(0, 500) : "",
    totalKm: Math.round(finalSessions.reduce((sum, s) => sum + s.km, 0) * 10) / 10,
    capped,
    capKm,
    // The model's own total before the safety cap clipped it — kept apart
    // from the already-existing `capped`/`capKm` pair so the UI can show
    // *both* numbers ("a IA sugeriu 28km, o teto pra essa semana era 24km")
    // instead of only the post-cap result, which reads as the AI having
    // suggested the safe number all along.
    rawSuggestedTotalKm: suggestedTotalKm,
  });
}

/**
 * action: "suggest-plan-for-self" — the athlete's own self-service version
 * of `suggestPlanOverride` above: same RAG-grounded Gemini call, same
 * evidence excerpt, same safety cap, same response shape — but with no
 * coach in the loop at all. See the spec at
 * /root/.claude/plans/cronograma-ia-autoatendimento.md for the full
 * reasoning; the short version:
 *
 * - No `coach_relationships` check — the caller is asking about their own
 *   account, not a student's.
 * - No `runs` table read. The athlete's own recent volume already lives
 *   entirely on their own device (IndexedDB) — the client computes
 *   `recentWeeksKm` locally (see `src/lib/tracking/stats.ts`'s
 *   `weeklyBuckets`) and sends it in the request body, the same numbers
 *   `suggestPlanOverride` would otherwise have had to reconstruct from a
 *   table only a *shared* run ever reaches. This is why this feature never
 *   needed the cross-device sync work considered (and shelved) for the
 *   coach dashboard.
 * - Still requires a session (not in `PUBLIC_ACTIONS`) even though it reads
 *   no privileged table — calling Gemini costs real money per request, and
 *   gating it behind the same login amigos/treinador/ranking already
 *   require is a cheap abuse guard, not a break from "sem login pra
 *   gravar corrida" (this is an enhancement, not core tracking).
 * - The result is never written here — same "suggests, never saves"
 *   contract as the coach version. The client is responsible for showing
 *   the mandatory disclaimer and, only after explicit acceptance, storing
 *   the accepted week as a local override (`src/lib/selfPlanOverride.ts`)
 *   — there is no Appwrite table for this at all, by design.
 */
async function suggestPlanForSelf({ body, res, error }) {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ error: "ai-not-configured" }, 500);
  }

  const { weekStartDate, goalDistanceMeters, goalDate, weeklyRunDays, recentRace, painSignal } = body;
  const athleteNote = typeof body.athleteNote === "string" ? body.athleteNote.trim().slice(0, 300) : "";

  if (typeof weekStartDate !== "string" || !WEEK_START_DATE_RE.test(weekStartDate)) {
    return res.json({ error: "invalid-week-start-date" }, 400);
  }

  const recentWeeksKm = Array.isArray(body.recentWeeksKm) ? body.recentWeeksKm : [];
  const validWeeks = recentWeeksKm.every(
    (km) => typeof km === "number" && Number.isFinite(km) && km >= 0 && km <= MAX_KM_PER_WEEK,
  );
  if (recentWeeksKm.length === 0 || !validWeeks) {
    return res.json({ error: "no-history" }, 422);
  }

  if (typeof goalDistanceMeters !== "number" || !Number.isFinite(goalDistanceMeters) || goalDistanceMeters <= 0) {
    return res.json({ error: "missing-goal" }, 400);
  }
  if (typeof goalDate !== "string" || !WEEK_START_DATE_RE.test(goalDate)) {
    return res.json({ error: "missing-goal" }, 400);
  }

  const lastWeek = recentWeeksKm[recentWeeksKm.length - 1];
  const twoWeeksAgo = recentWeeksKm.length >= 2 ? recentWeeksKm[recentWeeksKm.length - 2] : lastWeek;
  const capKm = Math.round(Math.min(lastWeek * WEEKLY_STEP, twoWeeksAgo * TWO_WEEK_CEILING) * 10) / 10;

  const weeksUntilGoal = Math.max(
    0,
    Math.round((new Date(`${goalDate}T00:00:00Z`).getTime() - new Date(`${weekStartDate}T00:00:00Z`).getTime()) / (7 * MS_PER_DAY)),
  );

  const evidenceBlock = EVIDENCE_EXCERPT.map((f) => `- [${f.strength}] ${f.claim}`).join("\n");
  const trendBlock = recentWeeksKm
    .map((km, i) => `Semana -${recentWeeksKm.length - i}: ${km} km reais`)
    .join("\n");
  const goalKm = Math.round((goalDistanceMeters / 1000) * 10) / 10;
  const prompt = `Evidência científica disponível (use como base, não invente números além destes):
${evidenceBlock}

Histórico real de volume semanal do próprio atleta (mais recente por último):
${trendBlock}

Objetivo do atleta: uma prova de ${goalKm} km em ${goalDate}, faltando aproximadamente ${weeksUntilGoal} semana(s) a partir da semana a planejar.
${weeklyRunDays ? `Dias de corrida por semana disponíveis: ${weeklyRunDays}.` : ""}
${recentRace?.distanceMeters && recentRace?.timeSeconds ? `Prova/treino forte recente: ${Math.round((recentRace.distanceMeters / 1000) * 10) / 10} km em ${Math.round(recentRace.timeSeconds / 60)} min.` : ""}
${painSignal?.severity ? `Sinal de dor/desconforto ativo, sinalizado pelo próprio atleta: intensidade "${painSignal.severity}"${painSignal.region ? ` na região "${painSignal.region}"` : ""} — leve isso a sério, é o fator de risco mais forte pra nova lesão.` : "Nenhuma dor/desconforto ativo sinalizado."}
Semana a planejar: começa em ${weekStartDate} (segunda-feira).
Limite de segurança pra essa semana: no máximo ${capKm} km no total — esse limite já reflete a evidência acima (progressão gradual + teto de 30%/2 semanas) e será aplicado de qualquer forma depois da sua resposta, então sugira dentro dele.
${athleteNote ? `Contexto que o próprio atleta passou sobre si/essa semana: "${athleteNote}"` : "O atleta não passou nenhum contexto adicional."}

Monte UMA semana de treino (responda os 7 dias na ordem segunda a domingo) pra esse atleta:
- "kind": "rest" (descanso), "easy" (corrida leve), "quality" (treino forte — intervalado/limiar), ou "long" (longão).
- "km": distância do dia (0 se for descanso).
- "paceZone" só quando "kind" for "quality": "easy", "marathon", "threshold", "interval" ou "repetition".
- No máximo 1 dia "quality" e 1 dia "long" na semana — o resto fácil ou descanso (princípio 80/20 acima).
- "note": 1-2 frases curtas em português, em tom de treinador falando diretamente com o atleta, explicando o foco da semana.
- "reasoning": 2-3 frases curtas em português, explicando pro próprio atleta por que essa semana ficou assim — cite os números reais da tendência acima, não frases genéricas tipo "seguindo boas práticas". Se o atleta passou contexto ou há dor/desconforto ativo sinalizado, essa resposta PRECISA dizer explicitamente como isso pesou na escolha — nunca ignorar em silêncio um sinal que foi passado.

Responda só o JSON pedido.`;

  let geminiResponse;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.4 },
        }),
      },
    );
  } catch (err) {
    error(`suggest-plan-for-self: Gemini request failed: ${err.message}`);
    return res.json({ error: "ai-unavailable" }, 502);
  }

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text().catch(() => "");
    error(`suggest-plan-for-self: Gemini returned ${geminiResponse.status}: ${errorText.slice(0, 500)}`);
    return res.json({ error: "ai-unavailable" }, 502);
  }

  const geminiBody = await geminiResponse.json();
  const text = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text;

  let suggestion;
  try {
    suggestion = JSON.parse(text ?? "");
  } catch {
    return res.json({ error: "ai-invalid-response" }, 502);
  }

  const sessions = suggestion.sessions;
  if (!Array.isArray(sessions) || sessions.length !== 7) {
    return res.json({ error: "ai-invalid-response" }, 502);
  }
  const cleanSessions = [];
  for (const session of sessions) {
    const validKind = VALID_KINDS.includes(session?.kind);
    const validKm = typeof session?.km === "number" && Number.isFinite(session.km) && session.km >= 0;
    if (!validKind || !validKm) {
      return res.json({ error: "ai-invalid-response" }, 502);
    }
    const clean = { kind: session.kind, km: Math.round(session.km * 10) / 10 };
    if (session.kind === "quality" && VALID_ZONES.includes(session.paceZone)) {
      clean.paceZone = session.paceZone;
    }
    cleanSessions.push(clean);
  }

  const suggestedTotalKm = Math.round(cleanSessions.reduce((sum, s) => sum + s.km, 0) * 10) / 10;
  const finalTotalKm = capNextWeekKm(recentWeeksKm, suggestedTotalKm);
  const capped = finalTotalKm < suggestedTotalKm;
  const scale = suggestedTotalKm > 0 ? finalTotalKm / suggestedTotalKm : 1;
  const finalSessions = capped
    ? cleanSessions.map((s) => ({ ...s, km: Math.round(s.km * scale * 10) / 10 }))
    : cleanSessions;

  return res.json({
    ok: true,
    sessions: finalSessions,
    note: typeof suggestion.note === "string" ? suggestion.note.slice(0, 300) : "",
    reasoning: typeof suggestion.reasoning === "string" ? suggestion.reasoning.slice(0, 500) : "",
    totalKm: Math.round(finalSessions.reduce((sum, s) => sum + s.km, 0) * 10) / 10,
    capped,
    capKm,
    rawSuggestedTotalKm: suggestedTotalKm,
  });
}

/**
 * Sends one of the fixed milestone pushes (see `MILESTONE_MESSAGES` above)
 * to the caller's own account — never to anyone else, `users: [userId]`
 * always resolves to the authenticated caller from `x-appwrite-user-id`.
 * A no-op, not an error, if the account has no push target registered yet
 * (never opened the app on a device with push set up, or denied the OS
 * permission) — `createPush` fails in that case, and a client-side
 * "hey, tell someone you did this" nudge that silently didn't fire is a
 * missed nice-to-have, not a bug worth surfacing to the athlete.
 */
async function sendMilestoneNotification({ userId, body, client, res, error }) {
  const variants = MILESTONE_MESSAGES[body.milestone];
  if (!variants) {
    return res.json({ error: "unknown-milestone" }, 400);
  }
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const { title, body: message } = typeof variant === "function" ? variant(body.context) : variant;

  try {
    const messaging = new Messaging(client);
    await messaging.createPush({ messageId: ID.unique(), title, body: message, users: [userId] });
    return res.json({ ok: true });
  } catch (err) {
    error(`sendMilestoneNotification failed for ${body.milestone}: ${err.message}`);
    // Same reasoning as the "no target registered" case above — this is a
    // best-effort extra, not core functionality the caller should retry or
    // surface an error for.
    return res.json({ ok: false });
  }
}

// Same IDs as the ones created once via the one-off Messaging topic setup
// script (see README's push-notification section) — one topic per platform
// since a topic is provider-agnostic and CI decides which one to notify
// based on which platform's build just shipped.
const UPDATE_TOPIC_ID = { android: "android-updates", ios: "ios-updates" };

/**
 * action: "subscribe-update-topic" — ties this device's push target to the
 * "new version shipped" broadcast for its platform, called right after
 * `registerForPushNotifications()` creates the target (src/lib/
 * pushNotifications.ts). Doesn't verify the target actually belongs to
 * `userId` — the only thing subscribing gets you is the same fixed "nova
 * versão" ping every other subscriber on that platform gets, so there's no
 * meaningful privilege to steal by naming someone else's target here,
 * unlike `sendMilestoneNotification` above (which sends to `users:
 * [userId]`, the authenticated caller only).
 */
async function subscribeUpdateTopic({ body, client, res, error }) {
  const topicId = UPDATE_TOPIC_ID[body.platform];
  const targetId = String(body.targetId ?? "");
  if (!topicId || !targetId) {
    return res.json({ error: "invalid-platform-or-target" }, 400);
  }
  try {
    const messaging = new Messaging(client);
    await messaging.createSubscriber({ topicId, subscriberId: ID.unique(), targetId });
    return res.json({ ok: true });
  } catch (err) {
    error(`subscribeUpdateTopic failed for ${body.platform}/${targetId}: ${err.message}`);
    // Best-effort, same reasoning as sendMilestoneNotification above — a
    // missed subscription just means one device doesn't get a nice-to-have
    // nudge, not something worth failing registration over.
    return res.json({ ok: false });
  }
}

/**
 * Derives a stable, valid Appwrite user ID from Apple's `sub` claim (the
 * one identifier Apple guarantees is stable per app + Apple account,
 * across every future sign-in). `sub` itself isn't safe to use directly —
 * Appwrite user IDs are capped at 36 chars and Apple's format isn't
 * documented as staying within that — so this hashes it into a fixed
 * 32-char hex string instead, same "deterministic ID over lookup table"
 * convention as friendships.ts's `pairKeyOf`/group-run participant rows
 * elsewhere in this Function.
 *
 * Known, accepted limitation: an athlete who already has an Apple-created
 * account from the (broken) browser OAuth2 flow gets a *second*, separate
 * account here — this hash has no relation to whatever ID Appwrite's own
 * OAuth2 provider assigned that first one. Not worth reconciling for the
 * handful of TestFlight accounts that hit the old broken flow before this
 * shipped; a real merge would need matching by email, which Apple only
 * discloses on a device's very first-ever authorization.
 */
function appleUserId(sub) {
  return createHash("sha256").update(sub).digest("hex").slice(0, 32);
}

/**
 * action: "apple-native-signin" — the only action in `ACTIONS` allowed to
 * run with no caller session yet (see `clientActions`'s `PUBLIC_ACTIONS`
 * below), since by definition nobody is signed in before this runs. Verifies
 * the identity token iOS's native `ASAuthorizationAppleIDProvider` produced
 * (see src/lib/auth.ts's `nativeAppleSignIn`) against Apple's own public
 * keys, then mints a session token the client exchanges via the same
 * `account.createSession({userId, secret})` call every other login path
 * here already uses.
 *
 * `givenName`/`familyName` come from the client, not the verified token
 * (Apple only ever puts the name in the one-time authorization response,
 * never in the JWT) — same trust level as the name Appwrite's own Google/
 * Apple OAuth2 providers already hand over unverified, so this isn't a new
 * exposure.
 */
async function appleNativeSignIn({ body, client, res, error }) {
  const identityToken = String(body.identityToken ?? "");
  if (!identityToken) {
    return res.json({ error: "missing-identity-token" }, 400);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: APPLE_BUNDLE_ID,
    }));
  } catch (err) {
    error(`apple-native-signin: identity token inválido: ${err.message}`);
    return res.json({ error: "invalid-identity-token" }, 401);
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    return res.json({ error: "invalid-identity-token" }, 401);
  }

  const userId = appleUserId(payload.sub);
  const users = new Users(client);

  try {
    await users.get({ userId });
  } catch {
    const givenName = typeof body.givenName === "string" ? body.givenName.trim() : "";
    const familyName = typeof body.familyName === "string" ? body.familyName.trim() : "";
    const name = [givenName, familyName].filter(Boolean).join(" ") || undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    try {
      await users.create({ userId, email, name });
    } catch (err) {
      // 409 here means Appwrite already has a *different* user with this
      // same email — from signing up earlier via Google, the browser
      // OAuth2 redirect flow, or phone — since this provider's own
      // deterministic userId (derived from Apple's `sub`) came back as
      // genuinely new above. Worth telling apart from any other failure:
      // the fix for this one is "sign in with whatever you used the first
      // time", not "try again"/"something broke".
      if (err.code === 409) {
        return res.json({ error: "email-already-in-use" }, 409);
      }
      error(`apple-native-signin: falha ao criar usuário ${userId}: ${err.message}`);
      return res.json({ error: "user-create-failed" }, 500);
    }
  }

  let token;
  try {
    token = await users.createToken({ userId });
  } catch (err) {
    error(`apple-native-signin: falha ao criar token de sessão para ${userId}: ${err.message}`);
    return res.json({ error: "token-create-failed" }, 500);
  }

  return res.json({ ok: true, userId: token.userId, secret: token.secret });
}

/**
 * Same hashing scheme as `appleUserId` — a stable per-provider derivation of
 * Google's `sub` claim into an Appwrite-legal user id. A different function
 * (not a shared helper) so a Google account and an Apple account can never
 * collide even in the astronomically unlikely case their raw provider ids
 * happened to match — each hash's input space is provider-specific by
 * construction (Google `sub`s are pure digits; Apple's look nothing like
 * that), so this is about legibility, not closing a real risk.
 */
function googleUserId(sub) {
  return createHash("sha256").update(sub).digest("hex").slice(0, 32);
}

/**
 * action: "google-native-signin" — the Google counterpart to
 * "apple-native-signin" above (see that one's own comment for the full
 * "why native instead of the browser-redirect OAuth2 flow" reasoning;
 * short version: iOS's SFSafariViewController consent step doesn't
 * reliably hand control back to this app for either provider). Also
 * allowed to run with no caller session yet — see `PUBLIC_ACTIONS` below.
 *
 * Unlike Apple's identity token, Google's already carries verified
 * `email`/`name` claims directly — no separate unverified client-supplied
 * name to trust here.
 */
async function googleNativeSignIn({ body, client, res, error }) {
  if (!GOOGLE_IOS_CLIENT_ID) {
    error("google-native-signin: GOOGLE_IOS_CLIENT_ID não configurado nesta Function.");
    return res.json({ error: "google-ios-client-id-not-configured" }, 500);
  }

  const idToken = String(body.idToken ?? "");
  if (!idToken) {
    return res.json({ error: "missing-id-token" }, 400);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: GOOGLE_IOS_CLIENT_ID,
    }));
  } catch (err) {
    error(`google-native-signin: id token inválido: ${err.message}`);
    return res.json({ error: "invalid-id-token" }, 401);
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    return res.json({ error: "invalid-id-token" }, 401);
  }

  const userId = googleUserId(payload.sub);
  const users = new Users(client);

  try {
    await users.get({ userId });
  } catch {
    const name = typeof payload.name === "string" && payload.name ? payload.name : undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    try {
      await users.create({ userId, email, name });
    } catch (err) {
      // Same "email already tied to a different account" case documented
      // in apple-native-signin above — same fix (sign in the original way),
      // not the same failure at all as the generic 500 below.
      if (err.code === 409) {
        return res.json({ error: "email-already-in-use" }, 409);
      }
      error(`google-native-signin: falha ao criar usuário ${userId}: ${err.message}`);
      return res.json({ error: "user-create-failed" }, 500);
    }
  }

  let token;
  try {
    token = await users.createToken({ userId });
  } catch (err) {
    error(`google-native-signin: falha ao criar token de sessão para ${userId}: ${err.message}`);
    return res.json({ error: "token-create-failed" }, 500);
  }

  return res.json({ ok: true, userId: token.userId, secret: token.secret });
}

/**
 * Deterministic row id so a re-sync updates the same race instead of
 * duplicating it. Short prefixes ("cp"/"fpa"), not the `source` column's
 * own full enum value ("corrida_perfeita") — a first version prefixed with
 * the full enum string and `.slice(0, 36)`'d the result to respect
 * Appwrite's row id limit, which silently truncated the last few
 * characters off every Corrida Perfeita id (17-char prefix + 24-char
 * Mongo ObjectId = 41 chars) and caused real collisions between different
 * races (confirmed by testing this against the live APIs before shipping
 * — 5 duplicate ids out of ~400 real rows). "cp_" + a 24-char ObjectId is
 * 27 chars, comfortably under the limit with nothing to truncate.
 */
function raceRowId(source, sourceId) {
  const prefix = source === "corrida_perfeita" ? "cp" : source;
  return `${prefix}_${sourceId}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Corrida Perfeita's own calendar API — confirmed live and unauthenticated
 * (empty `Authorization` header, exactly what their own frontend sends when
 * nobody's logged in): `start_date` already filters to "still upcoming",
 * and `limit=500` comfortably covers the whole future set in one request
 * (281 races nationwide when this was last checked) — no pagination loop
 * needed. See PROJECT-CONTEXT.md for how this endpoint was found.
 */
async function fetchCorridaPerfeitaRaces(todayIso, log, error) {
  let response;
  try {
    response = await fetch(
      `${CORRIDA_PERFEITA_ENDPOINT}?start_date=${todayIso}&skip=0&limit=500`,
      { headers: { Authorization: "" } },
    );
  } catch (err) {
    error(`sync-city-races: Corrida Perfeita request failed: ${err.message}`);
    return [];
  }
  if (!response.ok) {
    error(`sync-city-races: Corrida Perfeita returned ${response.status}`);
    return [];
  }
  const body = await response.json();
  const races = (body.data ?? []).map((race) => ({
    $id: raceRowId("corrida_perfeita", race._id),
    name: String(race.name ?? "").slice(0, 200),
    date: race.date,
    endDate: null,
    city: (race.city ?? "").slice(0, 100),
    state: (race.state ?? "").slice(0, 2),
    distancesKm: Array.isArray(race.distance) ? race.distance.filter((km) => typeof km === "number" && km > 0) : [],
    registrationUrl: race.url ? String(race.url).slice(0, 500) : null,
    source: "corrida_perfeita",
  }));
  log?.(`sync-city-races: Corrida Perfeita — ${races.length} corridas (total reportado: ${body.total}).`);
  return races;
}

/**
 * FPA's real backend (api.atletismopaulista.com.br), not the atletismopaulista.com.br
 * site itself — that site is a client-rendered Next.js shell with no data
 * in its HTML; this endpoint is what its own JS calls. Paginated by
 * calendar month (`date=MM-YYYY`), one request per month covered by
 * FPA_MONTHS_AHEAD, run in parallel — a month with no races just comes
 * back an empty array, never an error.
 */
async function fetchFpaRaces(todayIso, log, error) {
  const now = new Date(`${todayIso}T00:00:00Z`);
  const months = [];
  for (let i = 0; i < FPA_MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    months.push(`${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`);
  }

  const monthResults = await Promise.all(
    months.map(async (monthParam) => {
      try {
        const response = await fetch(
          `${FPA_EVENTS_ENDPOINT}?type=street_race&date=${monthParam}`,
        );
        if (!response.ok) {
          error(`sync-city-races: FPA (${monthParam}) returned ${response.status}`);
          return [];
        }
        return await response.json();
      } catch (err) {
        error(`sync-city-races: FPA (${monthParam}) request failed: ${err.message}`);
        return [];
      }
    }),
  );

  // The same race can appear in more than one month's response near a
  // month boundary — dedupe by FPA's own `id` before mapping.
  const byId = new Map();
  for (const event of monthResults.flat()) {
    if (event && typeof event.id !== "undefined") byId.set(event.id, event);
  }

  const races = [...byId.values()]
    .filter((event) => typeof event.date_start === "string" && event.date_start >= todayIso)
    .map((event) => ({
      $id: raceRowId("fpa", event.id),
      name: String(event.name ?? "").slice(0, 200),
      date: `${event.date_start}T00:00:00.000Z`,
      endDate: event.date_end && event.date_end !== event.date_start ? `${event.date_end}T00:00:00.000Z` : null,
      city: (event.event_city ?? "").slice(0, 100),
      state: "SP",
      // FPA's `distance` is a single number and frequently 0, which means
      // "not informed" here, not a real 0km race — see this column's own
      // comment in appwrite-setup.ts.
      distancesKm: typeof event.distance === "number" && event.distance > 0 ? [event.distance] : [],
      registrationUrl: event.info_link ? String(event.info_link).slice(0, 500) : null,
      source: "fpa",
    }));
  log?.(`sync-city-races: FPA — ${races.length} corridas em ${FPA_MONTHS_AHEAD} meses.`);
  return races;
}

/**
 * Runs on this Function's weekly schedule trigger (see clientActions below)
 * — refreshes the public `city_races` calendar from both sources. Best
 * effort per source (Promise.allSettled): a Corrida Perfeita outage
 * shouldn't erase the FPA rows already there, and vice versa. Doesn't
 * delete anything for a source that came back empty — an empty result is
 * far more likely a transient fetch failure than "zero races exist",
 * and silently wiping the whole calendar on a bad day is worse than
 * leaving it stale until the next weekly run recovers.
 *
 * Past races ARE pruned unconditionally, regardless of source health —
 * that's just "date < today", never ambiguous the way an empty upstream
 * response is.
 */
async function syncCityRaces({ client, log, error }) {
  const tablesDB = new TablesDB(client);
  const todayIso = new Date().toISOString().slice(0, 10);

  const [cpResult, fpaResult] = await Promise.allSettled([
    fetchCorridaPerfeitaRaces(todayIso, log, error),
    fetchFpaRaces(todayIso, log, error),
  ]);
  const races = [
    ...(cpResult.status === "fulfilled" ? cpResult.value : []),
    ...(fpaResult.status === "fulfilled" ? fpaResult.value : []),
  ];
  if (cpResult.status === "rejected") error(`sync-city-races: Corrida Perfeita failed: ${cpResult.reason}`);
  if (fpaResult.status === "rejected") error(`sync-city-races: FPA failed: ${fpaResult.reason}`);

  for (const batch of chunk(races, 50)) {
    try {
      await tablesDB.upsertRows({ databaseId: DATABASE_ID, tableId: CITY_RACES_TABLE_ID, rows: batch });
    } catch (err) {
      error(`sync-city-races: upsertRows batch failed: ${err.message}`);
    }
  }

  try {
    await tablesDB.deleteRows({
      databaseId: DATABASE_ID,
      tableId: CITY_RACES_TABLE_ID,
      queries: [Query.lessThan("date", new Date().toISOString())],
    });
  } catch (err) {
    error(`sync-city-races: pruning past races failed: ${err.message}`);
  }

  log?.(`sync-city-races: done — ${races.length} corridas sincronizadas.`);
  return { ok: true, count: races.length };
}

/** Push copy for a lapsed runner, bucketed by how long it's been since their last synced run — see checkRetentionPushes below. Deliberately never guilt-trips ("you're falling behind") — same brand voice already established for MILESTONE_MESSAGES above: honest, warm, never fake positivity, never a nag. Multiple variants each, same reasoning as MILESTONE_MESSAGES's own comment on why (reads as noticing, not a bot). */
const RETENTION_MESSAGES = {
  "poucos-dias": [
    { title: "Sentimos sua falta", body: "Já faz uns dias desde sua última corrida. Bora dar uma volta hoje?" },
    { title: "Suas pernas estão descansando bem", body: "Alguns dias parado — topa uma corrida leve?" },
  ],
  "uma-semana": [
    { title: "Faz uma semana", body: "Sua última corrida foi há uma semana. Sem pressão — o Xanthus tá aqui quando você quiser voltar." },
    { title: "Uma semana sem correr", body: "Não é sobre manter o ritmo o tempo todo. É sobre voltar quando der." },
  ],
  "duas-semanas": [
    { title: "Faz um tempo", body: "Já faz duas semanas desde sua última corrida registrada. Uma corrida curta hoje já ajuda a retomar." },
    { title: "Duas semanas parado", body: "Se ainda estiver naquilo, a gente tá aqui quando quiser voltar." },
  ],
};

/** Which RETENTION_MESSAGES bucket a gap falls in, or null outside the window this job pushes for at all — under 3 days is just a normal rest day, 30+ is treated as probably churned (see checkRetentionPushes's own comment on why that's a hard stop, not a bigger nudge). */
function retentionBucket(daysSinceLastRun) {
  if (daysSinceLastRun >= 3 && daysSinceLastRun < 7) return "poucos-dias";
  if (daysSinceLastRun >= 7 && daysSinceLastRun < 14) return "uma-semana";
  if (daysSinceLastRun >= 14 && daysSinceLastRun < 30) return "duas-semanas";
  return null;
}

/**
 * Runs on the same weekly schedule trigger as syncCityRaces above (see
 * clientActions' own `x-appwrite-trigger === "schedule"` branch) — checks
 * every account that has ever opted into cross-device sync
 * (runner_profile_sync only has a row for those, see runnerProfileSync.ts)
 * for how long it's been since their most recent synced run, and sends a
 * best-effort "come back" push if they've gone quiet for 3-29 days. 30+
 * days is treated as probably churned — nagging someone who's been gone a
 * month straight is the guilt-trip this app's own brand voice explicitly
 * rejects (see RETENTION_MESSAGES), not a re-engagement nudge, so this
 * stops rather than escalating.
 *
 * Only reaches accounts that opted into sync in the first place — this
 * app's local-first design means a run's data never leaves the device
 * unless the athlete turned that on, so a retention push here is
 * structurally impossible for anyone who hasn't. Re-checks
 * profiles.runSyncOptIn (not just "a runner_profile_sync row exists") so
 * someone who later turned sync back off stops being reachable this way,
 * even though their old row is still sitting there. Capped at one page
 * (100 accounts) — same ceiling every other list in this Function uses,
 * more than this project's real account count today; revisit if that
 * ever changes.
 */
async function checkRetentionPushes({ client, log, error }) {
  const tablesDB = new TablesDB(client);
  const nowMs = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  // A cron that somehow fires more than once inside this window shouldn't
  // re-push the same lapsed runner twice in a row.
  const COOLDOWN_MS = 6 * DAY_MS;

  let rows;
  try {
    rows = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: "runner_profile_sync",
      queries: [Query.limit(100)],
    });
  } catch (err) {
    error(`check-retention-pushes: falha listando runner_profile_sync: ${err.message}`);
    return { ok: false };
  }

  const messaging = new Messaging(client);
  let sent = 0;
  for (const row of rows.rows) {
    const userId = row.userId;
    if (row.lastRetentionPushAt && nowMs - row.lastRetentionPushAt < COOLDOWN_MS) continue;

    try {
      const profile = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "profiles", rowId: userId });
      if (!profile.runSyncOptIn) continue;
    } catch {
      continue; // no profile row (deleted account) — nothing to push
    }

    let lastRun;
    try {
      const recent = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "run_summaries",
        queries: [Query.equal("userId", userId), Query.orderDesc("startedAtMs"), Query.limit(1)],
      });
      lastRun = recent.rows[0];
    } catch (err) {
      error(`check-retention-pushes: falha lendo run_summaries de ${userId}: ${err.message}`);
      continue;
    }
    if (!lastRun) continue; // never synced a run at all — not a lapse, just no data yet

    const bucket = retentionBucket((nowMs - lastRun.startedAtMs) / DAY_MS);
    if (!bucket) continue;

    const variants = RETENTION_MESSAGES[bucket];
    const variant = variants[Math.floor(Math.random() * variants.length)];

    try {
      await messaging.createPush({ messageId: ID.unique(), title: variant.title, body: variant.body, users: [userId] });
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: "runner_profile_sync",
        rowId: row.$id,
        data: { lastRetentionPushAt: nowMs },
      });
      sent++;
    } catch (err) {
      error(`check-retention-pushes: push best-effort falhou pra ${userId}: ${err.message}`);
    }
  }

  log?.(`check-retention-pushes: done — ${sent} push(es) enviado(s).`);
  return { ok: true, sent };
}

const ACTIONS = {
  "delete-account": deleteAccount,
  "send-welcome-email": sendWelcomeEmail,
  "join-group-run": joinGroupRun,
  "start-live-session": startLiveSession,
  "refresh-live-audience": refreshLiveAudience,
  "refresh-presence": refreshPresence,
  "send-coach-cue": sendCoachCue,
  "share-run": shareRun,
  "share-custom-route": shareCustomRoute,
  "list-friends-feed": listFriendsFeed,
  "toggle-run-kudos": toggleRunKudos,
  "add-run-comment": addRunComment,
  "list-run-comments": listRunCommentsAction,
  "pair-run-session": pairRunSession,
  "start-group-run": startGroupRun,
  "claim-owned-row": claimOwnedRow,
  "sync-run-summary": syncRunSummary,
  "backfill-run-summaries": backfillRunSummaries,
  "sync-recovery-snapshot": syncRecoverySnapshot,
  "send-friend-request": sendFriendRequest,
  "propose-coach-relationship": proposeCoachRelationship,
  "notify-coach-request-accepted": notifyCoachRequestAccepted,
  "set-plan-override": setPlanOverride,
  "suggest-plan-override": suggestPlanOverride,
  "suggest-plan-for-self": suggestPlanForSelf,
  "send-milestone-notification": sendMilestoneNotification,
  "subscribe-update-topic": subscribeUpdateTopic,
  "apple-native-signin": appleNativeSignIn,
  "google-native-signin": googleNativeSignIn,
};

// The only two actions allowed to run with no `x-appwrite-user-id` at all —
// see apple-native-signin's own comment for why. Every other action keeps
// requiring a real session, checked once below rather than once per
// handler.
const PUBLIC_ACTIONS = new Set(["apple-native-signin", "google-native-signin"]);

/**
 * One Appwrite Function backing every privileged, client-invoked write this
 * app needs — see src/lib/appwrite.ts's `CLIENT_ACTIONS_FUNCTION_ID` for why
 * this exists as a single dispatcher instead of six separate Functions
 * (Appwrite Cloud Free plan's 2-Functions-per-project cap). Dispatches on
 * `body.action`; each handler below is otherwise unchanged from the
 * standalone Function it replaces (see git history for
 * appwrite-functions/{delete-account,send-welcome-email,join-group-run,
 * claim-owned-row,set-plan-override,suggest-plan-override} before this
 * consolidation).
 *
 * Every action except `apple-native-signin` needs the caller's own session
 * (`x-appwrite-user-id`) — that one is the sole exception (see its own
 * comment: by definition nobody's signed in yet when it runs), checked
 * against `PUBLIC_ACTIONS` once here rather than once per handler. This
 * means the Function's own execute permission has to allow anonymous
 * calls too (`any`, not `users`) — every OTHER action stays just as
 * locked down as before, since this check still runs for all of them.
 * The scoped per-execution key (`x-appwrite-key`) needs the UNION of every
 * action's API key scopes (users.read, users.write — the last one new,
 * for apple-native-signin's `Users.create`/`Users.createToken` — databases
 * .read, databases.write, messages.write) configured on this one Function
 * in the Console, since Appwrite grants scopes per Function, not per
 * action — see README.md for the exact setup.
 */
async function clientActions({ req, res, log, error }) {
  // A scheduled invocation (see this Function's `schedule` cron in the
  // Console/README) carries no body at all — no user, no `action` — it's
  // the trigger itself, not a client request, so it's handled before the
  // JSON-body/user-session checks below even try to apply to it.
  if (req.headers["x-appwrite-trigger"] === "schedule") {
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers["x-appwrite-key"] ?? "");
    // Two unrelated jobs riding the same weekly cron (see checkRetentionPushes'
    // own comment on why) — one failing shouldn't skip the other.
    const [racesResult, retentionResult] = await Promise.allSettled([
      syncCityRaces({ client, log, error }),
      checkRetentionPushes({ client, log, error }),
    ]);
    return res.json({
      races: racesResult.status === "fulfilled" ? racesResult.value : { ok: false },
      retention: retentionResult.status === "fulfilled" ? retentionResult.value : { ok: false },
    });
  }

  let body;
  try {
    body = JSON.parse(req.bodyText || "{}");
  } catch {
    return res.json({ error: "invalid-body" }, 400);
  }

  const handler = ACTIONS[body.action];
  if (!handler) {
    return res.json({ error: "unknown-action" }, 400);
  }

  const userId = req.headers["x-appwrite-user-id"];
  if (!userId && !PUBLIC_ACTIONS.has(body.action)) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");

  return handler({ userId, body, client, res, log, error });
}

export default clientActions;
