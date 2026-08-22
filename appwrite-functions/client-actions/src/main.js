import { Client, Permission, Query, Role, Storage, TablesDB, Users } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";
// Same fixed ID as src/lib/appwrite.ts's AVATARS_BUCKET_ID.
const AVATARS_BUCKET_ID = "avatars";

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
  },
  required: ["sessions", "note"],
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
    totalKm: Math.round(finalSessions.reduce((sum, s) => sum + s.km, 0) * 10) / 10,
    capped,
    capKm,
  });
}

const ACTIONS = {
  "delete-account": deleteAccount,
  "send-welcome-email": sendWelcomeEmail,
  "join-group-run": joinGroupRun,
  "claim-owned-row": claimOwnedRow,
  "set-plan-override": setPlanOverride,
  "suggest-plan-override": suggestPlanOverride,
};

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
 * Every action needs the caller's own session (`x-appwrite-user-id`) — none
 * of the six is meant to be called anonymously — so that check happens once
 * here rather than once per handler. The scoped per-execution key
 * (`x-appwrite-key`) needs the UNION of every action's API key scopes
 * (users.read, databases.read, databases.write) configured on this one
 * Function in the Console, since Appwrite grants scopes per Function, not
 * per action — see README.md for the exact setup.
 */
async function clientActions({ req, res, log, error }) {
  const userId = req.headers["x-appwrite-user-id"];
  if (!userId) {
    return res.json({ error: "not-authenticated" }, 401);
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

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");

  return handler({ userId, body, client, res, log, error });
}

export default clientActions;
