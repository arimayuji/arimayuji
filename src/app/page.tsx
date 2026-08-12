import type { CSSProperties } from "react";
import Link from "next/link";
import { Reveal } from "./reveal";

/** Sets the per-element animation delay consumed by the CSS in globals.css. */
const delay = (ms: number, extra?: CSSProperties) =>
  ({ "--pr-delay": `${ms}ms`, ...extra }) as CSSProperties;

/* ------------------------------------------------------------------ */
/* The chrome finish on the brand mark                                 */
/* ------------------------------------------------------------------ */

/**
 * Reflection ramp for the horse mark: `[offset, light theme, dark theme]`.
 *
 * Polished metal does not read as one flat colour. A chromed surface mirrors
 * a bright sky, a dark horizon, then sky again, so this alternates specular
 * spikes (near-white) with shadow troughs (near-ink blue) three times across
 * the mark, with one deliberately hard edge at 0.345/0.355 standing in for
 * the horizon line — a single two-colour ramp is what makes a "metallic"
 * gradient look cheap. Brand blue (#2f6fed / #5b8dff) holds the mid-tones so
 * the mark still reads as *our* blue and not as grey.
 *
 * Two registers, because the page ground flips. On #0b0e11 the highlights can
 * run all the way to white; on #ffffff those same whites would punch holes in
 * a 1px outline, so the light theme carries the identical banding shifted
 * down into a darker range.
 *
 * This is a brand-moment finish only — the accent token, buttons, badges and
 * state dots stay flat blue on purpose. Banding reads as metal on a 300px
 * mark and as a rendering bug on a 16px status dot.
 */
const CHROME_STOPS: ReadonlyArray<readonly [number, string, string]> = [
  [0, "#2f6fed", "#2f6fed"],
  [0.07, "#12306e", "#1a4098"],
  [0.16, "#4a80f0", "#5b8dff"],
  [0.225, "#93b7ff", "#d8e6ff"],
  [0.245, "#c3d7ff", "#ffffff"],
  [0.262, "#c3d7ff", "#ffffff"],
  [0.278, "#7fa8ff", "#a9c6ff"],
  [0.3, "#2456bd", "#2f62d4"],
  [0.345, "#0f2a63", "#16357e"],
  [0.355, "#3568dc", "#3f74e6"],
  [0.44, "#5b8dff", "#6d9bff"],
  [0.51, "#86adff", "#b9d0ff"],
  [0.55, "#b0cbff", "#f7faff"],
  [0.6, "#6d9bff", "#86adff"],
  [0.66, "#2f6fed", "#2f6fed"],
  [0.72, "#14336f", "#1a4098"],
  [0.775, "#3f74e6", "#4a80f0"],
  [0.845, "#8fb3ff", "#dbe8ff"],
  [0.868, "#bcd4ff", "#ffffff"],
  [0.895, "#6d9bff", "#93b7ff"],
  [0.95, "#1f49a6", "#2450b5"],
  [1, "#3b74e4", "#4278e8"],
];

/**
 * The gradient itself, angled ~125° so the light sweeps diagonally across the
 * horse rather than banding it flat.
 *
 * `gradientUnits="userSpaceOnUse"` is load-bearing. Each mark is several
 * separate `<path>` elements, and the default `objectBoundingBox` resolves the
 * gradient against *each path's own* box — every hoof tick and eye dash would
 * get its own private rainbow instead of one light source crossing the whole
 * animal. User space pins all of them to the shared 0–100 viewBox.
 *
 * The per-stop colours ride CSS variables so one static pair of Tailwind
 * classes can swap the whole ramp at the media query; interpolating the hex
 * straight into `className` would be invisible to Tailwind's scanner.
 */
function ChromeGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1="15"
        y1="0"
        x2="85"
        y2="100"
      >
        {CHROME_STOPS.map(([offset, light, dark]) => (
          <stop
            key={offset}
            offset={offset}
            className="[stop-color:var(--pr-chrome-light)] dark:[stop-color:var(--pr-chrome-dark)]"
            style={
              {
                "--pr-chrome-light": light,
                "--pr-chrome-dark": dark,
              } as CSSProperties
            }
          />
        ))}
      </linearGradient>
    </defs>
  );
}

