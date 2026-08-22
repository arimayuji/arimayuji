"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { estimateCalories } from "@/lib/calories";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { computeElevationProfile, elevationGainFromProfile, type ElevationSample } from "@/lib/elevation";
import { fetchRecoveryContext, fetchRunHealthData, HEALTH_DATA_ENABLED, type RecoveryContext, type RunHealthData } from "@/lib/health";
import { removeFinishedRun } from "@/lib/profileStats";
import { listRunComments, type RunComment } from "@/lib/runComments";
import { getSyncedRun, shareRunWithCoaches } from "@/lib/runsSync";
import { useAuth } from "@/lib/useAuth";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
import { computeSplits, type Split } from "@/lib/tracking/splits";
import {
  computeVdot,
  paceZonesFromVdot,
  timeInZones,
  ZONE_NUMBER,
  ZONE_ORDER,
  type PaceZoneName,
} from "@/lib/plan";
import {
  deleteCompletedRun,
  getCompletedRun,
  listCompletedRuns,
  markRecordOpened,
  runMovingSeconds,
  updateRunElevationGain,
  type CompletedRun,
  type StoredPoint,
} from "@/lib/tracking/storage";
import { usePreferences } from "@/lib/usePreferences";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import { formatAveragePace, formatDistance, metersPerUnit, paceLabel, unitLabel } from "@/lib/units";
import { useHeaderClose } from "../../app-shell";
import { AchievementReveal } from "../../achievement-reveal";
import { PrBadge } from "../../pr-badge";
import { RouteReplay } from "../../route-replay";
import { StatIconBadge, type StatIconKey } from "../../stat-icon-badge";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function formatRunDate(date: Date): string {
  const text = dateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; run: CompletedRun; records: RunRecord[] };

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
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

function HeartbeatIcon({ className }: { className?: string }) {
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
      <path d="M3 12h3.5l1.8-4.5L11 17l2.5-9 1.8 4.5H21" />
    </svg>
  );
}

/** Same accent-tinted-circle-with-plain-stroke treatment `HeartbeatIcon` documents above — no commissioned art for any of these three either. */
function HrvIcon({ className }: { className?: string }) {
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
      <path d="M2 12h4l1.5-3 2 6 2-9 2 6h2.5l1.5-3h4" />
    </svg>
  );
}

function SleepIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

function Vo2MaxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 9 9l3 5 3-9 5 15" />
    </svg>
  );
}

/**
 * One tile in the secondary-stats grid below the headline distance/tempo/pace
 * row — same horse-badge language as the live-run cards, segmented into
 * quadrants instead of a wrapped label:value line. `icon` takes either a
 * real commissioned badge key (the common case) or a plain node for a stat
 * that doesn't have art commissioned yet (frequência cardíaca, still behind
 * `HEALTH_DATA_ENABLED` in health.ts — no R2 asset exists for it, so this
 * draws a plain stroked icon in the same accent-tinted circle instead of a
 * broken image once that flag eventually flips on).
 */
