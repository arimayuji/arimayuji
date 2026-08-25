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

/** A labeled on/off switch — one preference row (a boolean setting with a one-line hint), used anywhere a screen offers an opt-in toggle rather than a fixed choice set. */
export function PreferenceToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface"
        } border border-border`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-background transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
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
      className={`min-h-12 min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-foreground hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A pill-track tab switcher — two (or a few) mutually-exclusive views inside
 * one card, e.g. Amigos' Convites/Amigos or Longão's Criar/Entrar. Distinct
 * from `SegmentedButton` above: that one is a row of equal-weight bordered
 * buttons for a form field's value; this is a single accent-filled pill
 * sliding between labels sunk into a track, the shape a *tab switch* reads
 * as everywhere else in the redesign (the run screen's own metric picker,
 * the sort sheets) — using `SegmentedButton` here would look like a form
 * control sitting where a navigation control belongs.
 */
export function PillTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-background p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`h-9 flex-1 rounded-full text-xs font-bold transition-colors ${
            active === tab.id ? "bg-accent text-accent-foreground" : "text-muted"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Neutral counterpart for things that are real but not yet persisted. */
export function NoticeBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * The phone-card width every screen uses by default — correct for the
 * native app (always phone-narrow) and for a browser window of any
 * realistic size, EXCEPT the handful of screens (today: /treinador and its
 * children) that are actually meant to be opened on a desktop browser by
 * someone managing several students at once, where clamping to a phone's
 * width just wastes the screen. `lg:` only ever matches a wide viewport —
 * the native WebView never reports one, so `wide` is a pure no-op there
 * and on any narrow browser window; nothing about the default (non-wide)
 * path changes for the ~30 other screens that don't pass it.
 */
const SCREEN_WIDTH = "max-w-md";
const SCREEN_WIDTH_WIDE = "max-w-md lg:max-w-6xl";
/**
 * A third option besides the phone-narrow default and the `wide` dashboard
 * grid: a moderate reading width that, critically, drops the `mx-auto`
 * centering at `lg:` (`lg:mx-0`) instead of just widening it. A handful of
 * short cards centered inside a `wide` 6xl column still reads as "floating
 * in the middle of a mostly-empty screen" — this anchors them to the left
 * edge (under the sidebar) like an actual desktop settings panel, at a
 * width that keeps prose/labels from stretching edge-to-edge. Only makes
 * sense paired with content that's deliberately short (see /perfil), never
 * a substitute for `wide`'s own multi-column dashboards.
 */
const SCREEN_WIDTH_PANEL = "max-w-md lg:mx-0 lg:max-w-2xl";

export function ScreenHeader({
  title,
  subtitle,
  badge,
  wide = false,
  compactOnWide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  wide?: boolean;
  /**
   * Collapses this whole header at `lg:` — for a page whose `title` is
   * already the exact label the desktop sidebar shows for it (app-shell.tsx's
   * DESKTOP_TABS — "Perfil" the tab, "Perfil" the h1 right below it), where
   * repeating it as a giant heading is redundant chrome, not information.
   * Never affects the native app/narrow browser, which has no sidebar this
   * would double up with in the first place.
   */
  compactOnWide?: boolean;
}) {
  return (
    <header
      className={`pr-enter px-5 pb-5 ${compactOnWide ? "lg:hidden" : ""}`}
      // The top safe-area inset AND the gradient AppHeader's own height
      // (app-shell.tsx) are both handled once, as padding on the shell's
      // scroll container — every screen that uses ScreenHeader renders
      // inside it, so adding either gap again here would double up. This
      // only needs its own breathing room below that, not a gap sized to
      // clear anything.
      style={delay(0, { paddingTop: "1.25rem" })}
    >
      <div className={`mx-auto w-full ${wide ? SCREEN_WIDTH_WIDE : SCREEN_WIDTH}`}>
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

/** Standard content column for every app screen: one max-width, one gutter — see `wide`'s own comment above `SCREEN_WIDTH`, and `panel`'s above `SCREEN_WIDTH_PANEL`. `wide` and `panel` are mutually exclusive; `wide` wins if both are somehow passed. */
export function Screen({
  children,
  wide = false,
  panel = false,
}: {
  children: ReactNode;
  wide?: boolean;
  panel?: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col px-5 pb-10">
      <div
        className={`mx-auto flex w-full flex-1 flex-col gap-4 ${wide ? SCREEN_WIDTH_WIDE : panel ? SCREEN_WIDTH_PANEL : SCREEN_WIDTH}`}
      >
        {children}
      </div>
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
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Small glyph shown ahead of the label — optional, most callers don't pass one. */
  icon?: ReactNode;
}) {
  return (
    // `min-w-0` matters here specifically because every caller puts this in
    // a CSS grid column: grid items default to `min-width: auto`, which
    // lets a long unbreakable value (font-mono, no natural wrap point —
    // "1:08:06" has none) force its own track wider than the space
    // actually available instead of shrinking to fit, pushing whichever
    // column lands last off the edge of the screen. `truncate` on the
    // value is the fallback once it's actually free to shrink: elide
    // rather than silently clip past the viewport with no indication
    // anything was cut.
    <div className="min-w-0">
      <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        {icon}
        {label}
      </span>
      <p className="text-metal mt-0.5 truncate font-mono text-2xl tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
      </p>
    </div>
  );
}
