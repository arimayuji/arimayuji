import { ExampleBadge } from "./ui";

/**
 * Static preview of the shareable run card.
 *
 * Everything here is a stand-in: the background is drawn artwork rather than a
 * photo, the route is a hand-authored path, the stats are invented. The real
 * card will render over a photo the athlete picks and animate the route being
 * drawn — none of that exists yet, so this shows composition only.
 *
 * The background does come in a real, working set of scenario templates,
 * though — for the rural/trail runner who doesn't have a skyline photo handy,
 * illustrated stand-ins for the time of day they actually ran (dawn, morning,
 * fog, deep night) are a real feature, not a mockup of one.
 */

export type ScenarioId = "madrugada" | "manha" | "neblina" | "noite";

interface ScenarioDef {
  label: string;
  /** Short form for the on-card badge, where "Noite fechada" wraps and collides with the wordmark. */
  short: string;
  hint: string;
  sky: [string, string, string, string];
  ridgeFar: string;
  ridgeNear: string;
  ridgeOpacity: number;
  fog?: boolean;
  celestial?: { cx: number; cy: number; r: number; fill: string; opacity: number };
  stars?: { cx: number; cy: number; r: number }[];
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  madrugada: {
    label: "Madrugada",
    short: "Madrugada",
    hint: "céu de transição, primeira luz no horizonte",
    sky: ["#1b2a4a", "#4d4270", "#b06a52", "#2a2130"],
    ridgeFar: "#1d1b2b",
    ridgeNear: "#14121d",
    ridgeOpacity: 0.9,
    celestial: { cx: 232, cy: 196, r: 26, fill: "#f0b27a", opacity: 0.75 },
  },
  manha: {
    label: "Manhã",
    short: "Manhã",
    hint: "luz alta, céu claro",
    sky: ["#2f5f8a", "#7cb2d1", "#eed49a", "#8a7a4f"],
    ridgeFar: "#233524",
    ridgeNear: "#182619",
    ridgeOpacity: 0.85,
    celestial: { cx: 250, cy: 92, r: 22, fill: "#fff3c4", opacity: 0.9 },
  },
  neblina: {
    label: "Neblina",
    short: "Neblina",
    hint: "baixo contraste, relevo se perdendo na cerração",
    sky: ["#5c6670", "#7c868e", "#a9b1b6", "#8f979c"],
    ridgeFar: "#495158",
    ridgeNear: "#3a4147",
    ridgeOpacity: 0.4,
    fog: true,
  },
  noite: {
    label: "Noite fechada",
    short: "Noite",
    hint: "céu escuro, lua e estrelas",
    sky: ["#04060c", "#0a0f1e", "#0f1830", "#050810"],
    ridgeFar: "#050608",
    ridgeNear: "#020304",
    ridgeOpacity: 1,
    celestial: { cx: 246, cy: 84, r: 16, fill: "#cdd6e8", opacity: 0.85 },
    stars: [
      { cx: 60, cy: 60, r: 1.4 },
      { cx: 100, cy: 110, r: 1 },
      { cx: 150, cy: 50, r: 1.2 },
      { cx: 200, cy: 100, r: 1 },
      { cx: 280, cy: 60, r: 1.3 },
      { cx: 300, cy: 140, r: 1 },
      { cx: 40, cy: 150, r: 1 },
      { cx: 130, cy: 30, r: 1 },
    ],
  },
};

/** Fabricated route, authored to look like a real loop with a river bend. */
const DEMO_ROUTE =
  "M 42 250 C 58 196, 96 188, 118 208 S 150 254, 186 238 C 218 224, 214 176, 190 156 " +
  "S 138 132, 132 104 C 128 82, 152 62, 186 62 C 220 62, 248 84, 262 112";

const DEMO_STATS = {
  // Dot decimal, matching `formatDistanceKm` on the recording screen.
  distance: "8.42",
  duration: "42:10",
  pace: "5:00",
  when: "Domingo, 09 ago · 06h20",
};