function StatQuadrant({
  icon,
  label,
  value,
  unit,
  flame = false,
}: {
  icon: StatIconKey | ReactElement;
  label: string;
  value: string | number;
  unit?: string;
  /** Calorias only, so far — a number spent as heat gets to look like it, instead of the same chrome every other stat wears. */
  flame?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
        {typeof icon === "string" ? (
          <StatIconBadge icon={icon} className="block h-7 w-7" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
            {icon}
          </span>
        )}
      </div>
      <p
        className={`${flame ? "text-flame" : "text-metal"} mt-1.5 truncate font-mono text-lg tabular-nums`}
      >
        {value}
        {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
      </p>
    </div>
  );
}

/**
 * How a metric actually rose and fell across one split, not just its single
 * average — `min`/`max` come from the *whole run*, not this row alone, so a
 * uniformly high row sits visibly higher than a uniformly low one instead of
 * every row re-normalizing to its own range and looking equally "full".
 * Shared between the pace curve (`paceCurveSecPerKm` in splits.ts) and the
 * elevation profile below — same shape (an array of samples plus a shared
 * range), just a different source and a different "higher is better" story
 * (faster for pace, doesn't matter for elevation, the caller decides).
 */
function Sparkline({ curve, min, max }: { curve: number[]; min: number; max: number }) {
  if (curve.length === 0) return <div className="h-6 flex-1 rounded-full bg-background" />;

  const span = max - min;
  const points = curve.map((value, i) => {
    const x = curve.length > 1 ? (i / (curve.length - 1)) * 100 : 50;
    const y = span > 0 ? 22 - ((value - min) / span) * 20 : 12;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},24 L${points[0][0].toFixed(1)},24 Z`;

  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 flex-1" aria-hidden="true">
      <path d={area} fill="currentColor" opacity="0.16" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Real DEM elevation at an arbitrary cumulative distance, linearly interpolated between the two straddling profile samples — clamped to the profile's own range rather than extrapolated past either end, same rule splits.ts's own `timeAtDistance` follows. */
function elevationAt(profile: ElevationSample[], distanceMeters: number): number {
  const clamped = Math.max(profile[0].distanceMeters, Math.min(profile[profile.length - 1].distanceMeters, distanceMeters));
  let i = 1;
  while (i < profile.length - 1 && profile[i].distanceMeters < clamped) i++;
  const a = profile[i - 1];
  const b = profile[i];
  const span = b.distanceMeters - a.distanceMeters;
  const frac = span > 0 ? (clamped - a.distanceMeters) / span : 0;
  return a.elevationMeters + frac * (b.elevationMeters - a.elevationMeters);
}

/** Elevation sampled at `SPARKLINE_SAMPLES` evenly spaced points across one split's own distance range — the elevation-profile counterpart of splits.ts's `paceCurveSecPerKm`, just a direct interpolation rather than a windowed derivative (elevation doesn't need smoothing the way point-to-point GPS pace does). */
function elevationCurveForSplit(profile: ElevationSample[], splitStart: number, splitEnd: number): number[] {
  if (profile.length < 2) return [];
  const span = splitEnd - splitStart;
  return Array.from({ length: SPARKLINE_SAMPLES }, (_, s) =>
    elevationAt(profile, splitStart + (span * (s + 0.5)) / SPARKLINE_SAMPLES),
  );
}

type SplitsMetric = "pace" | "elevacao";

/** Matches splits.ts's own `PACE_CURVE_SAMPLES` — both curve types render at the same resolution so toggling between them doesn't visibly change how "smooth" a row looks. */
const SPARKLINE_SAMPLES = 12;

function SplitsTable({
  splits,
  unit,
  points,
}: {
  splits: Split[];
  unit: "km" | "mi";
  points: Pick<StoredPoint, "lat" | "lon">[];
}) {
  const [metric, setMetric] = useState<SplitsMetric>("pace");
  const [elevationProfile, setElevationProfile] = useState<ElevationSample[] | null>(null);
  const [elevationUnavailable, setElevationUnavailable] = useState(false);
  // A ref, not state — this only exists to stop a second fetch from firing
  // while the first is still in flight; it has nothing to render, so
  // updating it doesn't belong in React's render/setState cycle at all.
  const elevationFetchStarted = useRef(false);

  // Fetched on demand, the first time the athlete actually asks for the
  // elevation view — not on every visit to this screen, since most visits
  // never touch this toggle and MapTiler's elevation lookup is a real
  // network call (the run's own total elevation gain, shown above, has its
  // own separate lazy-once fetch for the same reason).
  useEffect(() => {
    if (metric !== "elevacao" || elevationFetchStarted.current) return;
    elevationFetchStarted.current = true;
    let cancelled = false;
    computeElevationProfile(points).then((profile) => {
      if (cancelled) return;
      if (profile) setElevationProfile(profile);
      else setElevationUnavailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [metric, points]);

  const elevationLoading = metric === "elevacao" && !elevationProfile && !elevationUnavailable;

  if (splits.length === 0) return null;

  // paceCurveSecPerKm is always metric (seconds per km) regardless of display
  // unit — scale it the same way the split's own average pace already is.
  const toDisplayPace = (secPerKm: number) => secPerKm * (metersPerUnit(unit) / 1000);
  const paces = splits.map((s) => s.durationSeconds / (s.distanceMeters / metersPerUnit(unit)));
  const paceCurves = splits.map((s) => s.paceCurveSecPerKm.map(toDisplayPace).filter((v) => Number.isFinite(v)));
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const allPaceValues = paceCurves.flat();
  const paceCurveMin = allPaceValues.length > 0 ? Math.min(...allPaceValues, fastest) : fastest;
  const paceCurveMax = allPaceValues.length > 0 ? Math.max(...allPaceValues, slowest) : slowest;

  // Cumulative [start, end) distance each split spans — splits.ts only
  // hands back each split's own span, not a running total, since most
  // callers (the pace curve included) never need one. `splits` never runs
  // past a few dozen rows even for an ultra, so the O(n²) re-sum per row
  // costs nothing real and keeps this a plain derived value rather than
  // reaching for a mutable accumulator.
  const splitRanges = splits.map((s, i) => {
    const start = splits.slice(0, i).reduce((sum, prior) => sum + prior.distanceMeters, 0);
    return [start, start + s.distanceMeters] as const;
  });

  const elevationCurves = elevationProfile
    ? splitRanges.map(([start, end]) => elevationCurveForSplit(elevationProfile, start, end))
    : [];
  const allElevationValues = elevationCurves.flat();
  const elevationMin = allElevationValues.length > 0 ? Math.min(...allElevationValues) : 0;
  const elevationMax = allElevationValues.length > 0 ? Math.max(...allElevationValues) : 0;

  const showElevation = metric === "elevacao" && elevationProfile;

  return (
    <Card className="pr-enter" style={delay(140)}>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Parciais por {unitLabel(unit)}</CardTitle>
        <div className="flex shrink-0 rounded-full border border-border p-0.5 font-mono text-[11px]">
          {(["pace", "elevacao"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMetric(option)}
              className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                metric === option ? "bg-accent text-accent-foreground" : "text-muted"
              }`}
            >
              {option === "pace" ? "Pace" : "Elevação"}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2.5 mt-1 text-[11px] leading-relaxed text-muted">
        {metric === "pace"
          ? `Evolução do pace dentro de cada ${unitLabel(unit)}, não só a média.`
          : "Perfil real do terreno dentro de cada trecho, via elevação do MapTiler."}
      </p>

      {elevationLoading && <p className="py-3 text-center text-xs text-muted">Calculando elevação…</p>}
      {metric === "elevacao" && elevationUnavailable && (
        <p className="py-3 text-center text-xs text-muted">Elevação indisponível pra essa corrida.</p>
      )}

      {(metric === "pace" || showElevation) && (
        <ul className="flex flex-col gap-3">
          {splits.map((split, i) => {
            const pace = paces[i];
            const isFastest = metric === "pace" && pace === fastest && fastest !== slowest;
            const [start, end] = splitRanges[i];
            const elevationDelta =
              showElevation && elevationProfile
                ? Math.round(elevationAt(elevationProfile, end) - elevationAt(elevationProfile, start))
                : null;
            return (
              <li key={split.index} className="flex items-center gap-3 text-sm">
                <span className="w-5 shrink-0 font-mono text-xs text-muted">{split.index}</span>
                <div
                  className={isFastest ? "flex flex-1 items-center text-good" : "flex flex-1 items-center text-accent"}
                >
                  <Sparkline
                    curve={metric === "pace" ? paceCurves[i] : elevationCurves[i]}
                    min={metric === "pace" ? paceCurveMin : elevationMin}
                    max={metric === "pace" ? paceCurveMax : elevationMax}
                  />
                </div>
                <span
                  className={`w-14 shrink-0 text-right font-mono text-xs tabular-nums ${isFastest ? "font-semibold text-good" : "text-foreground"}`}
                >
                  {metric === "pace"
                    ? formatAveragePace(split.distanceMeters, split.durationSeconds, unit)
                    : elevationDelta === null
                      ? "—"
                      : `${elevationDelta > 0 ? "+" : ""}${elevationDelta} m`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const ZONE_LABEL: Record<PaceZoneName, string> = {
  easy: "Fácil",
  marathon: "Maratona",
  threshold: "Limiar",
  interval: "Intervalado",
  repetition: "Repetição",
};

/** Green-to-red intensity ramp using the app's existing semantic colors — no new palette, just Z1 calm through Z5 hardest. */
const ZONE_BAR_COLOR: Record<PaceZoneName, string> = {
  easy: "bg-good/60",
  marathon: "bg-good",
  threshold: "bg-accent",
  interval: "bg-warn",
  repetition: "bg-bad",
};

/**
 * Time spent in each pace zone, one km split at a time — always computed on
 * real kilometers regardless of the athlete's display unit preference,
 * since the zone paces themselves (`PaceZones`) are defined in seconds per
 * km. Null when there's no recent-race time on file to derive zones from
 * (`/perfil`), or the run's too short for even one full split.
 */
function ZonesCard({ points }: { points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[] }) {
  const [runnerProfile] = useRunnerProfile();
  if (!runnerProfile.recentRaceDistanceMeters || !runnerProfile.recentRaceTimeSeconds) return null;

  const kmSplits = computeSplits(points, 1000);
  if (kmSplits.length === 0) return null;

  const zones = paceZonesFromVdot(
    computeVdot(runnerProfile.recentRaceDistanceMeters, runnerProfile.recentRaceTimeSeconds),
  );
  const seconds = timeInZones(kmSplits, zones);
  const totalSeconds = ZONE_ORDER.reduce((sum, zone) => sum + seconds[zone], 0);
  if (totalSeconds <= 0) return null;

  return (
    <Card className="pr-enter" style={delay(150)}>
      <CardTitle>Tempo por zona</CardTitle>
      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-background">
        {ZONE_ORDER.map((zone) =>
          seconds[zone] > 0 ? (
            <div
              key={zone}
              className={ZONE_BAR_COLOR[zone]}
              style={{ width: `${(seconds[zone] / totalSeconds) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {ZONE_ORDER.filter((zone) => seconds[zone] > 0).map((zone) => (
          <li key={zone} className="flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ZONE_BAR_COLOR[zone]}`} />
            <span className="flex-1 text-foreground">
              Z{ZONE_NUMBER[zone]} · {ZONE_LABEL[zone]}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {formatElapsed(seconds[zone])}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Read-only comments a coach left on this run — only shows up once this run
 * has actually been shared (a `SyncedRun` row exists for it); a run kept
 * entirely local was never visible to any coach in the first place, so
 * there's nothing to look up.
 */
function CommentsCard({ startedAtMs }: { startedAtMs: number }) {
  const [comments, setComments] = useState<RunComment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSyncedRun(startedAtMs).then((synced) => {
      if (cancelled) return;
      if (!synced) {
        setComments([]);
        return;
      }
      listRunComments([synced.$id]).then((byRun) => {
        if (!cancelled) setComments(byRun.get(synced.$id) ?? []);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [startedAtMs]);

  if (!comments || comments.length === 0) return null;

  return (
    <Card className="pr-enter" style={delay(160)}>
      <CardTitle>Comentários do treinador</CardTitle>
      <ul className="flex flex-col gap-2">
        {comments.map((comment) => (
          <li key={comment.$id} className="rounded-lg bg-background px-3 py-2 text-sm leading-relaxed text-pretty">
            {comment.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RunDetail({ id }: { id: string }) {
  useHeaderClose("/historico");
  const router = useRouter();
  const { account } = useAuth();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();
  const [runnerProfile] = useRunnerProfile();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [computedElevationGain, setComputedElevationGain] = useState<number | null>(null);
  const [elevationUnavailable, setElevationUnavailable] = useState(false);
  const [elevationRetryToken, setElevationRetryToken] = useState(0);
  const [healthData, setHealthData] = useState<RunHealthData | null>(null);
  const [recoveryContext, setRecoveryContext] = useState<RecoveryContext | null>(null);
  const [openedMeters, setOpenedMeters] = useState<number[]>([]);
  const [revealing, setRevealing] = useState<{ record: RunRecord; wasOpened: boolean } | null>(null);
  const [coaches, setCoaches] = useState<CoachConnection[] | null>(null);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    listCoachConnections("accepted").then((rows) => setCoaches(rows.filter((c) => c.myRole === "student")));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCompletedRun(id), listCompletedRuns()]).then(([run, allRuns]) => {
      if (cancelled) return;
      if (!run) {
        setLoad({ status: "not-found" });
        return;
      }
      setOpenedMeters(run.openedRecordMeters ?? []);
      setLoad({ status: "ready", run, records: computeRunRecords(run, allRuns) });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (load.status !== "ready" || load.run.elevationGainMeters !== undefined) return;
    let cancelled = false;
    // Resets to "not failed yet" as soon as a retry is requested (the token
    // bump below) — same external-trigger justification as the URL-sync
    // effects elsewhere in the app: this is reacting to a user click, not
    // deriving state from a prop that already has the right value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElevationUnavailable(false);
    computeElevationProfile(load.run.points).then((profile) => {
      if (cancelled) return;
      if (!profile) {
        setElevationUnavailable(true);
        return;
      }
      const gain = elevationGainFromProfile(profile);
      setComputedElevationGain(gain);
      void updateRunElevationGain(load.run.id, gain);
    });
    return () => {
      cancelled = true;
    };
  }, [load, elevationRetryToken]);

  useEffect(() => {
    // `fetchRunHealthData` itself already no-ops on `HEALTH_DATA_ENABLED`
    // and non-native — the flag check here just skips the effect (and the
    // permission-check round trip inside it) entirely rather than firing it
    // every time this screen mounts for no reason.
    if (!HEALTH_DATA_ENABLED || load.status !== "ready") return;
    let cancelled = false;
    fetchRunHealthData(load.run).then((data) => {
      if (!cancelled) setHealthData(data);
    });
    // Recovery context describes the athlete's state going *into* the run
    // (resting HR/HRV/VO2 max/sleep), not the run itself, so it's anchored
    // to the run's start time rather than the matched workout's own window
    // `fetchRunHealthData` uses.
    fetchRecoveryContext(load.run.startedAt).then((data) => {
      if (!cancelled) setRecoveryContext(data);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (load.status === "loading") {
    return (
      <Screen>
        <Card className="animate-pulse">
          <div className="h-48 rounded-xl bg-border/70" />
        </Card>
      </Screen>
    );
  }

  if (load.status === "not-found") {
    return (
      <Screen>
        <Card>
          <CardTitle>Corrida não encontrada</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Esse registro não existe mais neste aparelho — pode já ter sido excluído.
          </p>
          <Link
            href="/historico"
            className="mt-4 flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          >
            Voltar pro histórico
          </Link>
        </Card>
      </Screen>
    );
  }

  const { run, records } = load;
  const seconds = runMovingSeconds(run);
  const started = new Date(run.startedAt);
  const newRecords = records.filter((r) => r.isNewRecord);
  const splits = computeSplits(run.points, metersPerUnit(unit));
  const elevationGain = run.elevationGainMeters ?? computedElevationGain;
  const estimatedCalories = runnerProfile.weightKg
    ? estimateCalories(run.distanceMeters, elevationGain, runnerProfile.weightKg)
    : null;
  /** The watch's own measured figure outranks the weight/distance estimate whenever it's actually available — see health.ts. */
  const calories = healthData?.caloriesKcal ?? estimatedCalories;

  /**
   * The flag is written optimistically and its failure swallowed: it only
   * decides whether the box animation replays, and a record whose "opened"
   * state was never persisted still shows the same item. It is written when
   * the lid actually comes off, not when the modal opens, so the card behind
   * doesn't give the tier away while the box is still shut.
   */
  const handleRecordUnboxed = (record: RunRecord) => {
    if (openedMeters.includes(record.targetMeters)) return;
    setOpenedMeters((current) => [...current, record.targetMeters]);
    markRecordOpened(run.id, record.targetMeters).catch(() => {});
  };

  const handleDelete = async () => {
    setDeleting(true);
    await deleteCompletedRun(run.id);
    if (account) void removeFinishedRun(run.distanceMeters);
    router.push("/historico");
  };

  const handleShareWithCoach = async (coachId: string) => {
    setSharingId(coachId);
    const result = await shareRunWithCoaches(run, [coachId]);
    setSharingId(null);
    if (result.ok) setSharedWith((current) => [...current, coachId]);
  };

  return (
    <>
      <ScreenHeader
        title={formatRunDate(started)}
        subtitle={`${timeFormatter.format(started)} · gravado neste aparelho`}
        badge={
          <Link
            href={`/compartilhar?run=${run.id}`}
            aria-label="Compartilhar essa corrida"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:text-accent"
          >
            <ShareIcon />
          </Link>
        }
      />

      <Screen>
        {/* `-mx-5` cancels Screen's own `px-5` specifically for this one
            element — the map reads better full-bleed than boxed in with
            everything else on the page, so it's the one thing here that
            deliberately breaks out of the shared content column. */}
        <div className="pr-enter -mx-5" style={delay(20)}>
          <RouteReplay points={run.points} unit={unit} rounded={false} />
        </div>

        <Card className="pr-enter" style={delay(50)}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">Distância</span>
              <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums">
                {formatDistance(run.distanceMeters, unit)}
                <span className="ml-1 text-sm text-muted">{unitLabel(unit)}</span>
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">Tempo</span>
              <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums">{formatElapsed(seconds)}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">{paceLabel(unit)}</span>
              <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums">
                {formatAveragePace(run.distanceMeters, seconds, unit)}
              </p>
            </div>
          </div>
          {(run.shoeName ||
            elevationGain !== null ||
            elevationUnavailable ||
            calories !== null ||
            run.rpe !== undefined ||
            healthData?.avgHeartRateBpm != null) && (
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
              {healthData?.avgHeartRateBpm != null && (
                <StatQuadrant
                  icon={<HeartbeatIcon className="h-4 w-4" />}
                  label="FC média"
                  value={healthData.avgHeartRateBpm}
                  unit="bpm"
                />
              )}
              {elevationGain !== null && (
                <StatQuadrant icon="elevacao" label="Ganho de elevação" value={elevationGain} unit="m" />
              )}
              {elevationGain === null && elevationUnavailable && (
                // Same slot the elevation quadrant would otherwise sit in —
                // previously this case rendered nothing at all, so a failed
                // MapTiler lookup (rate limit, flaky mobile network) looked
                // identical to "this run has no elevation to report", with no
                // way to tell the two apart or try again.
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted">Ganho de elevação</span>
                    <StatIconBadge icon="elevacao" className="block h-7 w-7 opacity-40" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setElevationRetryToken((token) => token + 1)}
                    className="mt-1.5 text-left text-xs font-medium text-accent"
                  >
                    Indisponível — tentar de novo
                  </button>
                </div>
              )}
              {calories !== null && (
                <StatQuadrant
                  icon="calorias"
                  label={healthData?.caloriesKcal != null ? "Calorias (relógio)" : "Calorias"}
                  value={calories}
                  unit="kcal"
                  flame
                />
              )}
              {run.shoeName && (
                <StatQuadrant icon="tenis" label="Tênis" value={run.shoeName} />
              )}
              {run.rpe !== undefined && (
                <StatQuadrant icon="esforco" label="Esforço percebido" value={run.rpe} unit="/10" />
              )}
              {run.rpe !== undefined && (
                // Foster's session-RPE: load = RPE × minutes moved — the same hardware-free training-load formula Strava falls back to without a heart-rate sensor.
                <StatQuadrant
                  icon="carga"
                  label="Carga do treino"
                  value={Math.round(run.rpe * (seconds / 60))}
                />
              )}
            </div>
          )}
        </Card>

        {recoveryContext && (
          <Card className="pr-enter" style={delay(85)}>
            <CardTitle aside={<NoticeBadge>relógio</NoticeBadge>}>Recuperação</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Como você chegou nessa corrida, não o que aconteceu durante ela.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {recoveryContext.restingHeartRateBpm != null && (
                <StatQuadrant
                  icon={<HeartbeatIcon className="h-4 w-4" />}
                  label="FC em repouso"
                  value={recoveryContext.restingHeartRateBpm}
                  unit="bpm"
                />
              )}
              {recoveryContext.hrvMs != null && (
                <StatQuadrant icon={<HrvIcon className="h-4 w-4" />} label="HRV" value={recoveryContext.hrvMs} unit="ms" />
              )}
              {recoveryContext.sleepHours != null && (
                <StatQuadrant
                  icon={<SleepIcon className="h-4 w-4" />}
                  label="Sono (noite anterior)"
                  value={recoveryContext.sleepHours}
                  unit="h"
                />
              )}
              {recoveryContext.vo2Max != null && (
                <StatQuadrant
                  icon={<Vo2MaxIcon className="h-4 w-4" />}
                  label="VO2 máx estimado"
                  value={recoveryContext.vo2Max}
                  unit="mL/kg/min"
                />
              )}
            </div>
          </Card>
        )}

        {newRecords.length > 0 && (
          <Card className="pr-enter" style={delay(90)}>
            <CardTitle aside={<NoticeBadge>{newRecords.length}</NoticeBadge>}>Conquistas dessa corrida</CardTitle>
            <div className="flex flex-col gap-2.5">
              {newRecords.map((record) => (
                <PrBadge
                  key={record.targetMeters}
                  record={record}
                  achievement={computeAchievement(run.id, record)}
                  opened={openedMeters.includes(record.targetMeters)}
                  onOpen={() =>
                    setRevealing({ record, wasOpened: openedMeters.includes(record.targetMeters) })
                  }
                />
              ))}
            </div>
          </Card>
        )}

        <SplitsTable splits={splits} unit={unit} points={run.points} />

        <ZonesCard points={run.points} />

        <CommentsCard startedAtMs={run.startedAt} />

        {coaches !== null && coaches.length > 0 && (
          <Card className="pr-enter" style={delay(170)}>
            <CardTitle>Enviar pro treinador</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Só essa corrida, só pra quem você escolher aqui — nada é enviado automaticamente.
            </p>
            <ul className="flex flex-col gap-2">
              {coaches.map((connection) => {
                const sent = sharedWith.includes(connection.otherId);
                return (
                  <li key={connection.relationship.$id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">
                      {connection.profile?.displayName ?? "Corredor(a)"}
                    </span>
                    <button
                      type="button"
                      disabled={sent || sharingId === connection.otherId}
                      onClick={() => handleShareWithCoach(connection.otherId)}
                      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold disabled:opacity-60 ${
                        sent ? "bg-good/15 text-good" : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {sent ? "Enviado" : sharingId === connection.otherId ? "Enviando…" : "Enviar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card className="pr-enter" style={delay(175)}>
          <CardTitle>Vídeo sincronizado</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
            Gravou essa corrida por fora (óculos, câmera no peito)? Sobrepõe ritmo, distância e tempo
            em cima do vídeo, sincronizado com o que o GPS registrou.
          </p>
          <Link
            href={`/historico/video?run=${run.id}`}
            className="flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-semibold hover:border-accent"
          >
            Sincronizar vídeo
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(180)}>
          {confirmingDelete ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs leading-snug text-pretty">Excluir essa corrida? Não dá pra desfazer.</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded-full bg-bad px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-bad hover:text-bad"
            >
              <TrashIcon />
              Excluir corrida
            </button>
          )}
        </Card>

        <Link
          href="/historico"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(210)}
        >
          Voltar pro histórico
        </Link>
      </Screen>

      {revealing && (
        <AchievementReveal
          record={revealing.record}
          achievement={computeAchievement(run.id, revealing.record)}
          alreadyOpened={revealing.wasOpened}
          onOpened={() => handleRecordUnboxed(revealing.record)}
          onClose={() => setRevealing(null)}
        />
      )}
    </>
  );
}
