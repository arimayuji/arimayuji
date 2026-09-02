"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  deleteCompletedRun,
  runMovingSeconds,
  type CompletedRun,
  type StoredPoint,
} from "@/lib/tracking/storage";
import { syncProfileStats } from "@/lib/profileStats";
import { deleteRunSummary } from "@/lib/runSummariesSync";
import { resolvePlaceLabel } from "@/lib/placeMatch";
import { useAuth } from "@/lib/useAuth";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { allTimeBests } from "@/lib/tracking/personalRecords";
import type { DistanceUnit } from "@/lib/preferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { Card, CardTitle, delay, EmptyState, Stat } from "../ui";
import { ModalPortal } from "../modal-portal";

/**
 * The chronological run feed — folded into /progresso on request (it used
 * to be its own bottom-nav tab, `/historico`) so "how did I do" (the charts
 * around this component) and "what did I actually run" (this) live in one
 * place instead of splitting attention across two tabs. Kept as its own
 * file rather than inlined into progresso/page.tsx, same reasoning as
 * matched-runs-card.tsx and run-frequency-heatmap.tsx living apart from it.
 */

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "ter., 11 de ago." → "Ter., 11 de ago.". Done here rather than with CSS `capitalize`, which would also upper-case the "de". */
function formatRunDate(date: Date): string {
  const text = dateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Route thumbnail drawn from the run's own recorded points — real geometry,
 * not decoration. Longitude is scaled by cos(latitude) so the shape isn't
 * stretched sideways, and the path is fitted to the box with a small margin.
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
export function PersonalRecords({
  runs,
  defaultUnit,
  delayMs = 65,
}: {
  runs: CompletedRun[];
  defaultUnit: DistanceUnit;
  delayMs?: number;
}) {
  const [unit, setUnit] = useState<DistanceUnit>(defaultUnit);
  const bests = allTimeBests(runs).filter((best) => best.unit === "both" || best.unit === unit);
  if (bests.length === 0) return null;

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(delayMs)}
    >
      <CardTitle
        aside={
          <div className="flex overflow-hidden rounded-full border border-border text-xs font-semibold">
            {(["km", "mi"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setUnit(option)}
                aria-pressed={unit === option}
                className={`pr-press px-3 py-1 active:scale-95 ${
                  unit === option
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "text-muted hover:text-foreground"
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
              className="pr-press -mx-1 flex items-center justify-between gap-2 rounded-lg px-1 py-2 text-sm hover:bg-background active:scale-[0.98]"
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

/** "3 recentes" caps the result count rather than a date boundary — handled separately by the caller, so this treats it like "all" here. */
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
            <h2 className="text-lg font-semibold lg:tracking-[-0.01em]">Ordenar por</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="pr-press flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted hover:text-foreground active:scale-95"
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
                    className={`pr-press flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium active:scale-[0.98] ${
                      selected
                        ? "border-accent bg-accent/10 text-accent hover:bg-accent/15"
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

function ActivitySearchBar({
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
    <div className="pr-enter flex flex-col gap-3">
      <div>
        <div
          className={`flex items-center gap-2.5 border bg-surface px-4 py-3 transition-[border-radius,border-color,box-shadow] duration-300 [transition-timing-function:var(--ease-spring)] ${
            focused ? "rounded-2xl border-accent shadow-[0_0_0_4px_rgba(74,120,224,0.16)]" : "rounded-full border-border"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 transition-transform duration-300 [transition-timing-function:var(--ease-spring)] ${focused ? "scale-110 text-accent" : "text-muted"}`}
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
              className="pr-enter pr-press flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-muted hover:text-foreground active:scale-95"
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
                className="pr-press rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-muted hover:border-accent hover:text-foreground active:scale-95"
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
              className={`pr-press shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap active:scale-95 ${
                period === option.key
                  ? "border-accent bg-accent text-accent-foreground hover:bg-accent/90"
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
          className="pr-press flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent active:scale-95"
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
 * Quick peek at one run's route without leaving the feed — the thumbnail's
 * own tap target (see `RunRow`), separate from the rest of the row, which
 * still opens the full `/historico/detalhe` page (splits, achievements,
 * comments, share — untouched by this move, still its own route).
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
              className="pr-press flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted hover:border-accent hover:text-foreground active:scale-95"
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
            className="pr-press mt-5 block w-full rounded-full bg-accent py-3 text-center text-sm font-semibold text-accent-foreground hover:bg-accent/90 active:scale-[0.98]"
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
              className="pr-press flex-1 rounded-full border border-border py-3.5 text-sm font-semibold hover:border-accent active:scale-[0.98] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="pr-press flex-1 rounded-full bg-bad py-3.5 text-sm font-semibold text-white hover:bg-bad/90 active:scale-[0.98] disabled:opacity-50"
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
    <li
      className="pr-enter lg:border-t lg:border-border lg:pt-3 first:lg:border-t-0"
      style={delay(index * 45)}
    >
      <article className="relative flex items-stretch overflow-hidden rounded-2xl border border-border bg-surface lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
        <button
          type="button"
          onClick={onFocusRun}
          aria-label="Prévia rápida do trajeto"
          className="pr-press shrink-0 hover:opacity-90 active:scale-95"
        >
          <RouteThumb points={run.points} />
        </button>
        <Link
          href={`/historico/detalhe?id=${run.id}`}
          className="pr-press min-w-0 flex-1 py-4 pr-2 pl-4 hover:bg-background active:scale-[0.98]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-medium">{formatRunDate(started)}</h3>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {timeFormatter.format(started)}
            </span>
          </div>
          <p className="text-metal mt-1 font-mono text-2xl tabular-nums lg:tracking-[-0.02em]">
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
          className="pr-press mt-3 mr-3 h-fit shrink-0 self-start rounded-full bg-bad p-2 text-white hover:bg-bad/90 active:scale-95"
        >
          <TrashIcon />
        </button>
      </article>
    </li>
  );
}

/**
 * The feed itself — search/filter/sort over a plain vertical list, one row
 * per run, same shape Strava's own activity feed uses. Kept as a simple
 * scrolling list rather than a horizontal carousel on purpose: each row
 * already carries route/date/distance/tempo/pace/tênis, more than a narrow
 * horizontal card could show without truncating most of it away.
 */
export function ActivityFeed({
  runs,
  unit,
  onRunDeleted,
}: {
  runs: CompletedRun[];
  unit: DistanceUnit;
  onRunDeleted: (id: string) => void;
}) {
  const { account, profile } = useAuth();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [focalRunId, setFocalRunId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("recent3");
  const [sort, setSort] = useState<SortKey>("recent");

  const sortedRuns = [...runs].sort((a, b) => b.startedAt - a.startedAt);
  const showSearchTool = sortedRuns.length >= SEARCH_TOOL_MIN_RUNS;
  const matchedRuns = sortedRuns.filter((run) => matchesQuery(run, query) && withinPeriod(run, period));
  // "3 recentes" caps the count by actual recency first, then the chosen
  // sort re-orders just that capped set — so picking "Pace mais rápido"
  // still means "fastest of my last 3", not "fastest of everything".
  const cappedRuns =
    period === "recent3"
      ? [...matchedRuns].sort((a, b) => b.startedAt - a.startedAt).slice(0, 3)
      : matchedRuns;
  const visibleRuns = showSearchTool ? sortRuns(cappedRuns, sort) : sortedRuns;
  const focalRun = focalRunId ? sortedRuns.find((run) => run.id === focalRunId) ?? null : null;
  const confirmingRun = confirmingId ? sortedRuns.find((run) => run.id === confirmingId) ?? null : null;

  // Up to 2 recent dates + every distinct shoe name + every distinct
  // resolved place — same set the old inline suggestion row offered, just
  // read fresh from whatever's loaded.
  const suggestions = [
    ...new Set(sortedRuns.slice(0, 2).map((run) => formatRunDate(new Date(run.startedAt)))),
    ...new Set(sortedRuns.map((run) => run.shoeName).filter((name): name is string => Boolean(name))),
    ...new Set(sortedRuns.map((run) => resolvePlaceLabel(run)).filter((name): name is string => Boolean(name))),
  ].slice(0, 6);

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    await deleteCompletedRun(id);
    if (account) void syncProfileStats();
    if (profile?.runSyncOptIn) void deleteRunSummary(id);
    onRunDeleted(id);
    setConfirmingId(null);
    setDeletingId(null);
  };

  return (
    <>
      {showSearchTool && (
        <ActivitySearchBar
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
        <EmptyState
          className="pr-enter"
          title="Nenhuma corrida bate com esse filtro"
          action={
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPeriod("all");
              }}
              className="pr-press text-sm font-semibold text-accent hover:text-accent/80 active:scale-95"
            >
              Limpar filtros
            </button>
          }
        />
      ) : (
        <ul className={`flex flex-col gap-3.5 ${showSearchTool ? "mt-4" : ""}`}>
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

/**
 * `ActivityFeed` wrapped in a compact all-time total up top (the one number
 * none of /perfil's other Progresso cards show, since they're all per-week/
 * per-month/per-day) — shared by /perfil's Progresso tab and the standalone
 * /historico route (bottom-nav tab of its own again), so the two never
 * drift into two slightly different feeds.
 */
export function ActivityCard({
  runs,
  unit,
  onRunDeleted,
  delayMs,
  bare = false,
}: {
  runs: CompletedRun[];
  unit: DistanceUnit;
  onRunDeleted: (id: string) => void;
  delayMs: number;
  /** Skips the `Card` chrome (border, surface fill, rounded corners) — for
   * /historico, where this is the *entire* page, not one card among several
   * the way it sits inside /perfil's Progresso tab. A single bordered box
   * floating with margin on an otherwise blank page reads as an unstyled
   * placeholder, not a widget ("não faz sentido essa borda... contrastando
   * com branco", 2026-09-02) — the fix is to let the content sit directly
   * on the page the way the Feed's own posts do, not to theme the border. */
  bare?: boolean;
}) {
  const totalMeters = runs.reduce((sum, run) => sum + run.distanceMeters, 0);
  const totalSeconds = runs.reduce((sum, run) => sum + runMovingSeconds(run), 0);
  const Wrapper = bare ? "div" : Card;

  return (
    <Wrapper
      className={`pr-enter ${bare ? "" : "lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"}`}
      style={delay(delayMs)}
    >
      <CardTitle>Corridas</CardTitle>
      <div className="mb-4 grid grid-cols-3 gap-3 border-b border-border pb-4">
        <Stat label="Total" value={formatDistance(totalMeters, unit)} unit={unitLabel(unit)} />
        <Stat label="Corridas" value={String(runs.length)} />
        <Stat label="Tempo total" value={formatElapsed(totalSeconds)} />
      </div>
      <ActivityFeed runs={runs} unit={unit} onRunDeleted={onRunDeleted} />
    </Wrapper>
  );
}
