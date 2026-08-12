"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calendar picker for the race-goal date.
 *
 * Written by hand instead of pulled from a UI kit: the app ships with no UI
 * dependency at all, and a date grid is a couple of `Date` calls plus a
 * seven-column layout. It replaces `<input type="date">`, whose native popup
 * looks like a different app on every platform and can't say "past dates are
 * not a race date".
 */

const PANEL_MIN_WIDTH = 288;
const PANEL_HEIGHT = 392;
const VIEWPORT_MARGIN = 8;

/**
 * The tab bar is fixed over the bottom of every app screen, so the space that
 * is actually free below the field ends above it, not at the viewport edge.
 */
const TAB_BAR_HEIGHT = 80;

/** Monday-first, same week shape the plan and history screens use. */
const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"];
const WEEKDAY_NAMES = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const GRID_DAYS = 42;

const triggerFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthNameFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long" });

const fullDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Built from the parts rather than `new Date(iso)`, which parses a bare
 * `yyyy-mm-dd` as UTC midnight and lands on the previous day west of Greenwich.
 */
function fromIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"} />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3.5" width="12" height="11" rx="2" />
      <path d="M2 6.75h12M5.5 1.75v3M10.5 1.75v3" />
    </svg>
  );
}

export function GoalDatePicker({
  value,
  onChange,
}: {
  /** ISO date (yyyy-mm-dd), or undefined when nothing was picked yet. */
  value?: string;
  onChange: (iso: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [browsed, setBrowsed] = useState<{ year: number; month: number } | null>(null);
  const [panel, setPanel] = useState({ left: 0, width: PANEL_MIN_WIDTH, above: false });

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const today = startOfToday();
  const selected = value ? fromIsoDate(value) : null;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }

    /*
     * Measured on the way open so the panel can be pushed back inside the
     * viewport: anchored flush to a trigger that sits near the right edge it
     * would hang off screen, which on a phone scrolls the whole page sideways.
     */
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(
        Math.max(rect.width, PANEL_MIN_WIDTH),
        window.innerWidth - VIEWPORT_MARGIN * 2,
      );
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - width);
      const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), maxLeft);
      const roomBelow = window.innerHeight - TAB_BAR_HEIGHT - rect.bottom;
      const roomAbove = rect.top;
      const needed = PANEL_HEIGHT + VIEWPORT_MARGIN;
      setPanel({
        left: left - rect.left,
        width,
        above: roomBelow < needed && roomAbove >= needed,
      });
    }

    const anchor = selected && selected >= today ? selected : today;
    setBrowsed({ year: anchor.getFullYear(), month: anchor.getMonth() });
    setOpen(true);
  };

  const view = browsed ?? { year: today.getFullYear(), month: today.getMonth() };
  const firstOfMonth = new Date(view.year, view.month, 1);
  const leadingDays = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(view.year, view.month, 1 - leadingDays);

  const days = Array.from({ length: GRID_DAYS }, (_, i) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return {
      date,
      outside: date.getMonth() !== view.month,
      past: date < today,
      isToday: sameDay(date, today),
      isSelected: selected !== null && sameDay(date, selected),
    };
  });

  const atCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();

  const stepMonth = (delta: number) => {
    const stepped = new Date(view.year, view.month + delta, 1);
    setBrowsed({ year: stepped.getFullYear(), month: stepped.getMonth() });
  };

  const pick = (date: Date) => {
    onChange(toIsoDate(date));
    close();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl border bg-background px-3 py-3 text-left font-mono text-sm tabular-nums outline-none ${
          open ? "border-accent" : "border-border focus-visible:border-accent"
        }`}
      >
        <CalendarIcon />
        {selected ? (
          <span>{triggerFormatter.format(selected)}</span>
        ) : (
          <span className="text-muted">Escolher data</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Escolher a data da prova"
          style={{ width: panel.width, marginLeft: panel.left }}
          className={`absolute left-0 z-20 rounded-2xl border border-border bg-surface p-3 shadow-lg ${
            panel.above ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              disabled={atCurrentMonth}
              aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground outline-none enabled:hover:border-accent focus-visible:border-accent disabled:opacity-35"
            >
              <ChevronIcon direction="left" />
            </button>
            <span aria-live="polite" className="font-mono text-sm font-medium">
              {capitalize(monthNameFormatter.format(firstOfMonth))} {view.year}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground outline-none hover:border-accent focus-visible:border-accent"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div
            className="mt-3 grid grid-cols-7 gap-1 font-mono text-[10px] uppercase tracking-wide text-muted"
            aria-hidden="true"
          >
            {WEEKDAY_INITIALS.map((initial, i) => (
              <span key={i} className="flex h-6 items-center justify-center">
                {initial}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const label = capitalize(fullDateFormatter.format(day.date));

              if (day.past) {
                return (
                  <span
                    key={day.date.getTime()}
                    aria-disabled="true"
                    aria-label={`${label} — data já passou`}
                    className="flex h-9 items-center justify-center rounded-lg font-mono text-sm tabular-nums text-muted/35"
                  >
                    {day.date.getDate()}
                  </span>
                );
              }

              return (
                <button
                  key={day.date.getTime()}
                  type="button"
                  onClick={() => pick(day.date)}
                  aria-label={label}
                  aria-pressed={day.isSelected}
                  className={`flex h-9 items-center justify-center rounded-lg border font-mono text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                    day.isSelected
                      ? "border-accent bg-accent text-accent-foreground"
                      : `border-transparent hover:border-accent ${
                          day.isToday ? "ring-1 ring-accent/60" : ""
                        } ${day.outside ? "text-muted" : "text-foreground"}`
                  }`}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted">
            {selected ? (
              <>
                {capitalize(WEEKDAY_NAMES[(selected.getDay() + 6) % 7])},{" "}
                {triggerFormatter.format(selected)}.{" "}
                <button
                  type="button"
                  onClick={() => {
                    onChange(undefined);
                    close();
                  }}
                  className="text-accent underline underline-offset-2"
                >
                  Limpar
                </button>
              </>
            ) : (
              "Só datas de hoje em diante — a prova ainda vai acontecer."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
