import type { DecisionTopic } from "@/lib/evidence";

/**
 * One small glyph per `DecisionTopic`, same register as the bottom-nav
 * icons in app-shell.tsx (stroke-only, 1.7 weight, round joins) — sized for
 * a ~28px badge next to a section header on /estudos, not for a hero
 * illustration, so each one stays to 2-4 simple shapes instead of anything
 * that needs detail at scale to read.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const PATHS: Record<DecisionTopic, React.ReactElement> = {
  volume_progression: (
    <path d="M5 19V15M10.3 19V11M15.7 19V7M21 19V12.5" />
  ),
  periodization: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.2" />
      <path d="M4 10.5h16M8.3 3v4M15.7 3v4" />
    </>
  ),
  taper: <path d="M4.5 6h15L14 13.2V19h-4v-5.8L4.5 6Z" />,
  overtraining: <path d="M3 12.5h3.3l1.7-5 3 10.5 2-8 1.7 2.5H21" />,
  injury_prevention: (
    <>
      <path d="M12 3.2 19 6v6c0 4.6-3 7.7-7 8.8-4-1.1-7-4.2-7-8.8V6l7-2.8Z" />
      <path d="M9 12l2 2 4-4.3" />
    </>
  ),
  /** A bandage strip with its two adhesive dots — treatment/return-to-activity, distinct from the shield-and-checkmark "prevent it happening" glyph above. */
  injury_rehab: (
    <>
      <rect x="3.5" y="8.8" width="17" height="6.4" rx="3.2" transform="rotate(-18 12 12)" />
      <circle cx="8" cy="9.4" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14.6" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  pace_zones: (
    <>
      <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0" />
      <path d="M12 16.5 16 11" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  race_time_prediction: (
    <>
      <circle cx="12" cy="13.5" r="7.2" />
      <path d="M12 13.5V9.3M9.3 3.5h5.4M12 3.5v2" />
    </>
  ),
  warmup: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.5v2.3M12 18.2v2.3M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M3.5 12h2.3M18.2 12h2.3M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </>
  ),
  static_stretch_pre: (
    <path d="M12 12h.01M4.5 12h5M14.5 12h5M8 8l-3.5 4 3.5 4M16 8l3.5 4-3.5 4" />
  ),
  static_stretch_post: (
    <path d="M4.5 8 8 12l-3.5 4M19.5 8 16 12l3.5 4M10.3 12h1.4M12.3 12h1.4" />
  ),
  cooldown: (
    <>
      <path d="M12 4v16M5 8l14 8M5 16l14-8" />
      <path d="M12 4l-1.8 1.8M12 4l1.8 1.8M12 20l-1.8-1.8M12 20l1.8-1.8" />
    </>
  ),
  hydration: <path d="M12 3.2c-3.2 5-6.8 8.7-6.8 12.3a6.8 6.8 0 0 0 13.6 0c0-3.6-3.6-7.3-6.8-12.3Z" />,
  nutrition_timing: (
    <>
      <path d="M7.3 3v6.2a1.9 1.9 0 1 0 3.8 0V3M9.2 9.2V21" />
      <path d="M16.3 3c-1.7 0-2.8 1.9-2.8 4.1s1.1 3.9 2.8 3.9M16.3 3v18" />
    </>
  ),
};

export function TopicIcon({ topic, className = "h-5 w-5" }: { topic: DecisionTopic; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
      {PATHS[topic]}
    </svg>
  );
}
