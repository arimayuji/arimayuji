import type { CSSProperties, ReactNode } from "react";

/** Sets the per-element animation delay consumed by the CSS in globals.css. */
export const delay = (ms: number, extra?: CSSProperties) =>
  ({ "--pr-delay": `${ms}ms`, ...extra }) as CSSProperties;

/**
 * A native `<input type="range">`, restyled: `appearance-none` strips the
 * browser's own chrome first (which on Chromium includes a flat dark border
 * around the track that has nothing to do with the app's palette), then the
 * base classes rebuild the track from the input's own background and the
 * `::-webkit-slider-thumb`/`::-moz-range-thumb` rules rebuild the thumb —
 * appearance-none removes both, not just the border.
 */
export const RANGE_INPUT_CLASS =
  "h-1.5 w-full cursor-pointer touch-none appearance-none rounded-full border-0 bg-border outline-none " +
  "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm " +
  "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:shadow-sm " +
  "[&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border";

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
    <header className="pr-enter px-5 pt-8 pb-5" style={delay(0)}>
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
      <p className="mt-0.5 font-mono text-2xl tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
      </p>
    </div>
  );
}
