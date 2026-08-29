"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  deleteCompletedRun,
  listCompletedRuns,
  runMovingSeconds,
  type CompletedRun,
  type StoredPoint,
} from "@/lib/tracking/storage";
import { removeFinishedRun } from "@/lib/profileStats";
import { resolvePlaceLabel } from "@/lib/placeMatch";
import { useAuth } from "@/lib/useAuth";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { allTimeBests } from "@/lib/tracking/personalRecords";
import type { DistanceUnit } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { Card, CardTitle, delay, Screen, ScreenHeader, Stat } from "../ui";
import { ModalPortal } from "../modal-portal";
import { RunFrequencyHeatmap } from "../run-frequency-heatmap";

/**
 * The only screen in the app wired to real data: it reads whatever
 * `listCompletedRuns()` has in IndexedDB and shows nothing else. No sample
 * runs, no placeholder rows — an empty history renders the empty state, which
 * is the state most people will actually see, so that is where the care went.
 */

/** Below this many runs, any "trend" line would be noise dressed as insight. */
const TREND_MIN_RUNS = 6;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; runs: CompletedRun[] };


const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "ter., 11 de ago." → "Ter., 11 de ago.". Done here rather than with CSS
 * `capitalize`, which would also upper-case the "de".
 */
function formatRunDate(date: Date): string {
  const text = dateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Route thumbnail drawn from the run's own recorded points — real geometry,
 * not decoration. Longitude is scaled by cos(latitude) so the shape isn't
 * stretched sideways, and the path is fitted to the box with a small margin.
 */
/**
 * Fills the full height of its row (a flex item stretched by the parent's
 * default `align-items: stretch`, not a fixed square icon anymore) — the
 * card itself clips it to the rounded corner via `overflow-hidden`, so this
 * stays a plain rectangle rather than rounding its own edges.
 */
function RouteThumb({
  points,
  className = "h-full w-24 shrink-0 border-r border-border bg-background",
}: {
  points: StoredPoint[];
  /** Overrides the list-row sizing (fixed 96px column) for other contexts, e.g. `FocalRunModal`'s full-width preview. */
  className?: string;
}) {
  const size = 56;
  const pad = 6;

  if (points.length < 2) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className="text-[10px] text-muted">sem GPS</span>
      </div>
    );
  }

  const latRad = (points[0].lat * Math.PI) / 180;
  const xs = points.map((p) => p.lon * Math.cos(latRad));
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const scale = (size - pad * 2) / span;
  const offsetX = pad + ((span - (maxX - minX)) * scale) / 2;
  const offsetY = pad + ((span - (maxY - minY)) * scale) / 2;

  const d = points
    .map((_, i) => {
      const x = offsetX + (xs[i] - minX) * scale;
      // SVG y grows downward; latitude grows north, so flip it.
      const y = size - (offsetY + (ys[i] - minY) * scale);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid slice"
      className={`text-accent ${className}`}
      role="img"
      aria-label="Traçado da corrida"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyState() {
  return (
    <Card className="pr-enter overflow-hidden text-center" style={delay(80)}>
      <div className="-mx-5 -mt-5 mb-6 h-48 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
        <img
          src="/historico-empty.webp"
          alt="Ilustração de um percurso ainda não percorrido"
          className="h-full w-full object-cover"
        />
      </div>

      <h2 className="text-lg font-semibold text-balance">
        Seu histórico começa na primeira corrida
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted text-pretty">
        Ainda não há nenhuma corrida gravada neste aparelho. Assim que você finalizar um
        treino, ele aparece aqui com distância, tempo, pace médio e o traçado do percurso.
      </p>

      <Link
        href="/run"
        className="mx-auto mt-7 block w-full max-w-xs rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      >
        Gravar primeira corrida
      </Link>
    </Card>
  );
}

function Summary({ runs, unit }: { runs: CompletedRun[]; unit: DistanceUnit }) {
  const totalMeters = runs.reduce((sum, run) => sum + run.distanceMeters, 0);
  const totalSeconds = runs.reduce((sum, run) => sum + runMovingSeconds(run), 0);

  return (
    <Card className="pr-enter" style={delay(60)}>
      <CardTitle>Resumo do que está salvo</CardTitle>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Corridas" value={String(runs.length)} />
        <Stat label="Distância" value={formatDistance(totalMeters, unit)} unit={unitLabel(unit)} />
        <Stat label="Tempo total" value={formatElapsed(totalSeconds)} />
      </div>
      <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted">
        {runs.length < TREND_MIN_RUNS ? (
          <>
            Com {runs.length} corridas ainda não dá pra falar em tendência de pace — a partir
            de {TREND_MIN_RUNS} treinos o gráfico de evolução passa a dizer alguma coisa. Até
            lá, preferimos não desenhar uma linha que não significa nada.
          </>
        ) : (
          <>Já há corridas suficientes pra ver a evolução de pace — segue no card abaixo.</>
        )}
      </p>
    </Card>
  );
}

/**
 * Persistent "conquistas" view: current best split per standard distance
 * across the whole history, not just the run just finished — the
 * finished-run screen shows a PR *the moment it happens*, this is where it
 * lives afterward. Recomputed from `runs` (cheap enough at personal-app
 * scale) rather than stored, so it never drifts if history changes.
 *
 * Defaults to whichever unit the athlete already uses app-wide, but the
 * km/mi toggle here is its own local choice, not a rewrite of that global
 * preference — this card is the one place km and milha records used to
 * show up interleaved (1 km, 1/2 milha, 1 milha, 5 km...) in one list,
 * which read as a mistake rather than two parallel systems.
 */
function PersonalRecords({ runs, defaultUnit }: { runs: CompletedRun[]; defaultUnit: DistanceUnit }) {
  const [unit, setUnit] = useState<DistanceUnit>(defaultUnit);
  const bests = useMemo(
    () => allTimeBests(runs).filter((best) => best.unit === "both" || best.unit === unit),
    [runs, unit],
  );
  if (bests.length === 0) return null;

  return (
    <Card className="pr-enter" style={delay(65)}>
      <CardTitle
        aside={
          <div className="flex overflow-hidden rounded-full border border-border text-xs font-semibold">
            {(["km", "mi"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setUnit(option)}
                aria-pressed={unit === option}
                className={`px-3 py-1 transition-colors ${
                  unit === option ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        }
      >
        Recordes pessoais
      </CardTitle>
      <ul className="flex flex-col gap-1.5">
        {bests.map((best) => (
          <li key={best.targetMeters} className="border-t border-border first:border-t-0">
            <Link
              href={`/historico/detalhe?id=${best.runId}`}
              className="-mx-1 flex items-center justify-between gap-2 rounded-lg px-1 py-2 text-sm hover:bg-background"
            >
              <span className="text-muted">{unit === "mi" && best.milesLabel ? best.milesLabel : best.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono font-semibold tabular-nums">
                  {formatElapsed(Math.round(best.splitSeconds))}
                </span>
                <span className="text-xs text-muted">
                  {formatRunDate(new Date(best.achievedAt))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7m2 0-.7 12.4A2 2 0 0 1 14.31 21H9.69a2 2 0 0 1-1.99-1.6L7 7" />
    </svg>
  );
}

/**
 * Compact line-glyphs for the row's `tempo` / pace / tênis readouts — plain
 * `currentColor` strokes sized to sit inline with mono text, unlike
 * `StatIconBadge`'s illustrated chrome medallions (built for hero-sized
 * stat cards, not a dense list row). The word labels they replace were
 * redundant anyway: "00:39" only ever means tempo, "12:28" only ever means
 * pace.
 */
function ClockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function PaceIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 15.5a8 8 0 1 1 16 0" />
      <path d="M12 15.5 15.5 10" />
    </svg>
  );
}

function ShoeIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 16.5c0-2 1.2-3 2.3-3.9 1-.8 1.7-1.6 1.9-2.9.1-.7.7-1.2 1.4-1l1.9.5c.5.1.8.6.7 1.1-.2 1 .1 1.6.9 2.1.9.6 2.2.9 3.6.9H21v3.2c0 .9-.7 1.6-1.6 1.6H4.4A1.4 1.4 0 0 1 3 16.6v-.1Z" />
      <path d="M8 12.2c1 .6 2.3 1 3.9 1.1" />
    </svg>
  );
}

type Period = "recent3" | "all" | "7d" | "30d" | "90d";
type SortKey = "recent" | "oldest" | "longest" | "shortest" | "fastest";

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "recent3", label: "3 recentes" },
  { key: "all", label: "Tudo" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Mais recentes" },
  { key: "oldest", label: "Mais antigas" },
  { key: "longest", label: "Maior distância" },
  { key: "shortest", label: "Menor distância" },
  { key: "fastest", label: "Pace mais rápido" },
];

/** Below this many runs, a search/filter/sort bar is overhead, not help — the whole list already fits at a glance. */
const SEARCH_TOOL_MIN_RUNS = 4;

function matchesQuery(run: CompletedRun, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const dateText = formatRunDate(new Date(run.startedAt)).toLowerCase();
  const shoeText = (run.shoeName ?? "").toLowerCase();
  const placeText = (resolvePlaceLabel(run) ?? "").toLowerCase();
  return dateText.includes(q) || shoeText.includes(q) || placeText.includes(q);
}

/** "3 recentes" caps the result count rather than a date boundary — handled separately in `visibleRuns`, so this treats it like "all" here. */
function withinPeriod(run: CompletedRun, period: Period): boolean {
  if (period === "recent3" || period === "all") return true;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return run.startedAt >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function sortRuns(runs: CompletedRun[], sort: SortKey): CompletedRun[] {
  const withPace = (run: CompletedRun) => runMovingSeconds(run) / Math.max(run.distanceMeters, 1);
  return [...runs].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return a.startedAt - b.startedAt;
      case "longest":
        return b.distanceMeters - a.distanceMeters;
      case "shortest":
        return a.distanceMeters - b.distanceMeters;
      case "fastest":
        return withPace(a) - withPace(b);
      case "recent":
      default:
        return b.startedAt - a.startedAt;
    }
  });
}

/**
 * A `<select>` hands the picker to the OS — on the phone this app is
 * actually tested on, that's the grey-list-with-radio-circles seen in
 * screenshots, nothing like the rest of the UI. This is the same bottom-sheet
 * shell `RatePlaceModal` uses (`ModalPortal` + rounded-t-3xl surface),
 * carrying the sort options as rows instead.
 */
function SortSheet({
  sort,
  onSortChange,
  onClose,
}: {
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background px-6 pt-6 pb-8 text-foreground sm:rounded-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ordenar por</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <ul className="mt-4 flex flex-col gap-2.5">
            {SORT_OPTIONS.map((option) => {
              const selected = option.key === sort;
              return (
                <li key={option.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onSortChange(option.key);
                      onClose();
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      selected
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-foreground hover:border-accent"
                    }`}
                  >
                    {option.label}
                    {selected && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ModalPortal>
  );
}

function HistorySearchBar({
  query,
  onQueryChange,
  period,
  onPeriodChange,
  sort,
  onSortChange,
  suggestions,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  period: Period;
  onPeriodChange: (value: Period) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  /** Up to a handful of recent dates + shoe names, offered as tap-to-fill chips while the search field is focused. */
  suggestions: string[];
}) {
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortLabel = SORT_OPTIONS.find((option) => option.key === sort)?.label ?? SORT_OPTIONS[0].label;

  // A 150ms delay before actually clearing focus state — long enough that a
  // suggestion chip's own `onMouseDown` (fired before this blur) still sees
  // the chip row mounted, short enough nobody notices the field staying
  // "focused" a beat after really leaving it.
  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => setFocused(false), 150);
  };
  const pickSuggestion = (value: string) => {
    clearTimeout(blurTimerRef.current ?? undefined);
    onQueryChange(value);
    setFocused(false);
  };

  return (
    <div className="pr-enter flex flex-col gap-3" style={delay(85)}>
      <div>
        <div
          className={`flex items-center gap-2.5 border bg-surface px-4 py-3 transition-[border-radius,border-color,box-shadow] duration-[0.45s] ${
            focused ? "rounded-2xl border-accent shadow-[0_0_0_4px_rgba(74,120,224,0.16)]" : "rounded-full border-border"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 transition-transform duration-300 ${focused ? "scale-110 text-accent" : "text-muted"}`}
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => {
              clearTimeout(blurTimerRef.current ?? undefined);
              setFocused(true);
            }}
            onBlur={handleBlur}
            placeholder="Buscar por data, tênis ou lugar…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Limpar busca"
              className="pr-enter flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-muted"
              style={delay(0, { "--pr-dur": "0.2s" } as CSSProperties)}
            >
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>

        {focused && suggestions.length > 0 && (
          <div className="pr-enter mt-2.5 flex flex-wrap gap-1.5" style={delay(0, { "--pr-dur": "0.3s" } as CSSProperties)}>
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickSuggestion(sug);
                }}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-muted"
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onPeriodChange(option.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                period === option.key
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-muted hover:border-accent hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSortSheetOpen(true)}
          aria-haspopup="dialog"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
        >
          {sortLabel}
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 shrink-0 text-muted"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {sortSheetOpen && (
        <SortSheet sort={sort} onSortChange={onSortChange} onClose={() => setSortSheetOpen(false)} />
      )}
    </div>
  );
}

/**
 * Quick peek at one run's route without leaving the list — the thumbnail's
 * own tap target (see `RunRow`), separate from the rest of the card, which
 * still opens the full `/historico/detalhe` page. That page (splits,
 * achievements, comments, share) isn't part of this redesign pass — this
 * modal is a shallow preview layered on top of it, not a replacement.
 */
function FocalRunModal({ run, unit, onClose }: { run: CompletedRun; unit: DistanceUnit; onClose: () => void }) {
  const seconds = runMovingSeconds(run);
  const started = new Date(run.startedAt);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        onClick={onClose}
      >
        <div
          className="pr-enter w-full max-w-sm rounded-3xl border border-border bg-surface p-5"
          style={delay(0, { "--pr-dur": "0.25s" } as CSSProperties)}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {formatRunDate(started)} · {timeFormatter.format(started)}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-3.5 h-40 overflow-hidden rounded-2xl border border-border bg-background">
            <RouteThumb points={run.points} className="h-full w-full" />
          </div>

          <div className="mt-4 flex justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-[0.06em] text-muted uppercase">Distância</p>
              <p className="mt-0.5 text-base font-extrabold">
                {formatDistance(run.distanceMeters, unit)} {unitLabel(unit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.06em] text-muted uppercase">Duração</p>
              <p className="mt-0.5 text-base font-extrabold">{formatElapsed(seconds)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.06em] text-muted uppercase">Ritmo</p>
              <p className="mt-0.5 text-base font-extrabold">{formatAveragePace(run.distanceMeters, seconds, unit)}</p>
            </div>
          </div>

          <Link
            href={`/historico/detalhe?id=${run.id}`}
            className="mt-5 block w-full rounded-full bg-accent py-3 text-center text-sm font-semibold text-accent-foreground"
          >
            Ver detalhes completos
          </Link>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Same bottom-sheet shell `SortSheet` above uses — deleting a run used to confirm inline inside the card itself; a sheet reads as more deliberate for something with no undo. */
function DeleteConfirmSheet({
  run,
  unit,
  deleting,
  onCancel,
  onConfirm,
}: {
  run: CompletedRun;
  unit: DistanceUnit;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background px-6 pt-6 pb-8 text-center sm:rounded-3xl">
          <h2 className="text-base font-semibold">Excluir esse treino?</h2>
          <p className="mt-1 text-sm text-muted">
            {formatRunDate(new Date(run.startedAt))} · {formatDistance(run.distanceMeters, unit)} {unitLabel(unit)}
          </p>
          <div className="mt-6 flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="flex-1 rounded-full border border-border py-3.5 text-sm font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 rounded-full bg-bad py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function RunRow({
  run,
  unit,
  index,
  onFocusRun,
  onRequestDelete,
}: {
  run: CompletedRun;
  unit: DistanceUnit;
  index: number;
  onFocusRun: () => void;
  onRequestDelete: () => void;
}) {
  const seconds = runMovingSeconds(run);
  const started = new Date(run.startedAt);

  return (
    <li className="pr-enter" style={delay(90 + index * 45)}>
      <article className="relative flex items-stretch overflow-hidden rounded-2xl border border-border bg-surface">
        <button
          type="button"
          onClick={onFocusRun}
          aria-label="Prévia rápida do trajeto"
          className="shrink-0 transition-transform active:scale-95"
        >
          <RouteThumb points={run.points} />
        </button>
        <Link href={`/historico/detalhe?id=${run.id}`} className="min-w-0 flex-1 py-4 pr-2 pl-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-medium">{formatRunDate(started)}</h3>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {timeFormatter.format(started)}
            </span>
          </div>
          <p className="text-metal mt-1 font-mono text-2xl tabular-nums">
            {formatDistance(run.distanceMeters, unit)}
            <span className="ml-1 text-sm text-muted">{unitLabel(unit)}</span>
          </p>
          <dl className="mt-1.5 flex gap-4 font-mono text-xs tabular-nums text-muted">
            <div className="flex items-center gap-1.5">
              <dt aria-label="tempo">
                <ClockIcon />
              </dt>
              <dd className="text-foreground">{formatElapsed(seconds)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt aria-label={paceLabel(unit)}>
                <PaceIcon />
              </dt>
              <dd className="text-foreground">
                {formatAveragePace(run.distanceMeters, seconds, unit)}
              </dd>
            </div>
          </dl>
          {run.shoeName && (
            <p className="mt-1.5 flex items-center gap-1.5 truncate font-mono text-xs text-muted">
              <span aria-label="tênis" className="shrink-0">
                <ShoeIcon />
              </span>
              <span className="text-foreground">{run.shoeName}</span>
            </p>
          )}
        </Link>

        <button
          type="button"
          onClick={onRequestDelete}
          aria-label="Excluir corrida"
          className="mt-3 mr-3 h-fit shrink-0 self-start rounded-full p-2 text-muted hover:bg-bad/10 hover:text-bad"
        >
          <TrashIcon />
        </button>
      </article>
    </li>
  );
}

export default function HistoricoPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [focalRunId, setFocalRunId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("recent3");
  const [sort, setSort] = useState<SortKey>("recent");
  const [summaryOpen, setSummaryOpen] = useState(true);
  const { account } = useAuth();

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    const deletedRun = load.status === "ready" ? load.runs.find((run) => run.id === id) : undefined;
    await deleteCompletedRun(id);
    if (account && deletedRun) void removeFinishedRun(deletedRun.distanceMeters);
    setLoad((current) =>
      current.status === "ready"
        ? { status: "ready", runs: current.runs.filter((run) => run.id !== id) }
        : current,
    );
    setConfirmingId(null);
    setDeletingId(null);
  };

  useEffect(() => {
    let cancelled = false;

    listCompletedRuns()
      .then((runs) => {
        if (cancelled) return;
        setLoad({
          status: "ready",
          runs: [...runs].sort((a, b) => b.startedAt - a.startedAt),
        });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const runs = load.status === "ready" ? load.runs : [];
  const showSearchTool = runs.length >= SEARCH_TOOL_MIN_RUNS;
  const matchedRuns = runs.filter((run) => matchesQuery(run, query) && withinPeriod(run, period));
  // "3 recentes" caps the count by actual recency first, then the chosen
  // sort re-orders just that capped set — so picking "Pace mais rápido"
  // still means "fastest of my last 3", not "fastest of everything".
  const cappedRuns =
    period === "recent3"
      ? [...matchedRuns].sort((a, b) => b.startedAt - a.startedAt).slice(0, 3)
      : matchedRuns;
  const visibleRuns = showSearchTool ? sortRuns(cappedRuns, sort) : runs;
  const focalRun = focalRunId ? runs.find((run) => run.id === focalRunId) ?? null : null;
  const confirmingRun = confirmingId ? runs.find((run) => run.id === confirmingId) ?? null : null;

  // Up to 2 recent dates + every distinct shoe name + every distinct
  // resolved place — same set the old inline suggestion row offered, just
  // read fresh from whatever's loaded.
  const suggestions = [
    ...new Set(runs.slice(0, 2).map((run) => formatRunDate(new Date(run.startedAt)))),
    ...new Set(runs.map((run) => run.shoeName).filter((name): name is string => Boolean(name))),
    ...new Set(runs.map((run) => resolvePlaceLabel(run)).filter((name): name is string => Boolean(name))),
  ].slice(0, 6);

  return (
    <>
      <ScreenHeader title="Histórico" />

      <Screen>
        {load.status === "loading" && (
          <Card className="animate-pulse">
            <div className="h-4 w-32 rounded bg-border" />
            <div className="mt-4 h-14 rounded-xl bg-border/70" />
          </Card>
        )}

        {load.status === "error" && (
          <Card>
            <CardTitle>Não deu pra ler o histórico</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              O armazenamento local do navegador não respondeu. Em janela anônima ou com
              armazenamento bloqueado, as corridas não ficam salvas.
            </p>
          </Card>
        )}

        {load.status === "ready" && runs.length === 0 && <EmptyState />}

        {load.status === "ready" && runs.length > 0 && (
          <>
            {showSearchTool && (
              <HistorySearchBar
                query={query}
                onQueryChange={setQuery}
                period={period}
                onPeriodChange={setPeriod}
                sort={sort}
                onSortChange={setSort}
                suggestions={suggestions}
              />
            )}

            {showSearchTool && visibleRuns.length === 0 ? (
              <Card className="pr-enter text-center" style={delay(95)}>
                <p className="text-sm text-muted">Nenhuma corrida bate com esse filtro.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPeriod("all");
                  }}
                  className="mt-2 text-xs font-semibold text-accent"
                >
                  Limpar filtros
                </button>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {visibleRuns.map((run, index) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    unit={unit}
                    index={index}
                    onFocusRun={() => setFocalRunId(run.id)}
                    onRequestDelete={() => setConfirmingId(run.id)}
                  />
                ))}
              </ul>
            )}

            {/*
             * Open by default (changed 2026-08-29 per direct feedback —
             * the earlier collapsed-by-default choice read as "hidden for
             * no reason" rather than as decluttering). Still collapsible,
             * not removed: someone who really only wants the run list can
             * still close it and it'll reopen next visit either way (no
             * persisted preference, same as before).
             */}
            <button
              type="button"
              onClick={() => setSummaryOpen((v) => !v)}
              className="mt-2 flex w-full items-center justify-between border-t border-border pt-5 pb-1"
            >
              <span className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Resumo e recordes</span>
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${summaryOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {summaryOpen && (
              <div className="pr-enter flex flex-col gap-5" style={delay(0, { "--pr-dur": "0.2s" } as CSSProperties)}>
                {runs.length >= 2 && <Summary runs={runs} unit={unit} />}
                <PersonalRecords runs={runs} defaultUnit={unit} />
                <RunFrequencyHeatmap runs={runs} unit={unit} />
              </div>
            )}
          </>
        )}
      </Screen>

      {focalRun && <FocalRunModal run={focalRun} unit={unit} onClose={() => setFocalRunId(null)} />}
      {confirmingRun && (
        <DeleteConfirmSheet
          run={confirmingRun}
          unit={unit}
          deleting={deletingId === confirmingRun.id}
          onCancel={() => setConfirmingId(null)}
          onConfirm={() => void handleConfirmDelete(confirmingRun.id)}
        />
      )}
    </>
  );
}
