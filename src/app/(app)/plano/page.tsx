import { Card, CardTitle, delay, ExampleBadge, Screen, ScreenHeader, Stat } from "../ui";

/**
 * Preview of the training-plan screen.
 *
 * The plan engine (retrieval over training literature + the athlete's own
 * history) has not been built — that is a deliberate ordering decision, not an
 * oversight. So every number on this screen is invented, and the screen says
 * so three times: the badge in the header, the explainer card above the week,
 * and the caption under it. Nothing here reads the athlete's data, because
 * there is nothing yet that could.
 */

type SessionKind = "rest" | "easy" | "hard" | "long";

interface PlannedSession {
  day: string;
  title: string;
  detail: string;
  /** Distance in km, when the session has one. */
  km?: number;
  kind: SessionKind;
}

const KIND_STYLE: Record<SessionKind, { rail: string; chip: string; label: string }> = {
  rest: {
    rail: "bg-border",
    chip: "border-border text-muted",
    label: "descanso",
  },
  easy: {
    rail: "bg-good",
    chip: "border-good/40 text-good",
    label: "leve",
  },
  hard: {
    rail: "bg-warn",
    chip: "border-warn/40 text-warn",
    label: "forte",
  },
  long: {
    rail: "bg-accent",
    chip: "border-accent/40 text-accent",
    label: "longo",
  },
};

const DEMO_WEEK: PlannedSession[] = [
  {
    day: "Segunda",
    title: "Descanso",
    detail: "Sem corrida. É no descanso que a adaptação acontece.",
    kind: "rest",
  },
  {
    day: "Terça",
    title: "Corrida leve",
    detail: "Ritmo de conversa, sem olhar o relógio.",
    km: 5,
    kind: "easy",
  },
  {
    day: "Quarta",
    title: "Força + mobilidade",
    detail: "20 min de agachamento, prancha e panturrilha.",
    kind: "rest",
  },
  {
    day: "Quinta",
    title: "Intervalado 6 × 400 m",
    detail: "Forte nos 400 m, 90 s de trote entre as repetições.",
    km: 6,
    kind: "hard",
  },
  { day: "Sexta", title: "Descanso", detail: "Perna leve pro fim de semana.", kind: "rest" },
  {
    day: "Sábado",
    title: "Rodagem",
    detail: "Confortável, terreno plano.",
    km: 6,
    kind: "easy",
  },
  {
    day: "Domingo",
    title: "Longão",
    detail: "Pace uns 40 s/km mais lento que o de prova.",
    km: 12,
    kind: "long",
  },
];

const TOTAL_KM = DEMO_WEEK.reduce((sum, session) => sum + (session.km ?? 0), 0);
const SESSION_COUNT = DEMO_WEEK.filter((session) => session.km !== undefined).length;

function SessionRow({
  session,
  index,
  isLast,
}: {
  session: PlannedSession;
  index: number;
  isLast: boolean;
}) {
  const style = KIND_STYLE[session.kind];

  return (
    <li className="pr-enter flex gap-3" style={delay(160 + index * 40)}>
      <span className={`mt-1 w-1 shrink-0 rounded-full ${style.rail}`} aria-hidden="true" />
      <div
        className={`min-w-0 flex-1 ${isLast ? "" : "border-b border-border pb-3"}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">{session.day}</span>
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${style.chip}`}
          >
            {style.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">{session.title}</h3>
          {session.km !== undefined && (
            <span className="shrink-0 font-mono text-sm tabular-nums">
              {session.km}
              <span className="ml-0.5 text-xs text-muted">km</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted text-pretty">{session.detail}</p>
      </div>
    </li>
  );
}

export default function PlanoPage() {
  return (
    <>
      <ScreenHeader
        title="Plano"
        badge={<ExampleBadge />}
        subtitle="Prévia de como o plano semanal vai ser apresentado. Ainda não é o seu plano."
      />

      <Screen>
        <Card className="pr-enter border-warn/30 bg-warn/5" style={delay(60)}>
          <CardTitle>O que ainda não existe aqui</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            O motor que monta o treino — cruzando o seu histórico com literatura de
            periodização — ainda não foi construído. A semana abaixo é{" "}
            <strong className="font-semibold text-foreground">inventada</strong>, igual pra
            todo mundo, e não leva em conta nenhuma corrida sua. Ela está aqui pra decidir o
            formato da tela antes de investir no motor.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(110)}>
          <CardTitle aside={<ExampleBadge>semana de exemplo</ExampleBadge>}>
            Semana 3 de 12 — base
          </CardTitle>

          <div className="mb-5 grid grid-cols-3 gap-3 border-b border-border pb-4">
            <Stat label="Volume" value={String(TOTAL_KM)} unit="km" />
            <Stat label="Sessões" value={String(SESSION_COUNT)} />
            <Stat label="Forte" value="1" />
          </div>

          <ul className="flex flex-col gap-3">
            {DEMO_WEEK.map((session, index) => (
              <SessionRow
                key={session.day}
                session={session}
                index={index}
                isLast={index === DEMO_WEEK.length - 1}
              />
            ))}
          </ul>

          <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted">
            Números de demonstração. Quando o motor existir, o volume e a intensidade saem do
            seu histórico real e da prova que você marcar no perfil.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(420)}>
          <CardTitle>Próximo passo</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            Grave algumas corridas primeiro: o plano personalizado depende de ter histórico de
            verdade pra calibrar volume e pace.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 w-full cursor-not-allowed rounded-full border border-border bg-surface px-6 py-4 text-base font-semibold text-muted"
          >
            Gerar plano personalizado — em breve
          </button>
        </Card>
      </Screen>
    </>
  );
}
