import { ExampleBadge } from "./ui";

/**
 * Static preview of the shareable run card.
 *
 * Everything here is a stand-in: the background is drawn artwork rather than a
 * photo, the route is a hand-authored path, the stats are invented. The real
 * card will render over a photo the athlete picks and animate the route being
 * drawn — none of that exists yet, so this shows composition only.
 */

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

function PlaceholderPhoto() {
  return (
    <svg
      viewBox="0 0 320 400"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="share-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b2a4a" />
          <stop offset="46%" stopColor="#4d4270" />
          <stop offset="78%" stopColor="#b06a52" />
          <stop offset="100%" stopColor="#2a2130" />
        </linearGradient>
        <linearGradient id="share-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
          <stop offset="42%" stopColor="#000000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
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
      <circle cx="232" cy="196" r="26" fill="#f0b27a" opacity="0.75" />
      {/* Ridge line: enough to read as landscape, obviously drawn, not shot. */}
      <path d="M0 250 L64 214 L112 240 L168 196 L228 236 L280 210 L320 236 V400 H0 Z" fill="#1d1b2b" opacity="0.9" />
      <path d="M0 296 L58 268 L126 300 L196 264 L268 296 L320 274 V400 H0 Z" fill="#14121d" />
      {/* Hatch says "placeholder" without a watermark shouting over the design. */}
      <rect width="320" height="400" fill="url(#share-hatch)" />
      <rect width="320" height="400" fill="url(#share-scrim)" />
    </svg>
  );
}

export function ShareCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-border"
      role="img"
      aria-label="Prévia do card de compartilhamento: traçado e estatísticas de exemplo sobre uma foto de fundo provisória"
    >
      <PlaceholderPhoto />

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
          <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] backdrop-blur-sm">
            Pegasus Run
          </span>
          <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] backdrop-blur-sm">
            foto provisória
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
          Veja como a corrida vai ficar quando virar card pra compartilhar, com a sua foto de
          fundo.
        </p>
      </div>
    </div>
  );
}
