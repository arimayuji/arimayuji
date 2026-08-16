import type { CSSProperties, ReactNode } from "react";

/**
 * Sets the per-element animation delay/duration consumed by `.pr-enter` in
 * globals.css. Shorter than the landing page's default 0.8s: a screen you
 * navigate to constantly (histórico, perfil, ...) should feel instant, not
 * cinematic — the landing page never sets `--pr-dur`, so its hero keeps the
 * slower pace.
 */
export const delay = (ms: number, extra?: CSSProperties) =>
  ({ "--pr-delay": `${ms}ms`, "--pr-dur": "0.4s", ...extra }) as CSSProperties;

/**
 * The honesty marker.
 *
 * Same pill the landing page puts on its demo pace chart: amber, monospaced,
 * uppercase. Any number on screen that was invented rather than measured wears
 * one of these, and the surrounding copy says so again in words — a badge
 * alone is easy to skim past.
 */
export function ExampleBadge({ children = "exemplo ilustrativo" }: { children?: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-warn">
      {children}
    </span>
  );
}

/** One button in a row of mutually-exclusive options — goal distance, run days, distance unit, wherever a screen needs a small fixed choice set instead of a native `<select>`. */
export function SegmentedButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 flex-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-foreground hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

/** Neutral counterpart for things that are real but not yet persisted. */
export function NoticeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
      {children}
    </span>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header
      className="pr-enter px-5 pb-5"
      style={delay(0, { paddingTop: "calc(2rem + env(safe-area-inset-top))" })}
    >
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-wide text-balance">{title}</h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

/** Standard content column for every app screen: one max-width, one gutter. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col px-5 pb-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4">{children}</div>
    </main>
  );
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      style={style}
      className={`rounded-2xl border border-border bg-surface p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold tracking-wide">{children}</h2>
      {aside}
    </div>
  );
}

/** Label + big tabular number, the readout used across the app. */
export function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
      </p>
    </div>
  );
}