/**
 * A quiet glow straddling a section's bottom border, instead of the border
 * doing all the work of the transition alone. Reuses the same soft
 * accent-blur motif as the hero/CTA background glows rather than inventing a
 * new decorative language for what's still, structurally, just a seam.
 */
function SeamGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
    >
      <div className="-mb-14 h-28 w-72 rounded-full bg-accent/10 blur-3xl" />
    </div>
  );
}

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

const PILLAR_SVG = "pr-svg h-auto w-full text-accent";

const NOISY_X = [
  22, 34, 45, 57, 68, 80, 91, 103, 114, 126, 137, 149, 160, 172, 183, 195, 206, 218,
];
const NOISY_Y = [
  84, 73, 90, 66, 83, 56, 72, 53, 71, 45, 63, 46, 62, 37, 52, 31, 40, 30,
];
const NOISY_PATH = NOISY_X.map(
  (x, index) => `${index === 0 ? "M" : "L"} ${x} ${NOISY_Y[index]}`,
).join(" ");

const CLEAN_PATH = "M 22 84 C 60 79, 78 68, 114 62 C 150 56, 178 44, 218 30";

const CLEAN_DOTS: [number, number][] = [
  [22, 84],
  [68, 72],
  [114, 62],
  [166, 50],
];

const CLEAN_END: [number, number] = [218, 30];

const DROPPED_POINTS: [number, number][] = [
  [45, 90],
  [80, 56],
  [183, 52],
];

const PHONE_ROWS: [number, number, number][] = [
  [42, 40, 0.45],
  [56, 30, 0.32],
  [70, 36, 0.4],
];

const FILE_ROWS: [number, number][] = [
  [60, 30],
  [70, 22],
];

function PillarGrid({ rows }: { rows: number[] }) {
  return (
    <>
      {rows.map((y) => (
        <line
          key={y}
          x1="18"
          y1={y}
          x2="222"
          y2={y}
          className="stroke-border"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      ))}
    </>
  );
}

function PriceLockArt({ offset }: { offset: number }) {
  return (
    <svg viewBox="0 0 240 112" className={PILLAR_SVG} aria-hidden="true">
      <path
        d="M 24 74 H 68 V 60 H 112 V 46 H 156 V 32 H 200"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-muted"
        strokeWidth="1.5"
        strokeOpacity="0.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={delay(offset, { "--pr-dur": "1.4s" } as CSSProperties)}
      />
      <path
        d="M 192 26 L 200 32 L 192 38"
        fill="none"
        className="pr-pop stroke-muted"
        strokeWidth="1.5"
        strokeOpacity="0.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={delay(offset + 1200)}
      />

      <path
        d="M 24 82 H 166"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={delay(offset + 120, { "--pr-dur": "1s" } as CSSProperties)}
      />
      {[48, 84, 120, 152].map((x, index) => (
        <circle
          key={x}
          cx={x}
          cy="82"
          r="2.4"
          className="pr-pop fill-accent"
          fillOpacity="0.5"
          style={delay(offset + 420 + index * 90)}
        />
      ))}

      <path
        d="M 184 70 V 63 A 8 8 0 0 1 200 63 V 70"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2"
        strokeLinecap="round"
        style={delay(offset + 700, { "--pr-dur": "0.6s" } as CSSProperties)}
      />
      <path
        d="M 181 70 H 203 A 4 4 0 0 1 207 74 V 92 A 4 4 0 0 1 203 96 H 181 A 4 4 0 0 1 177 92 V 74 A 4 4 0 0 1 181 70 Z"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2"
        strokeLinejoin="round"
        style={delay(offset + 880, { "--pr-dur": "0.7s" } as CSSProperties)}
      />
      <circle
        cx="192"
        cy="83"
        r="2.2"
        className="pr-pop fill-accent"
        style={delay(offset + 1320)}
      />
    </svg>
  );
}

