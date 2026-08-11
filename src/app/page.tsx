import type { CSSProperties } from "react";
import Link from "next/link";
import { Reveal } from "./reveal";

/** Sets the per-element animation delay consumed by the CSS in globals.css. */
const delay = (ms: number, extra?: CSSProperties) =>
  ({ "--pr-delay": `${ms}ms`, ...extra }) as CSSProperties;

function formatPace(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Section 01 — the illustrative progress chart                        */
/* ------------------------------------------------------------------ */

/**
 * Fabricated weekly average pace (seconds per km) for the demo chart.
 *
 * These are NOT real numbers from anyone's account — the history screen does
 * not exist yet. They exist to show the *shape* of the thing: a noisy but
 * clearly improving twelve-week block, the way a real training block looks.
 * The UI labels this as an example in two places for the same reason.
 */
const DEMO_WEEKLY_PACE = [402, 395, 398, 381, 374, 378, 362, 356, 358, 347, 339, 334];

const CHART = {
  width: 360,
  height: 190,
  padLeft: 46,
  padRight: 14,
  padTop: 18,
  padBottom: 30,
  /** Pace domain in seconds/km — slower at the bottom, faster at the top. */
  slowest: 412,
  fastest: 325,
};

const PLOT_WIDTH = CHART.width - CHART.padLeft - CHART.padRight;
const PLOT_HEIGHT = CHART.height - CHART.padTop - CHART.padBottom;
const BASELINE_Y = CHART.padTop + PLOT_HEIGHT;

function chartX(index: number): number {
  const step = PLOT_WIDTH / (DEMO_WEEKLY_PACE.length - 1);
  return Number((CHART.padLeft + index * step).toFixed(2));
}

/**
 * Pace axis is inverted on purpose: a *lower* pace is a better one, so faster
 * weeks are drawn higher and the line climbs as the runner improves. The axis
 * is labelled "+ rápido" at the top so the inversion is stated, not implied.
 */
function chartY(paceSeconds: number): number {
  const ratio = (paceSeconds - CHART.fastest) / (CHART.slowest - CHART.fastest);
  return Number((CHART.padTop + ratio * PLOT_HEIGHT).toFixed(2));
}

const CHART_POINTS = DEMO_WEEKLY_PACE.map((pace, index) => ({
  x: chartX(index),
  y: chartY(pace),
  pace,
}));

/** Cubic segments with horizontal control handles: smooth, never overshoots. */
const LINE_PATH = CHART_POINTS.reduce((path, point, index) => {
  if (index === 0) return `M ${point.x} ${point.y}`;
  const previous = CHART_POINTS[index - 1];
  const handle = Number(((point.x - previous.x) / 2).toFixed(2));
  return `${path} C ${previous.x + handle} ${previous.y}, ${point.x - handle} ${point.y}, ${point.x} ${point.y}`;
}, "");

const AREA_PATH = `${LINE_PATH} L ${CHART_POINTS[CHART_POINTS.length - 1].x} ${BASELINE_Y} L ${CHART_POINTS[0].x} ${BASELINE_Y} Z`;

const GRID_LINES = [330, 360, 390];

const FIRST_PACE = DEMO_WEEKLY_PACE[0];
const LAST_PACE = DEMO_WEEKLY_PACE[DEMO_WEEKLY_PACE.length - 1];
const PACE_GAIN = formatPace(FIRST_PACE - LAST_PACE);

function ProgressChart() {
  const lastPoint = CHART_POINTS[CHART_POINTS.length - 1];

  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      className="pr-svg h-auto w-full text-accent"
      role="img"
      aria-labelledby="chart-title chart-desc"
    >
      <title id="chart-title">
        Exemplo ilustrativo de evolução de pace ao longo de 12 semanas
      </title>
      <desc id="chart-desc">
        Gráfico de demonstração com dados simulados: o pace médio semanal cai de{" "}
        {formatPace(FIRST_PACE)} para {formatPace(LAST_PACE)} por quilômetro ao longo
        de doze semanas. Não representa dados reais de nenhuma conta.
      </desc>

      <defs>
        <linearGradient id="pace-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {GRID_LINES.map((pace) => (
        <g key={pace}>
          <line
            x1={CHART.padLeft}
            y1={chartY(pace)}
            x2={CHART.width - CHART.padRight}
            y2={chartY(pace)}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          <text
            x={CHART.padLeft - 10}
            y={chartY(pace) + 3.5}
            textAnchor="end"
            className="fill-muted font-mono"
            fontSize="9"
          >
            {formatPace(pace)}
          </text>
        </g>
      ))}

      <path
        d={AREA_PATH}
        fill="url(#pace-area)"
        className="pr-pop"
        style={delay(900)}
      />

      <path
        d={LINE_PATH}
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={delay(220, { "--pr-dur": "1.7s" } as CSSProperties)}
      />

      {CHART_POINTS.slice(0, -1).map((point, index) => (
        <circle
          key={point.x}
          cx={point.x}
          cy={point.y}
          r="2.6"
          className="pr-pop fill-accent"
          fillOpacity="0.55"
          style={delay(420 + index * 90)}
        />
      ))}

      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="5"
        className="pr-halo fill-accent"
        style={delay(1600)}
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="4.5"
        className="pr-pop fill-accent stroke-background"
        strokeWidth="2"
        style={delay(1500)}
      />
      <text
        x={lastPoint.x}
        y={lastPoint.y - 12}
        textAnchor="end"
        className="pr-pop fill-accent font-mono"
        fontSize="11"
        fontWeight="600"
        style={delay(1620)}
      >
        {formatPace(LAST_PACE)}
      </text>

      <text
        x={CHART.padLeft}
        y={CHART.height - 10}
        className="fill-muted font-mono"
        fontSize="9"
      >
        sem 1
      </text>
      <text
        x={CHART.width - CHART.padRight}
        y={CHART.height - 10}
        textAnchor="end"
        className="fill-muted font-mono"
        fontSize="9"
      >
        sem 12
      </text>
      <text
        x={CHART.padLeft}
        y={9}
        className="fill-muted font-mono"
        fontSize="8"
        letterSpacing="0.5"
      >
        ↑ mais rápido
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Section 02 — community constellation                                */
/* ------------------------------------------------------------------ */