function PlaceholderPhoto({ scenario }: { scenario: ScenarioId }) {
  const s = SCENARIOS[scenario];
  const [sky0, sky1, sky2, sky3] = s.sky;

  return (
    <svg
      viewBox="0 0 320 400"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="share-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky0} />
          <stop offset="46%" stopColor={sky1} />
          <stop offset="78%" stopColor={sky2} />
          <stop offset="100%" stopColor={sky3} />
        </linearGradient>
        <linearGradient id="share-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
          <stop offset="42%" stopColor="#000000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id="share-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="80%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern
          id="share-hatch"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="12" stroke="#ffffff" strokeWidth="1" opacity="0.07" />
        </pattern>
      </defs>

      <rect width="320" height="400" fill="url(#share-sky)" />

      {s.stars?.map((star, i) => (
        <circle key={i} cx={star.cx} cy={star.cy} r={star.r} fill="#ffffff" opacity="0.8" />
      ))}
      {s.celestial && (
        <circle
          cx={s.celestial.cx}
          cy={s.celestial.cy}
          r={s.celestial.r}
          fill={s.celestial.fill}
          opacity={s.celestial.opacity}
        />
      )}

      {/* Ridge line: enough to read as landscape, obviously drawn, not shot. */}
      <path
        d="M0 250 L64 214 L112 240 L168 196 L228 236 L280 210 L320 236 V400 H0 Z"
        fill={s.ridgeFar}
        opacity={s.ridgeOpacity}
      />
      <path
        d="M0 296 L58 268 L126 300 L196 264 L268 296 L320 274 V400 H0 Z"
        fill={s.ridgeNear}
        opacity={Math.min(1, s.ridgeOpacity + 0.1)}
      />

      {s.fog && <rect width="320" height="400" fill="url(#share-fog)" />}

      {/* Hatch says "placeholder" without a watermark shouting over the design. */}
      <rect width="320" height="400" fill="url(#share-hatch)" />
      <rect width="320" height="400" fill="url(#share-scrim)" />
    </svg>
  );
}

export function ShareCard({
  compact = false,
  scenario = "madrugada",
}: {
  compact?: boolean;
  scenario?: ScenarioId;
}) {
  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-border"
      role="img"
      aria-label={`Prévia do card de compartilhamento: traçado e estatísticas de exemplo sobre o cenário ${SCENARIOS[scenario].label}`}
    >
      <PlaceholderPhoto scenario={scenario} />

      <svg
        viewBox="0 0 320 400"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {/* Lifted clear of the stats block at the bottom of the card. */}
        <g transform="translate(0 -28)">
          <path
            d={DEMO_ROUTE}
            fill="none"
            stroke="#ffffff"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.18"
          />
          <path
            d={DEMO_ROUTE}
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="42" cy="250" r="6" fill="#ffffff" />
          <circle cx="262" cy="112" r="6" fill="none" stroke="#ffffff" strokeWidth="3" />
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col justify-between p-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10px] whitespace-nowrap uppercase tracking-[0.14em] backdrop-blur-sm">
            Xanthus
          </span>
          <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10px] whitespace-nowrap uppercase tracking-[0.14em] backdrop-blur-sm">
            {SCENARIOS[scenario].short.toLowerCase()}
          </span>
        </div>

        <div>
          {!compact && (
            <p className="font-mono text-[11px] tracking-wide text-white/75">{DEMO_STATS.when}</p>
          )}
          <p className="mt-1 font-mono text-5xl font-semibold tabular-nums leading-none">
            {DEMO_STATS.distance}
            <span className="ml-1.5 text-xl font-normal text-white/80">km</span>
          </p>
          <dl className="mt-3 flex gap-6 font-mono tabular-nums">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/70">Tempo</dt>
              <dd className="text-lg">{DEMO_STATS.duration}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/70">Pace</dt>
              <dd className="text-lg">
                {DEMO_STATS.pace}
                <span className="ml-1 text-xs text-white/70">/km</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

/** Small entry point used on /perfil. */
export function ShareCardTeaser() {
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 shrink-0">
        <ShareCard compact />
      </div>
      <div className="min-w-0">
        <ExampleBadge>prévia estática</ExampleBadge>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          Veja como a corrida vai ficar quando virar card pra compartilhar — já dá pra escolher
          entre 4 cenários de fundo.
        </p>
      </div>
    </div>
  );
}