function SignalFilterArt({ offset }: { offset: number }) {
  return (
    <svg viewBox="0 0 240 112" className={PILLAR_SVG} aria-hidden="true">
      <PillarGrid rows={[38, 64, 90]} />

      <path
        d={NOISY_PATH}
        pathLength={1}
        fill="none"
        className="pr-draw stroke-muted"
        strokeWidth="1.25"
        strokeOpacity="0.5"
        strokeLinejoin="round"
        style={delay(offset, { "--pr-dur": "1.1s" } as CSSProperties)}
      />

      {DROPPED_POINTS.map(([x, y], index) => (
        <g
          key={`${x}-${y}`}
          className="pr-pop stroke-muted"
          strokeWidth="1.4"
          strokeOpacity="0.7"
          strokeLinecap="round"
          style={delay(offset + 780 + index * 110)}
        >
          <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
          <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
        </g>
      ))}

      <path
        d={CLEAN_PATH}
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={delay(offset + 640, { "--pr-dur": "1.2s" } as CSSProperties)}
      />
      {CLEAN_DOTS.map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="2.4"
          className="pr-pop fill-accent"
          fillOpacity="0.55"
          style={delay(offset + 1000 + index * 100)}
        />
      ))}
      <circle
        cx={CLEAN_END[0]}
        cy={CLEAN_END[1]}
        r="5"
        className="pr-halo fill-accent"
        style={delay(offset + 1500)}
      />
      <circle
        cx={CLEAN_END[0]}
        cy={CLEAN_END[1]}
        r="4.5"
        className="pr-pop fill-accent stroke-background"
        strokeWidth="2"
        style={delay(offset + 1440)}
      />
    </svg>
  );
}

function OwnDataArt({ offset }: { offset: number }) {
  return (
    <svg viewBox="0 0 240 112" className={PILLAR_SVG} aria-hidden="true">
      <path
        d="M 36 14 H 76 A 10 10 0 0 1 86 24 V 88 A 10 10 0 0 1 76 98 H 36 A 10 10 0 0 1 26 88 V 24 A 10 10 0 0 1 36 14 Z"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2"
        strokeLinejoin="round"
        style={delay(offset, { "--pr-dur": "1.1s" } as CSSProperties)}
      />
      <rect
        x="46"
        y="22"
        width="20"
        height="3"
        rx="1.5"
        className="pr-pop fill-muted"
        fillOpacity="0.6"
        style={delay(offset + 420)}
      />
      {PHONE_ROWS.map(([y, width, opacity], index) => (
        <rect
          key={y}
          x="36"
          y={y}
          width={width}
          height="5"
          rx="2.5"
          className="pr-pop fill-accent"
          fillOpacity={opacity}
          style={delay(offset + 520 + index * 90)}
        />
      ))}
      <rect
        x="46"
        y="88"
        width="20"
        height="2.5"
        rx="1.25"
        className="pr-pop fill-muted"
        fillOpacity="0.5"
        style={delay(offset + 760)}
      />

      <path
        d="M 96 56 H 144"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2"
        strokeLinecap="round"
        style={delay(offset + 820, { "--pr-dur": "0.7s" } as CSSProperties)}
      />
      <path
        d="M 137 49 L 144 56 L 137 63"
        fill="none"
        className="pr-pop stroke-accent"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={delay(offset + 1320)}
      />

      <path
        d="M 160 28 H 194 L 212 46 V 80 A 4 4 0 0 1 208 84 H 160 A 4 4 0 0 1 156 80 V 32 A 4 4 0 0 1 160 28 Z"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="2"
        strokeLinejoin="round"
        style={delay(offset + 1000, { "--pr-dur": "0.9s" } as CSSProperties)}
      />
      <path
        d="M 194 28 V 46 H 212"
        pathLength={1}
        fill="none"
        className="pr-draw stroke-accent"
        strokeWidth="1.5"
        strokeOpacity="0.6"
        strokeLinejoin="round"
        style={delay(offset + 1400, { "--pr-dur": "0.5s" } as CSSProperties)}
      />
      {FILE_ROWS.map(([y, width], index) => (
        <rect
          key={y}
          x="166"
          y={y}
          width={width}
          height="4"
          rx="2"
          className="pr-pop fill-muted"
          fillOpacity="0.6"
          style={delay(offset + 1520 + index * 110)}
        />
      ))}
    </svg>
  );
}

