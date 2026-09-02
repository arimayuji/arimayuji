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
        className={`pr-press relative h-6 w-11 shrink-0 rounded-full ${
          checked ? "bg-accent" : "bg-surface"
        } border border-border`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-background transition-transform duration-300 [transition-timing-function:var(--ease-spring)] ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * A pill toggle for a cluster of independent booleans that would otherwise
 * stack into a tall list of full-width `PreferenceToggle` rows (each with
 * its own label + hint line) — same active/inactive pill language `PillTabs`
 * already uses, just multi-select instead of one-at-a-time.
 */
export function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`pr-press flex-1 rounded-full border px-3 py-2 text-xs font-semibold active:scale-95 ${
        checked ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
      }`}
    >
      {label}
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
      className={`pr-press min-h-12 min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm font-medium active:scale-95 ${
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
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  );
  // The gap between slots (Tailwind's `gap-1` = 0.25rem) has to be baked into
  // both the indicator's width and its translate, or a row of 3+ tabs drifts
  // out of alignment with its slot the further right the active tab is.
  const gapRem = 0.25;
  return (
    // At `lg:` this drops the pill track for plain underline tabs — a
    // filled accent pill sliding in a rounded track is a touch control
    // (the same "widget" register as a tile grid or a slider), not
    // something a desktop web app reaches for; Notion/Linear-style tabs
    // are a bottom-border indicator on flat text ("pense como se fosse
    // Notion... esse fundo arredondado só faz sentido no widget de app
    // nativo", 2026-09-02). The sliding highlight is mobile-only
    // (`lg:hidden`) — at `lg:` each tab just draws its own border instead.
    <div className="relative flex gap-1 rounded-full bg-background p-1 lg:gap-5 lg:rounded-none lg:border-b lg:border-border lg:bg-transparent lg:p-0">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-full bg-accent transition-transform duration-300 [transition-timing-function:var(--ease-spring)] lg:hidden"
        style={{
          width: `calc((100% - ${(tabs.length - 1) * gapRem}rem) / ${tabs.length})`,
          transform: `translateX(calc(${activeIndex} * 100% + ${activeIndex * gapRem}rem))`,
        }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`pr-press relative z-10 h-9 flex-1 rounded-full text-xs font-bold active:scale-95 lg:h-auto lg:flex-none lg:rounded-none lg:border-b-2 lg:pb-2.5 lg:text-sm lg:font-semibold lg:active:scale-100 ${
            active === tab.id
              ? "text-accent-foreground lg:border-accent lg:text-accent"
              : "text-muted lg:border-transparent lg:hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Neutral counterpart for things that are real but not yet persisted.
 * Squares off at `lg:` by default (see `Card`'s own comment on the same
 * rule) — `account-card.tsx` used to spell `lg:rounded-md` out explicitly
 * per usage before this was the default; new callers don't need to.
 */
export function NoticeBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted lg:rounded-md ${className}`}
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
const SCREEN_WIDTH = "max-w-md md:max-w-2xl lg:max-w-6xl";
const SCREEN_WIDTH_WIDE = "max-w-md lg:max-w-6xl";

/**
 * The desktop surface stopped being one tall phone-width column.
 *
 * Every screen used to clamp to `max-w-md` at every width, so a 1440px
 * browser showed a ~450px ribbon of content with two thirds of the window
 * empty on either side — the single loudest "this is a phone app someone
 * opened on a laptop" tell left in the product, and called out directly
 * ("não quero conteúdo todo em uma coluna só", 2026-09-02).
 *
 * CSS multi-column rather than a grid, deliberately: these screens are a
 * stack of independent sections of wildly different heights (a two-line
 * toggle next to a chart next to a list of twelve rows), and a grid's rows
 * would leave a hole beside every short cell. Columns flow content instead,
 * so both columns end level with no per-section span markup to maintain —
 * which also means a screen author adding a new section gets the layout for
 * free instead of having to think about which cell it lands in.
 *
 * `break-inside-avoid` is what keeps a card from being sliced across the
 * column boundary; the bottom margin on children replaces the flex `gap`
 * that no longer applies once the container stops being a flex column.
 */
const SCREEN_COLUMNS =
  "lg:block lg:columns-2 lg:gap-x-8 lg:[&>*]:mb-4 lg:[&>*]:break-inside-avoid " +
  // A screen showing exactly one thing — an empty state, a loading skeleton,
  // a "not found" — has nothing to balance, and leaving that single card in
  // the left half with a bare right half reads as a broken page rather than
  // a deliberate one. `:only-child` catches every such case structurally,
  // so no screen has to remember to opt out by hand.
  "lg:[&>*:only-child]:[column-span:all]";

/**
 * Put on a direct child of `Screen` that must run the full width instead of
 * being squeezed into one column — a page-level filter/toolbar row, a wide
 * table, a chart or map whose whole point is horizontal room. Anything that
 * scrolls sideways especially: a chip row clipped at a column boundary
 * reads as broken rather than scrollable.
 *
 * `column-span: all` breaks the flow at that point (content above it
 * balances across both columns, the spanning element runs full width, then
 * columns resume), which is exactly the behaviour a toolbar wants and the
 * reason this is deliberately not applied to ordinary cards.
 */
export const SPAN_COLUMNS = "lg:[column-span:all]";
/**
 * A third option besides the phone-narrow default and the `wide` dashboard
 * grid: a moderate reading width that, critically, drops the `mx-auto`
 * centering at `lg:` (`lg:mx-0`) instead of just widening it. A handful of
 * short cards centered inside a `wide` 6xl column still reads as "floating
 * in the middle of a mostly-empty screen" — this anchors them to the left
 * edge (under the sidebar) like an actual desktop settings panel, at a
 * width that keeps prose/labels from stretching edge-to-edge. Only makes
 * sense paired with content that's deliberately short (see /perfil,
 * /perfil/dados, /privacidade), never a substitute for `wide`'s own
 * multi-column dashboards. `ScreenHeader` accepts the same prop so a
 * subpage's title lines up flush with the panel below it.
 *
 * `md:max-w-xl` fills a real gap: nothing here widens again until `lg:`
 * (1024px), so any window between phone-narrow and that — a resized
 * desktop browser, a tablet, a half-width split view — sat at the same
 * 448px column with the excess just turning into dead space on both
 * sides, which reads as broken rather than intentional (reported
 * directly against /plano's own empty state at ~900px). Only one step
 * before `lg:` takes over; not the same problem as `wide`'s "floating in
 * the middle" note above, since this stays a single centered column the
 * whole way, just a wider one.
 */
const SCREEN_WIDTH_PANEL = "max-w-md md:max-w-xl lg:mx-0 lg:max-w-5xl";

export function ScreenHeader({
  title,
  subtitle,
  badge,
  wide = false,
  panel = false,
  compactOnWide = false,
  hideTitle = false,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  wide?: boolean;
  /** Matches `Screen`'s own `panel` — for a subpage reached by drilling into a desktop screen (e.g. /perfil/dados, /privacidade from Conta) rather than a sidebar tab in its own right, so `compactOnWide` doesn't apply (there's no redundant sidebar label to collapse against) but the header should still line up flush-left with the panel-width content below it instead of sitting centered above a left-anchored column. Mutually exclusive with `wide`, same as `Screen`. */
  panel?: boolean;
  /**
   * Collapses this whole header (including `badge`/`subtitle`) at `lg:` —
   * for a page whose desktop surface already replaces the mobile header
   * entirely with its own layout (e.g. /plano's dashboard already shows
   * "Semana X de Y" its own way), so there's nothing left worth keeping.
   * Never affects the native app/narrow browser.
   */
  compactOnWide?: boolean;
  /**
   * Drops just the `<h1>`, at every breakpoint — for a page whose `title`
   * is already the exact label persistent nav chrome shows for it: the
   * bottom tab bar's own label on mobile, same as the desktop sidebar's
   * (app-shell.tsx's DESKTOP_TABS). Repeating it as a giant heading right
   * below is redundant chrome, not information — found 2026-08-31 on
   * Histórico/Feed/Plano/Perfil, all of which duplicate their own bottom-nav
   * label this way. Keeps `badge`/`subtitle`, which carry real information
   * the nav label doesn't (Plano's phase/week subtitle, Feed's Amigos link).
   */
  hideTitle?: boolean;
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
      <div className={`mx-auto w-full ${wide ? SCREEN_WIDTH_WIDE : panel ? SCREEN_WIDTH_PANEL : SCREEN_WIDTH}`}>
        <div className={`flex flex-wrap items-center gap-3 ${hideTitle ? "justify-end" : "justify-between"}`}>
          {!hideTitle && (
            // Two different type systems, on purpose. Mobile keeps the
            // condensed display face (Oswald, via `font-mono`) with positive
            // tracking — that's the app's own identity in your hand. Desktop
            // switches to the text face at a larger size with *negative*
            // tracking and tighter leading, which is the rule Apple applies
            // to every optical size: letters read further apart as they grow,
            // so large text has to be tightened to keep its colour even.
            // Oswald's own wide tracking at 2xl reads as a poster headline
            // sitting on top of a data dashboard. Numerals stay Oswald
            // everywhere (see `Stat`) — that's the part that's actually brand.
            <h1 className="font-mono text-2xl font-semibold tracking-wide text-balance lg:font-sans lg:text-[28px] lg:leading-[1.15] lg:font-semibold lg:tracking-[-0.021em]">
              {title}
            </h1>
          )}
          {badge}
        </div>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-muted text-pretty lg:mt-1.5 lg:tracking-[-0.005em]">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

/**
 * Standard content area for every app screen: one max-width, one gutter, and
 * — at `lg:` — two columns instead of a phone-width ribbon (see
 * `SCREEN_COLUMNS`). `wide` and `panel` are mutually exclusive; `wide` wins
 * if both are somehow passed.
 */
export function Screen({
  children,
  wide = false,
  panel = false,
  singleColumn = false,
}: {
  children: ReactNode;
  wide?: boolean;
  panel?: boolean;
  /**
   * Opts out of the two-column desktop flow, keeping one column at every
   * width. For content whose order is the point and whose items are meant to
   * be read in sequence — a chronological feed, a step-by-step flow — where
   * splitting into columns would ask someone to read down one side and jump
   * back up. Never a way to avoid thinking about the desktop layout: a
   * screen that's just a stack of independent sections belongs in columns.
   * Ignored when `wide` is set, since those screens lay themselves out.
   */
  singleColumn?: boolean;
}) {
  // `wide` screens build their own desktop layout internally
  // (plan-dashboard.tsx, treinador/sala), so they must stay a plain flex
  // column here — flowing them through `columns` would slice a dashboard
  // that already knows how it wants to be arranged.
  const columns = !wide && !singleColumn ? SCREEN_COLUMNS : "";
  return (
    <main className="flex flex-1 flex-col px-5 pb-10">
      <div
        // gap-5 (not the tighter gap-4) is deliberate breathing room between
        // sections on the native app's own touch-sized cards; lg:gap-4 pins
        // desktop back to its already-tuned dense-panel spacing (plan-dashboard.tsx,
        // treinador/sala) so this only affects the native/narrow surface.
        className={`mx-auto flex w-full flex-1 flex-col gap-5 lg:gap-4 ${wide ? SCREEN_WIDTH_WIDE : panel ? SCREEN_WIDTH_PANEL : SCREEN_WIDTH} ${columns}`}
      >
        {children}
      </div>
    </main>
  );
}

/**
 * `lg:rounded-lg lg:p-4` used to be an explicit per-instance override, only
 * on `account-card.tsx`'s own `Card` ("a settings list row... instead of
 * the touch-sized rounded mobile card"). Promoted to the default here
 * instead of spelled out on every call site: a desktop-width browser visit
 * to this app is a genuinely different surface (see PROJECT-CONTEXT.md,
 * "web é um produto à parte"), not the native app's touch-sized rounded
 * cards stretched wider — every `Card` should read as a desktop panel at
 * that width, not just the one screen that happened to get this treatment
 * first. Purely visual and purely additive: `lg:` never applies on the
 * native WebView or a narrow browser window, so nothing here changes for
 * either.
 */
export function Card({
  children,
  className = "",
  style,
  id,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Forwarded to the root `<section>` — lets a page anchor-link straight to one card (e.g. /estudos#warmup) instead of only ever landing at the top of the screen. */
  id?: string;
}) {
  return (
    <section
      id={id}
      style={style}
      className={`rounded-2xl border border-border bg-surface p-5 lg:rounded-lg lg:p-4 ${className}`}
    >
      {children}
    </section>
  );
}

/** Same `lg:` density rule as `Card` above — tighter breathing room under the title on a desktop panel than a touch-sized mobile card wants. `mb-5` (not `mb-4`) is the same slight-increase pass as `Screen`'s own gap. */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 lg:mb-2.5">
      {/* Section headings on the desktop surface lose the extra tracking for
          the same optical-size reason `ScreenHeader` does — at this size the
          job is a crisp label, not a spaced-out caption. */}
      <h2 className="text-sm font-semibold tracking-wide lg:tracking-[-0.006em]">{children}</h2>
      {aside}
    </div>
  );
}

/**
 * A section's subject, as a row of keywords instead of a paragraph.
 *
 * Most sections in this app carried an explanatory sentence or two under the
 * title — fine on a phone you read one card at a time, but on a desktop
 * screen showing a dozen sections at once it turns into a wall of prose
 * nobody reads ("vamos colocar labels nas seções ao invés de jogar muito
 * texto bruto", 2026-09-02). Keywords carry the same "what is this" in a
 * shape you scan rather than read.
 *
 * Never a replacement for text that is load-bearing: a consent explanation,
 * a privacy disclosure, an honesty disclaimer ("números inventados", "não é
 * recomendação médica"), or an error telling someone what actually broke.
 * Those say something a keyword can't, and this app's whole posture depends
 * on them staying legible — see SOCIAL-CONTEXT.md.
 */
export function Keywords({ items, className = "" }: { items: readonly string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-muted uppercase lg:rounded-md"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * The one empty state the product uses — a screen with nothing on it yet
 * (no friends, no saved routes, no runs), never an error or a failed load.
 * That distinction is the whole point: the horse is disappointed that
 * there's nothing here *yet*, which is honest for an empty shelf and would
 * be gaslighting for a request that actually failed.
 *
 * The illustration is masked rather than drawn: `cavalo-triste.svg` is pure
 * line art, so painting it through a CSS mask lets it take `currentColor`
 * (here a soft muted tint) instead of sitting on the page as a hard black
 * drawing that outweighs the text it's supporting.
 */
export function EmptyState({
  title,
  description,
  action,
  size = "section",
  className = "",
}: {
  title: string;
  description?: ReactNode;
  /** Optional call to action — the one thing that would fill this screen. */
  action?: ReactNode;
  /**
   * `"screen"` when this IS the page — nothing else rendered, so the
   * illustration carries the whole moment and gets the room to do it.
   * `"section"` (the default) when it's one card's worth of nothing among
   * other sections: /rotas has two of these stacked, and two full-size
   * horses on one screen reads as a repeated stamp rather than a state.
   */
  size?: "section" | "screen";
  className?: string;
}) {
  const screen = size === "screen";
  const maskUrl = "url(/empty/cavalo-triste.svg)";
  return (
    // Scales up at `lg:`. The phone sizing is right for a card you hold; the
    // same 144px illustration on a 1440px screen disappears into the middle
    // of it ("empty state no web ficou pequeno", 2026-09-02). How far up it
    // scales is what `size` decides — see that prop.
    <div
      className={`flex flex-col items-center px-4 py-8 text-center ${screen ? "lg:py-14" : "lg:py-10"} ${className}`}
    >
      <span
        aria-hidden="true"
        // Native `aspect-ratio` off the artwork's own viewBox (754×695), so
        // the mask never letterboxes inside a square box.
        className={`block w-32 bg-muted/40 ${screen ? "lg:w-56" : "lg:w-40"}`}
        style={{
          aspectRatio: "754 / 695",
          maskImage: maskUrl,
          WebkitMaskImage: maskUrl,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskSize: "contain",
          WebkitMaskSize: "contain",
        }}
      />
      <p
        className={`mt-5 text-sm font-semibold ${
          screen ? "lg:mt-7 lg:text-lg lg:tracking-[-0.012em]" : "lg:mt-5 lg:text-base lg:tracking-[-0.008em]"
        }`}
      >
        {title}
      </p>
      {description && (
        <p
          className={`mt-1.5 max-w-xs text-xs leading-relaxed text-muted text-pretty lg:mt-2 ${
            screen ? "lg:max-w-sm lg:text-sm" : ""
          }`}
        >
          {description}
        </p>
      )}
      {action && <div className={`mt-5 ${screen ? "lg:mt-7" : ""}`}>{action}</div>}
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
