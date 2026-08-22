import { Client, Query, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

const WEEK_START_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_KINDS = ["rest", "easy", "quality", "long"];
const VALID_ZONES = ["easy", "marathon", "threshold", "interval", "repetition"];

// Low-cost model, chosen so a coach can request a suggestion per student per
// week without meaningful cost — see PROJECT-CONTEXT.md's "Fase B" note.
const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Mirrors src/lib/plan/volumeProgression.ts's WEEKLY_STEP/TWO_WEEK_CEILING —
 * this Function can't import that module directly (Appwrite Functions here
 * are self-contained, no shared build step, same as every other function in
 * appwrite-functions/), so the two numbers are duplicated by hand. If those
 * constants ever change, change them here too. See that file's own comment
 * for why these two particular numbers (10%/week convention, 30%/2-week
 * ceiling backed by Nielsen et al.) are the ones that matter.
 */
const WEEKLY_STEP = 1.1;
const TWO_WEEK_CEILING = 1.3;

/**
 * Brazil has had no DST since 2019, so a fixed UTC-3 offset is safe here —
 * this only needs to get the *day* right for weekly bucketing, not the
 * literal minute. Xanthus is Brazil-only (see PROJECT-CONTEXT.md), so this
 * doesn't need to be timezone-aware per athlete.
 */
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Monday (America/Sao_Paulo) on or before `ms`, as an ISO date — same definition `mondayOf`/`currentMondayIsoDate` use client-side, reimplemented here since this Function can't import from src/lib. */
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

/**
 * Curated excerpt of src/lib/evidence/facts.ts — only the facts that
 * actually bear on a single week's volume/session-type decision (progression
 * caps, periodization shape, taper, overtraining, injury risk). The full
 * warmup/stretch/hydration/nutrition corpus doesn't apply to what this
 * Function decides, so it's left out to keep the prompt focused and cheap.
 * Manually synced, not generated — same "no build step" philosophy
 * facts.ts's own header documents. If a fact under one of these five topics
 * changes there, update it here too.
 */
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

function buildPrompt({ recentWeeksKm, capKm, coachNote, weekStartDate }) {
  const evidenceBlock = EVIDENCE_EXCERPT.map((f) => `- [${f.strength}] ${f.claim}`).join("\n");
  const trendBlock =
    recentWeeksKm.length > 0
      ? recentWeeksKm.map((km, i) => `Semana -${recentWeeksKm.length - i}: ${km} km reais`).join("\n")
      : "Sem histórico de corridas compartilhadas ainda.";

  return `Evidência científica disponível (use como base, não invente números além destes):
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
}

/** The exact same clamp `buildVolumeRamp` applies to a full plan, applied here to one ad hoc week: never let the suggested total exceed the greater-evidence-backed ceiling relative to what the athlete actually just ran. Defense in depth — the prompt already asks the model to respect this, this enforces it regardless of what the model returns. */
function capNextWeekKm(recentWeeksKm, suggestedKm) {
  if (recentWeeksKm.length === 0) return suggestedKm;
  const lastWeek = recentWeeksKm[recentWeeksKm.length - 1];
  const twoWeeksAgo = recentWeeksKm.length >= 2 ? recentWeeksKm[recentWeeksKm.length - 2] : lastWeek;
  const cap = Math.min(lastWeek * WEEKLY_STEP, twoWeeksAgo * TWO_WEEK_CEILING);
  return Math.min(suggestedKm, Math.round(cap * 10) / 10);
}

async function suggestPlanOverride({ req, res, error }) {
  const coachId = req.headers["x-appwrite-user-id"];
  if (!coachId) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ error: "ai-not-configured" }, 500);
  }

  let body;
  try {
    body = JSON.parse(req.bodyText || "{}");
  } catch {
    return res.json({ error: "invalid-body" }, 400);
  }
  const { studentId, weekStartDate } = body;
  const coachNote = typeof body.coachNote === "string" ? body.coachNote.trim().slice(0, 300) : "";

  if (typeof studentId !== "string" || !studentId) {
    return res.json({ error: "missing-student-id" }, 400);
  }
  if (typeof weekStartDate !== "string" || !WEEK_START_DATE_RE.test(weekStartDate)) {
    return res.json({ error: "invalid-week-start-date" }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
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

  // Real weekly volume from the student's own shared runs, oldest to
  // newest, for the up-to-4 completed weeks right before the target week —
  // this is what the safety cap below is actually anchored to, never the
  // AI's own claim about what the athlete has been doing.
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

  const prompt = buildPrompt({ recentWeeksKm, capKm, coachNote, weekStartDate });

  let geminiResponse;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.4,
          },
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

export default suggestPlanOverride;