const PILLAR_ART = [PriceLockArt, SignalFilterArt, OwnDataArt];

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
          <span className="flex items-center gap-2.5 font-mono text-sm font-semibold tracking-wide">
            <svg
              viewBox="0 0 100 100"
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
            >
              <ChromeGradient id="pr-chrome-glyph" />
              <g
                stroke="url(#pr-chrome-glyph)"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M 81,38 C 83,40 83,43 81,44 C 79,45 77,44 76,42 C 72,43 67,43 63,40
                     C 61,38 60,36 60,34 C 58,43 53,53 48,62 C 54,62 60,64 65,68
                     C 68,71 70,74 72,77 C 79,76 87,78 90,82 C 92,85 91,88 88,89
                     C 84,90 76,90 70,89 C 66,88 64,85 65,81 C 64,78 62,75 60,73
                     C 56,72 52,71 48,70 C 45,76 42,81 38,86 C 34,90 29,90 27,85
                     C 23,80 19,75 18,70 C 21,68 24,67 26,64 C 24,58 21,51 20,45
                     C 23,43 27,42 30,40 C 29,35 28,29 29,24 C 32,26 35,27 38,28
                     C 42,25 48,21 55,17 C 54,12 56,9 59,10 C 61,12 61,15 60,17
                     C 62,13 64,12 66,14 C 67,16 67,19 66,21 C 71,26 77,32 81,38 Z"
                />
                <path d="M 66,85 C 74,86.5 82,86.5 90,84.5" />
              </g>
            </svg>
            Xanthus
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
          {/* Brand mark, full body: a quiet watermark, not a second thing competing with the headline. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="pointer-events-none absolute -right-24 -top-16 hidden h-[34rem] w-[34rem] opacity-[0.1] sm:block lg:-right-32 lg:h-[42rem] lg:w-[42rem]"
            fill="none"
          >
            <ChromeGradient id="pr-chrome-watermark" />
            <g
              stroke="url(#pr-chrome-watermark)"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Body: muzzle, brow, near ear, crest, back, croup, tail, near
                  hind leg into the sneaker, belly, near foreleg, throat, jaw. */}
              <path
                d="M 29.4,20.4 C 29.6,19.5 30.0,18.9 30.7,18.4 C 33.4,16.2 36.2,13.9 38.6,12.0
                   C 39.7,11.0 40.3,10.1 40.4,9.2 L 41.5,4.8 C 42.6,6.4 43.6,7.7 44.4,8.6
                   C 45.9,9.3 47.0,10.6 48.1,12.4 C 50.2,15.7 52.1,19.4 53.6,23.4
                   C 54.0,25.5 54.1,27.6 53.9,29.6 C 53.7,31.7 53.8,33.7 54.4,35.5
                   C 54.7,36.9 55.0,38.2 55.2,39.4 C 56.2,40.9 57.2,42.2 58.0,43.1
                   C 59.4,44.6 60.7,46.6 61.8,48.8 C 63.0,51.0 64.8,52.6 67.0,53.8
                   C 69.2,55.0 70.9,56.2 72.0,57.6 C 73.0,58.8 73.5,59.9 73.6,61.0
                   C 75.6,61.8 77.4,62.9 78.9,64.4 C 80.6,66.0 81.7,67.9 82.3,70.2
                   C 82.9,72.6 83.0,75.4 82.8,78.4 C 82.6,81.4 82.2,84.0 82.2,86.2
                   C 82.3,88.6 83.0,90.6 84.2,92.0 C 85.0,92.9 85.9,93.4 86.9,93.6
                   C 85.4,93.8 84.0,93.3 82.8,92.2 C 81.2,90.8 80.0,89.0 79.2,86.8
                   C 78.4,84.6 78.1,82.2 78.2,79.6 C 78.4,77.0 78.6,74.4 78.4,72.0
                   C 78.2,69.6 77.5,67.6 76.2,66.0 C 75.0,64.6 73.6,63.8 72.2,63.6
                   C 71.6,66.6 70.2,69.6 67.8,72.6 C 66.0,74.9 64.8,77.5 64.4,80.4
                   C 64.2,82.0 63.4,83.2 62.0,84.0 C 58.8,85.0 55.4,86.0 52.0,86.4
                   C 51.8,86.5 51.6,86.5 51.4,86.6 C 52.4,88.2 52.9,90.6 52.7,92.8
                   C 52.5,94.4 51.6,95.4 50.0,95.8 C 46.6,96.3 42.0,96.4 38.2,96.0
                   C 36.2,95.8 34.7,95.3 33.8,94.6 C 33.0,94.0 32.8,92.9 33.3,91.7
                   C 33.7,90.8 34.2,90.3 34.8,90.0 C 36.6,90.4 38.6,90.3 40.6,89.8
                   C 42.4,89.3 43.8,88.2 45.0,86.4 C 46.6,84.9 49.0,82.8 52.0,80.6
                   C 54.4,78.9 56.0,77.9 56.8,77.5 C 56.0,74.0 54.4,70.6 52.6,67.4
                   C 52.0,66.2 51.6,65.2 51.4,64.4 C 49.4,63.0 47.4,61.5 45.4,59.7
                   C 43.2,57.7 41.2,55.5 39.6,53.3 C 38.0,51.1 36.8,48.9 35.8,46.7
                   C 35.4,45.7 35.0,44.8 34.6,44.2 C 34.0,43.4 33.0,43.0 31.6,43.0
                   C 30.2,43.0 29.1,43.3 28.4,43.9 C 27.8,44.6 27.4,45.8 27.2,47.4
                   C 27.0,49.2 26.9,50.9 27.0,52.4 C 27.1,53.5 27.3,54.3 27.6,54.9
                   C 27.8,55.7 27.4,56.4 26.4,56.9 C 25.6,57.2 24.9,57.0 24.5,56.2
                   C 24.1,55.2 23.8,53.9 23.5,52.2 C 23.0,49.6 22.5,46.9 22.0,44.2
                   C 21.8,43.2 21.7,42.5 21.7,42.0 C 22.2,40.7 23.6,39.8 26.0,39.4
                   C 28.6,39.0 31.2,39.2 33.8,39.9 C 33.5,38.9 33.1,38.0 32.6,37.2
                   C 33.7,35.9 34.9,34.5 36.0,33.2 C 37.4,31.4 38.7,29.7 39.9,28.2
                   C 41.0,26.6 41.9,25.1 42.8,23.9 C 43.4,22.9 44.0,22.2 44.4,21.8
                   C 42.9,21.3 41.3,21.2 39.6,21.4 C 37.9,21.6 36.6,22.1 35.7,22.9
                   C 35.0,23.5 34.5,24.2 34.1,25.0 C 33.2,25.1 32.4,24.9 31.7,24.5
                   C 31.0,24.1 30.4,23.5 30.0,22.8 C 29.6,22.1 29.4,21.3 29.4,20.4 Z"
              />
              {/* Off-side foreleg, thrown up and out: knee over, hoof leading. */}
              <path
                d="M 33.6,37.4 C 31.6,34.0 29.4,30.6 26.8,28.2 C 25.8,27.2 24.0,27.2 23.0,28.2
                   C 20.8,30.6 19.0,33.2 17.5,35.7 C 15.8,38.4 13.8,41.2 12.2,43.2
                   C 11.9,44.2 12.4,45.0 13.6,45.4 C 13.9,45.5 14.2,45.4 14.4,45.1
                   C 16.2,43.2 18.4,40.6 20.5,38.1 C 21.6,36.7 22.9,35.0 23.8,33.2
                   C 25.4,35.2 27.4,38.0 29.4,40.4"
              />
              {/* Off-side hind leg, planted behind the shod one. */}
              <path
                d="M 65.0,80.2 C 66.4,81.8 67.6,83.2 68.4,84.8 C 69.2,86.6 68.0,88.2 65.4,89.2
                   C 63.6,89.9 61.9,90.2 60.6,90.2 C 61.2,91.1 62.8,91.3 64.6,90.9
                   C 67.6,90.2 70.0,88.6 70.8,86.6 C 71.6,84.6 70.6,82.4 68.8,80.4
                   C 67.8,79.2 67.2,78.0 67.0,76.8"
              />
              {/* Three mane flames off the crest, and the off-side ear laid back. */}
              <path
                d="M 53.0,19.6 C 57.0,22.6 60.8,25.6 63.8,28.6 C 60.2,27.2 56.8,25.4 54.4,23.0
                   M 53.9,25.4 C 57.4,26.8 60.8,28.4 63.4,30.2 C 59.8,29.8 56.6,29.2 54.0,28.6
                   M 53.7,31.0 C 57.4,32.2 61.0,33.6 64.4,35.6 C 60.8,35.2 57.2,34.6 54.4,34.2
                   M 44.9,8.5 C 47.8,8.1 50.6,8.6 52.6,9.5 C 50.4,10.1 47.6,10.0 45.6,9.6"
              />
              {/* Sneaker midsole and two laces; eye tick. */}
              <path
                d="M 35.6,92.4 C 39.0,93.4 43.4,93.7 47.6,93.4 C 49.6,93.2 50.6,93.0 51.2,92.7
                   M 41.6,91.2 L 43.0,92.2 M 43.4,90.0 L 44.8,91.0
                   M 38.4,13.4 C 39.2,13.4 40.0,13.8 40.6,14.4"
              />
            </g>
          </svg>
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
                className="pr-enter mt-6 text-balance font-mono text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
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
                  className="group relative inline-block rounded-full pb-2 focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[calc(100%-0.5rem)] rounded-full bg-[#1c4bb0] dark:bg-[#2c4f9e]"
                  />
                  <span className="relative block -translate-y-2 rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground transition-transform duration-150 ease-out group-hover:-translate-y-2.5 group-active:translate-y-0 group-active:duration-75 group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
                    Começar a correr
                  </span>
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
          <SeamGlow />
        </section>

        {/* ---------------- 01 · Evolução ---------------- */}
        <section
          id="evolucao"
          className="relative scroll-mt-16 border-b border-border bg-surface/40"
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
                className="mt-5 text-balance font-mono text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
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
                É isso que o Xanthus faz com o seu histórico: cada corrida entra numa
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
          <SeamGlow />
        </section>

        {/* ---------------- 02 · Comunidade ---------------- */}
        <section id="comunidade" className="relative scroll-mt-16 border-b border-border">
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
                className="mt-5 text-balance font-mono text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
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
                de o Xanthus existir: correr junto, mesmo quando cada um corre no
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
          <SeamGlow />
        </section>

        {/* ---------------- 03 · Pilares ---------------- */}
        <section
          id="pilares"
          className="relative scroll-mt-16 border-b border-border bg-surface/40"
        >
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
              className="mt-5 max-w-2xl text-balance font-mono text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
            >
              Três promessas que não mudam depois que você entra.
            </h2>

            <div className="mt-12 grid gap-4 sm:gap-5 lg:grid-cols-3">
              {PILLARS.map((pillar, index) => {
                const Art = PILLAR_ART[index];
                return (
                  <article
                    key={pillar.title}
                    data-reveal=""
                    style={delay(120 + index * 110)}
                    className="group relative flex flex-col rounded-2xl border border-border bg-background p-6 transition-colors hover:border-accent/60 sm:p-7"
                  >
                    <span className="font-mono text-xs text-muted">{pillar.index}</span>
                    <div className="mt-4 rounded-xl border border-border bg-surface/60 p-3 transition-colors group-hover:border-accent/40 sm:p-4">
                      <Art offset={220 + index * 110} />
                    </div>
                    <h3 className="mt-6 font-mono text-xl font-semibold tracking-tight">
                      {pillar.title}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                      {pillar.body}
                    </p>
                    <p className="mt-5 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                      {pillar.detail}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
          <SeamGlow />
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
              className="text-balance font-mono text-3xl font-semibold leading-tight tracking-tight sm:text-5xl"
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
          <span>Xanthus — feito para quem corre.</span>
          <span className="font-mono">gráfico da seção 01: dados simulados</span>
        </div>
      </footer>

      <Reveal />
    </div>
  );
}
