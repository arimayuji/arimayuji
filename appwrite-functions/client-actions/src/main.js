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

const GEMINI_MODEL = "gemini-2.5-flash";
const WEEK_START_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_KINDS = ["rest", "easy", "quality", "long"];
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

  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      rowId: `${sessionCode}_${userId}`,
      data: { sessionCode, userId, joinedAt: new Date().toISOString() },
      permissions: [Permission.delete(Role.user(userId))],
    });
  } catch (err) {
    if (err.code !== 409) {
      error(`Falha ao entrar em ${sessionCode} para ${userId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
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

  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      rowId: `${sessionCode}_${userId}`,
      data: { sessionCode, userId, joinedAt: new Date().toISOString() },
      permissions: [Permission.delete(Role.user(userId))],
    });
  } catch (err) {
    if (err.code !== 409) {
      error(`pair-run-session: falha ao entrar em ${sessionCode} para ${userId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
    }
  }

  return res.json({ ok: true, groupRun });
}

/** action: "claim-owned-row" — the only path allowed to create the first profiles/profile_stats/place_run_stats row for an account. Originally appwrite-functions/claim-owned-row. */
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

const ACTIONS = {
  "delete-account": deleteAccount,
  "send-welcome-email": sendWelcomeEmail,
  "join-group-run": joinGroupRun,
  "pair-run-session": pairRunSession,
  "claim-owned-row": claimOwnedRow,
  "set-plan-override": setPlanOverride,
  "suggest-plan-override": suggestPlanOverride,
  "send-milestone-notification": sendMilestoneNotification,
  "subscribe-update-topic": subscribeUpdateTopic,
  "apple-native-signin": appleNativeSignIn,
};

// The one action allowed to run with no `x-appwrite-user-id` at all — see
// apple-native-signin's own comment for why. Every other action keeps
// requiring a real session, checked once below rather than once per
// handler.
const PUBLIC_ACTIONS = new Set(["apple-native-signin"]);

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