const NODES = [
  { x: 56, y: 178, r: 6, opacity: 0.5 },
  { x: 112, y: 116, r: 8, opacity: 0.75 },
  { x: 168, y: 196, r: 6.5, opacity: 0.6 },
  { x: 190, y: 92, r: 11, opacity: 1, self: true },
  { x: 254, y: 152, r: 7.5, opacity: 0.7 },
  { x: 306, y: 78, r: 6, opacity: 0.5 },
  { x: 132, y: 44, r: 5, opacity: 0.45 },
  { x: 302, y: 198, r: 5.5, opacity: 0.45 },
  { x: 44, y: 88, r: 5, opacity: 0.4 },
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 3],
  [2, 3],
  [3, 4],
  [4, 5],
  [3, 6],
  [4, 7],
  [1, 8],
  [2, 4],
  [6, 5],
  [0, 2],
  [1, 6],
];

function CommunityGraph() {
  return (
    <svg
      viewBox="0 0 360 240"
      className="pr-svg h-auto w-full text-accent"
      role="img"
      aria-label="Ilustração abstrata: pontos representando corredores conectados entre si por linhas."
    >
      <defs>
        <radialGradient id="community-glow" cx="52%" cy="42%" r="55%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="360" height="240" fill="url(#community-glow)" />

      {EDGES.map(([from, to], index) => (
        <line
          key={`${from}-${to}`}
          x1={NODES[from].x}
          y1={NODES[from].y}
          x2={NODES[to].x}
          y2={NODES[to].y}
          pathLength={1}
          className="pr-draw stroke-accent"
          strokeWidth="1.25"
          strokeOpacity="0.45"
          style={delay(120 + index * 75, { "--pr-dur": "0.7s" } as CSSProperties)}
        />
      ))}

      {NODES.map((node, index) => (
        <g key={`${node.x}-${node.y}`} className="pr-drift" style={delay(index * 40)}>
          {node.self && (
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              className="pr-halo fill-accent"
            />
          )}
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            className={`pr-pop ${node.self ? "fill-accent stroke-background" : "fill-accent"}`}
            strokeWidth={node.self ? 2.5 : 0}
            fillOpacity={node.opacity}
            style={delay(320 + index * 80)}
          />
        </g>
      ))}

      <text
        x={NODES[3].x + 18}
        y={NODES[3].y - 12}
        className="pr-pop fill-muted font-mono"
        fontSize="9"
        letterSpacing="1.5"
        style={delay(1200)}
      >
        VOCÊ
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Section 03 — pillars                                                */
/* ------------------------------------------------------------------ */

const PILLARS = [
  {
    index: "01",
    title: "Preço travado",
    body: "O plano que você assina é o plano que fica. Nenhuma função que já era sua vira paga numa atualização, e o histórico continua inteiro mesmo se você parar de pagar.",
    detail: "sem paywall retroativo",
  },
  {
    index: "02",
    title: "GPS que não inventa",
    body: "Um filtro descarta ponto ruim antes de ele virar distância. O pace que a voz anuncia no meio do treino é o mesmo que aparece no resumo no fim.",
    detail: "filtro de posição + pace suavizado",
  },
  {
    index: "03",
    title: "Os dados são seus",
    body: "Cada corrida é gravada primeiro no seu aparelho e sai de lá quando você quiser, em formato aberto. Nada aqui depende de servidor para funcionar.",
    detail: "offline-first · export livre",
  },
];

const COMMUNITY_ITEMS = [
  {
    title: "Grupos por pace",
    body: "Encontrar quem corre no seu ritmo é mais útil do que aparecer num ranking geral.",
  },
  {
    title: "Rotas testadas",
    body: "A melhor rota do bairro não está num mapa: está com quem já correu ela na terça de manhã.",
  },
  {
    title: "Encontro, não disputa",
    body: "Combinar horário e ponto de partida — sem transformar todo treino leve numa prova.",
  },
];

/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <div className="flex flex-1 flex-col font-sans">
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;animation:none!important}.pr-draw{stroke-dashoffset:0!important}.pr-pop{opacity:1!important}.pr-bar{transform:none!important}`}</style>
      </noscript>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <svg
              viewBox="0 0 64 64"
              aria-hidden="true"
              className="h-6 w-6 text-accent"
              fill="none"
            >
              <path
                d="M14 44 L28 24 L34 34 L50 14"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="50" cy="14" r="5" fill="currentColor" />
            </svg>
            Pegasus Run
          </span>
          <Link
            href="/run"
            className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold transition-colors hover:border-accent hover:text-accent"
          >
            Começar
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-accent/12 blur-3xl sm:left-1/4"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-28">
            <div className="lg:col-span-7">
              <p
                className="pr-enter flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-accent"
                style={delay(0)}
              >
                <span className="relative flex h-2 w-2">
                  <span className="pr-halo absolute inset-0 rounded-full bg-accent" />
                  <span className="relative h-2 w-2 rounded-full bg-accent" />
                </span>
                App de corrida · funciona offline
              </p>

              <h1
                className="pr-enter mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
                style={delay(90)}
              >
                Sua corrida não é um número solto. É uma trajetória.
              </h1>

              <p
                className="pr-enter mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg"
                style={delay(190)}
              >
                Grave o treino com pace estável, aviso por voz a cada trecho e previsão
                de chegada em tempo real. Depois veja a linha que essas corridas
                desenham juntas — com o preço travado e os dados no seu bolso, não no
                servidor de alguém.
              </p>

              <div
                className="pr-enter mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
                style={delay(290)}
              >
                <Link
                  href="/run"
                  className="inline-flex items-center justify-center rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                >
                  Começar a correr
                </Link>
                <a
                  href="#evolucao"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-8 py-4 text-base font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  Ver a evolução
                  <span aria-hidden="true">↓</span>
                </a>
              </div>

              <ul
                className="pr-enter mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-muted"
                style={delay(380)}
              >
                {["sem cadastro", "sem anúncio", "sem depender de internet"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-good" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>

            {/* Mock of the recording screen */}
            <div className="lg:col-span-5">
              <div
                className="pr-enter mx-auto w-full max-w-sm rounded-3xl border border-border bg-surface p-5 shadow-2xl shadow-accent/5"
                style={delay(440)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    prévia da tela de corrida
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className="relative flex h-2 w-2">
                      <span className="pr-halo absolute inset-0 rounded-full bg-good" />
                      <span className="relative h-2 w-2 rounded-full bg-good" />
                    </span>
                    Sinal bom
                  </span>
                </div>

                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    distância
                  </p>
                  <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight">
                    5,20
                    <span className="ml-2 text-xl font-normal text-muted">km</span>
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
                  <div className="bg-background px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      pace
                    </p>
                    <p className="font-mono text-xl font-semibold tabular-nums">
                      5:24 <span className="text-xs font-normal text-muted">/km</span>
                    </p>
                  </div>
                  <div className="bg-background px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      tempo
                    </p>
                    <p className="font-mono text-xl font-semibold tabular-nums">
                      28:04
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    parciais por km
                  </p>
                  <div className="mt-3 flex h-16 items-end gap-1.5">
                    {[
                      { km: "1", height: "58%", pace: "5:31" },
                      { km: "2", height: "70%", pace: "5:26" },
                      { km: "3", height: "84%", pace: "5:22" },
                      { km: "4", height: "94%", pace: "5:19" },
                      { km: "5", height: "78%", pace: "5:23" },
                      { km: "6", height: "34%", pace: "em curso" },
                    ].map((split, index) => (
                      <div
                        key={split.km}
                        className="flex flex-1 flex-col items-center gap-1.5"
                      >
                        <div className="flex h-16 w-full items-end">
                          <div
                            className={`pr-bar w-full rounded-sm ${
                              index === 5 ? "bg-accent/30" : "bg-accent"
                            }`}
                            style={delay(700 + index * 90, { height: split.height })}
                            title={`km ${split.km}: ${split.pace}`}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-muted">
                          {split.km}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-5 border-t border-border pt-4 font-mono text-xs text-muted">
                  chegada prevista em 10 km ·{" "}
                  <span className="text-foreground">53:59</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- 01 · Evolução ---------------- */}
        <section
          id="evolucao"
          className="scroll-mt-16 border-b border-border bg-surface/40"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-16">
            <div className="lg:col-span-5">
              <p
                data-reveal=""
                className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent"
              >
                01 — evolução
              </p>
              <h2
                data-reveal=""
                style={delay(60)}
                className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
              >
                Não é só mostrar um número. É mostrar que você está ficando melhor.
              </h2>
              <p
                data-reveal=""
                style={delay(120)}
                className="mt-5 text-pretty leading-relaxed text-muted"
              >
                Um pace de 5:34 sozinho não diz nada. Do lado das últimas doze semanas,
                ele vira uma resposta: o treino está funcionando. Progresso de corrida
                é lento demais para caber numa única tela de fim de treino — só
                aparece quando alguém guarda tudo e desenha a linha.
              </p>
              <p
                data-reveal=""
                style={delay(180)}
                className="mt-4 text-pretty leading-relaxed text-muted"
              >
                É isso que Pegasus Run faz com o seu histórico: cada corrida entra numa
                curva que você lê em três segundos. E ela não some quando você troca de
                plano.
              </p>

              <dl
                data-reveal=""
                style={delay(240)}
                className="mt-8 flex flex-wrap gap-x-10 gap-y-5"
              >
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    ganho no exemplo
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-good">
                    −{PACE_GAIN}
                    <span className="ml-1 text-sm font-normal text-muted">/km</span>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    janela
                  </dt>
                  <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                    12
                    <span className="ml-1 text-sm font-normal text-muted">semanas</span>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-7">
              <figure
                data-reveal=""
                style={delay(100)}
                className="rounded-3xl border border-border bg-background p-5 sm:p-7"
              >
                <figcaption className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold">
                    Pace médio por semana
                  </span>
                  <span className="rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-warn">
                    exemplo ilustrativo
                  </span>
                </figcaption>

                <ProgressChart />

                <p className="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-muted">
                  Gráfico de demonstração com dados simulados — não são corridas reais
                  de ninguém. É o formato que o seu histórico vai ter conforme as
                  semanas passam.
                </p>
              </figure>
            </div>
          </div>
        </section>

        {/* ---------------- 02 · Comunidade ---------------- */}
        <section id="comunidade" className="scroll-mt-16 border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-16">
            <div className="order-2 lg:order-1 lg:col-span-6">
              <div
                data-reveal=""
                className="rounded-3xl border border-border bg-surface/60 p-4 sm:p-6"
              >
                <CommunityGraph />
              </div>
            </div>

            <div className="order-1 lg:order-2 lg:col-span-6">
              <p
                data-reveal=""
                className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent"
              >
                02 — comunidade
              </p>
              <h2
                data-reveal=""
                style={delay(60)}
                className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
              >
                Correr é uma atividade de comunidade.
              </h2>
              <p
                data-reveal=""
                style={delay(120)}
                className="mt-5 text-pretty leading-relaxed text-muted"
              >
                Quase ninguém segura sozinho o quinto quilômetro de uma terça-feira
                chuvosa. O que sustenta o hábito é alguém esperando no ponto de
                encontro, um grupo que combina o mesmo ritmo, uma rota que outra pessoa
                já testou e disse que vale.
              </p>
              <p
                data-reveal=""
                style={delay(180)}
                className="mt-4 text-pretty leading-relaxed text-muted"
              >
                Por isso a comunidade não é uma aba pregada no fim do app. Ela é a razão
                de o Pegasus Run existir: correr junto, mesmo quando cada um corre no
                seu horário.
              </p>

              <ul className="mt-8 space-y-px overflow-hidden rounded-2xl border border-border bg-border">
                {COMMUNITY_ITEMS.map((item, index) => (
                  <li
                    key={item.title}
                    data-reveal=""
                    style={delay(240 + index * 80)}
                    className="bg-background px-5 py-4"
                  >
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {item.body}
                    </p>
                  </li>
                ))}
              </ul>
              <p
                data-reveal=""
                style={delay(480)}
                className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
              >
                no mapa do produto — a gravação da corrida já está de pé
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- 03 · Pilares ---------------- */}
        <section id="pilares" className="scroll-mt-16 border-b border-border bg-surface/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <p
              data-reveal=""
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent"
            >
              03 — o combinado
            </p>
            <h2
              data-reveal=""
              style={delay(60)}
              className="mt-5 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
            >
              Três promessas que não mudam depois que você entra.
            </h2>

            <div className="mt-12 grid gap-4 sm:gap-5 lg:grid-cols-3">
              {PILLARS.map((pillar, index) => (
                <article
                  key={pillar.title}
                  data-reveal=""
                  style={delay(120 + index * 110)}
                  className="group relative flex flex-col rounded-2xl border border-border bg-background p-6 transition-colors hover:border-accent/60 sm:p-7"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-6 top-0 h-px w-10 bg-accent transition-all duration-500 group-hover:w-24 sm:left-7"
                  />
                  <span className="font-mono text-xs text-muted">{pillar.index}</span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                    {pillar.body}
                  </p>
                  <p className="mt-5 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                    {pillar.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- CTA final ---------------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-5 py-24 text-center sm:px-8 sm:py-32">
            <h2
              data-reveal=""
              className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl"
            >
              A primeira corrida é agora.
            </h2>
            <p
              data-reveal=""
              style={delay(80)}
              className="max-w-md text-pretty leading-relaxed text-muted"
            >
              Abra, toque em começar e corra. Sem cadastro, sem cartão, sem tour de
              onboarding antes de você sair de casa.
            </p>
            <Link
              href="/run"
              data-reveal=""
              style={delay(160)}
              className="inline-flex items-center justify-center rounded-full bg-accent px-10 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Começar a correr
            </Link>
            <p
              data-reveal=""
              style={delay(220)}
              className="font-mono text-xs text-muted"
            >
              depois da primeira visita, funciona sem internet
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Pegasus Run — feito para quem corre.</span>
          <span className="font-mono">gráfico da seção 01: dados simulados</span>
        </div>
      </footer>

      <Reveal />
    </div>
  );
}
