import type { CSSProperties } from "react";
import {
  RIDGE_FAR_PATH,
  RIDGE_NEAR_PATH,
  SCENARIOS,
  type ScenarioId,
} from "@/lib/shareCard/scenarios";
import { ExampleBadge, delay } from "./ui";
import { ShoeShowcase } from "./shoe-showcase";
import { HORSE_BUST_PATHS } from "../horse-mark";

export { SCENARIOS, type ScenarioId };

/**
 * Composition preview of the shareable run card, on invented numbers.
 *
 * The card a runner actually shares is not this one: that is rendered to a
 * canvas and recorded to a video file (src/lib/shareCard/renderer.ts), because
 * a CSS/SVG composition like this one cannot be captured into a video at all.
 * This stays as the still, illustrative version — a photo/scenario picker you
 * can flip through without generating anything — and both read their
 * backgrounds from the same `SCENARIOS` data, so the sky here is the sky that
 * ends up in the file.
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
      <path d={RIDGE_FAR_PATH} fill={s.ridgeFar} opacity={s.ridgeOpacity} />
      <path
        d={RIDGE_NEAR_PATH}
        fill={s.ridgeNear}
        opacity={Math.min(1, s.ridgeOpacity + 0.1)}
      />

      {s.fog && <rect width="320" height="400" fill="url(#share-fog)" />}

      {/* Hatch says "placeholder" without a watermark shouting over the design. */}
      <rect width="320" height="400" fill="url(#share-hatch)" />
    </svg>
  );
}

/**
 * Dark gradient that keeps the white text/stats overlay readable, whether
 * it's sitting over an illustrated scenario or an arbitrary uploaded photo.
 * Factored out of `PlaceholderPhoto` so both backgrounds get the same
 * treatment.
 */
function Scrim() {
  return (
    <svg
      viewBox="0 0 320 400"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="share-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
          <stop offset="42%" stopColor="#000000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect width="320" height="400" fill="url(#share-scrim)" />
    </svg>
  );
}

export function ShareCard({
  compact = false,
  scenario = "madrugada",
  layout = "trajeto",
  photoUrl,
  shoe,
}: {
  compact?: boolean;
  scenario?: ScenarioId;
  /** "numero" previews the big-number layout instead — see shareCard/renderer.ts for the real, animated version this stands in for. */
  layout?: "trajeto" | "numero";
  photoUrl?: string;
  shoe?: { name: string; color: string };
}) {
  const background = photoUrl
    ? "a sua foto"
    : `o cenário ${SCENARIOS[scenario].label}`;

  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-border"
      role="img"
      aria-label={
        shoe
          ? `Prévia do card de compartilhamento: traçado e estatísticas de exemplo sobre ${background}, com o tênis ${shoe.name} em destaque`
          : `Prévia do card de compartilhamento: traçado e estatísticas de exemplo sobre ${background}`
      }
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL, not a static/remote asset Next's <Image> optimizer can handle.
        <img
          src={photoUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <PlaceholderPhoto scenario={scenario} />
      )}
      <Scrim />

      {layout === "trajeto" && (
        <svg
          viewBox="0 0 320 400"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* Lifted clear of the stats block at the bottom of the card. */}
          <g className="pr-enter" transform="translate(0 -28)" style={delay(120)}>
            <path
              d={DEMO_ROUTE}
              pathLength={1}
              fill="none"
              stroke="#ffffff"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.18"
              className="pr-draw"
              style={delay(120, { "--pr-dur": "1.8s" } as CSSProperties)}
            />
            <path
              d={DEMO_ROUTE}
              pathLength={1}
              fill="none"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pr-draw"
              style={delay(120, { "--pr-dur": "1.8s" } as CSSProperties)}
            />
            <circle
              cx="42"
              cy="250"
              r="6"
              fill="#ffffff"
              className="pr-pop"
              style={delay(120)}
            />
            <circle
              cx="262"
              cy="112"
              r="6"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              className="pr-pop"
              style={delay(1750)}
            />
          </g>
        </svg>
      )}

      {shoe && layout === "trajeto" && (
        <ShoeShowcase
          color={shoe.color}
          className="pointer-events-none absolute right-[-2%] top-[46%] w-[62%] -translate-y-1/2"
        />
      )}

      <div className="absolute inset-0 flex items-start justify-between gap-2 p-4 text-white">
        <span
          className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-black/35 backdrop-blur-sm"
          aria-label="Xanthus"
        >
          <svg viewBox="0 0 100 100" className="h-[62%] w-[62%]" aria-hidden="true" fill="none">
            <g stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              {HORSE_BUST_PATHS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          </svg>
        </span>
        <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10px] whitespace-nowrap uppercase tracking-[0.14em] backdrop-blur-sm">
          {SCENARIOS[scenario].short.toLowerCase()}
        </span>
      </div>

      {layout === "trajeto" ? (
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
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
      ) : (
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center text-center text-white">
          <p className="font-mono text-6xl font-semibold tabular-nums leading-none">
            {DEMO_STATS.distance}
            <span className="ml-1.5 text-2xl font-normal text-white/80">km</span>
          </p>
          <dl className="mt-4 flex gap-8 font-mono tabular-nums">
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
      )}
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
        <ExampleBadge>composição</ExampleBadge>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          Sua última corrida vira um vídeo animado pro status — com o traçado se desenhando e os
          números dela. Escolha o cenário de fundo ou use uma foto sua.
        </p>
      </div>
    </div>
  );
}
