"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadSharedPhoto } from "@/lib/avatar";
import { estimateCalories } from "@/lib/calories";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { listFriendConnections } from "@/lib/friendships";
import { computeElevationProfile, elevationGainFromProfile, type ElevationSample } from "@/lib/elevation";
import { fetchRecoveryContext, fetchRunHealthData, HEALTH_DATA_ENABLED, type RecoveryContext, type RunHealthData } from "@/lib/health";
import { searchTracks, type TrackCandidate } from "@/lib/music/itunesLookup";
import { syncProfileStats } from "@/lib/profileStats";
import { deleteRunSummary } from "@/lib/runSummariesSync";
import { listRunComments, type RunComment } from "@/lib/runComments";
import { matchPlaceForRoute, resolvePlaceLabel } from "@/lib/placeMatch";
import { getSyncedRun, setRunFriendsVisibility, shareRunWithCoaches } from "@/lib/runsSync";
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
  updateRunPlaceName,
  updateRunTracks,
  type CompletedRun,
  type RunTrack,
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
import { Card, CardTitle, delay, Keywords, NoticeBadge, Screen, ScreenHeader, SPAN_COLUMNS } from "../../ui";

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

/**
 * Placeholder examples for the feed caption input below — never a preset
 * the athlete picks from, just inspiration so an empty text box doesn't
 * read as "type something serious here". One is picked at random per
 * mount so it's not always the same joke sitting there.
 */
const CAPTION_EXAMPLES = [
  "pace paquera",
  "pace ressaca",
  "pace fugindo de cachorro",
  "pace já vou de boa",
  "pace café da manhã",
  "pace resolvendo trauma",
  "pace só pra foto",
];

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

function RepeatIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4v5h5" />
      <path d="M4.5 9A8 8 0 1 1 4 15" />
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
        className={`${flame ? "text-flame" : "text-metal"} mt-1.5 truncate font-mono text-lg tabular-nums lg:tracking-[-0.01em]`}
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
    <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(140)}>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Parciais por {unitLabel(unit)}</CardTitle>
        <div className="flex shrink-0 rounded-full border border-border p-0.5 font-mono text-[11px]">
          {(["pace", "elevacao"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMetric(option)}
              className={`pr-press rounded-full px-2.5 py-1 font-semibold active:scale-95 ${
                metric === option ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
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
        <ul className="flex flex-col gap-3.5">
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
    <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(150)}>
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
      <ul className="flex flex-col gap-2.5">
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
    <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(160)}>
      <CardTitle>Comentários do treinador</CardTitle>
      <ul className="flex flex-col gap-2.5">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-lg bg-background px-3 py-2 text-sm leading-relaxed text-pretty">
            {comment.text}
            {comment.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- an Appwrite Storage URL, not a local asset.
              <img src={comment.photoUrl} alt="" className="mt-2 max-h-48 w-full rounded-lg object-cover" />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RunDetail({ id }: { id: string }) {
  useHeaderClose("/perfil?tab=progresso");
  const router = useRouter();
  const { account, profile } = useAuth();
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
  /** Only used to decide whether the "Compartilhar com amigos" card has anyone to show at all — the feed itself is all-or-nothing (every accepted friend), never a per-friend picker like coaches above, so the count is all this screen needs. */
  const [friendCount, setFriendCount] = useState(0);
  const [friendsShared, setFriendsShared] = useState(false);
  const [sharingFriends, setSharingFriends] = useState(false);
  const [caption, setCaption] = useState("");
  const [captionPlaceholder] = useState(
    () => `Ex: ${CAPTION_EXAMPLES[Math.floor(Math.random() * CAPTION_EXAMPLES.length)]}`,
  );
  /**
   * A real photo of the post itself, not just of a comment on it ("a foto
   * não só no comentário mas também do autor do post", 2026-09-01) —
   * picked here (any time after the run finishes, this screen's whole
   * reason to exist) and uploaded only when the athlete actually shares,
   * same lazy-upload timing the Feed's own comment composer uses.
   */
  const [postPhoto, setPostPhoto] = useState<File | null>(null);
  const [postPhotoPreviewUrl, setPostPhotoPreviewUrl] = useState<string | null>(null);
  const postPhotoInputId = useId();
  const postPhotoInputRef = useRef<HTMLInputElement>(null);
  /** Mirrors `run.placeName` as a controlled input value — only ever shown/editable when the route doesn't already match the catalog (see the render below). */
  const [placeNameInput, setPlaceNameInput] = useState("");
  /**
   * Which song/track was playing during this run — a property of the run
   * itself (like `placeName`), not of the share-card export flow. Used to
   * live under `/compartilhar`'s own search box, which confused what it
   * actually recorded: real-device feedback (2026-08-29) pointed out that
   * "attach the song to the run so I remember what I ran to" reads as
   * something the run should remember regardless of ever posting it
   * anywhere, not a step inside generating a share card. `/compartilhar`
   * still reads `run.tracks` (unchanged) to decide whether its "música"
   * templates are available — only the editing UI moved here.
   */
  const [manualTracks, setManualTracks] = useState<RunTrack[]>([]);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<TrackCandidate[] | null>(null);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicSearchFailed, setMusicSearchFailed] = useState(false);
  /** The last value actually persisted — separate from `placeNameInput` so the Save button can tell "typed but not saved yet" apart from "already saved", without waiting on a full reload of `load.run` (which this screen never re-fetches after a save). */
  const [savedPlaceName, setSavedPlaceName] = useState("");
  const [savingPlaceName, setSavingPlaceName] = useState(false);

  useEffect(() => {
    listCoachConnections("accepted").then((rows) => setCoaches(rows.filter((c) => c.myRole === "student")));
    listFriendConnections("accepted").then((rows) => setFriendCount(rows.length));
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
      setPlaceNameInput(run.placeName ?? "");
      setSavedPlaceName(run.placeName ?? "");
      setManualTracks(run.tracks ?? []);
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
        <Card className={`animate-pulse lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
          <div className="h-48 rounded-xl bg-border/70" />
        </Card>
      </Screen>
    );
  }

  if (load.status === "not-found") {
    return (
      <Screen>
        <Card className={`lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
          <CardTitle>Corrida não encontrada</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Esse registro não existe mais neste aparelho — pode já ter sido excluído.
          </p>
          <Link
            href="/perfil?tab=progresso"
            className="pr-press mt-4 flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground active:scale-[0.98]"
          >
            Voltar pro progresso
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
  /** Only asked for a manual name when this is null — see `CompletedRun.placeName`'s own comment on why the two never coexist. */
  const matchedPlace = matchPlaceForRoute(run.points);
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
    if (account) void syncProfileStats();
    if (profile?.runSyncOptIn) void deleteRunSummary(run.id);
    router.push("/perfil?tab=progresso");
  };

  const handleSavePlaceName = async () => {
    setSavingPlaceName(true);
    const trimmed = placeNameInput.trim();
    await updateRunPlaceName(run.id, trimmed);
    setSavedPlaceName(trimmed);
    setSavingPlaceName(false);
  };

  const handleMusicSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!musicQuery.trim()) return;
    setMusicSearching(true);
    setMusicSearchFailed(false);
    try {
      setMusicResults(await searchTracks(musicQuery));
    } catch {
      setMusicResults(null);
      setMusicSearchFailed(true);
    } finally {
      setMusicSearching(false);
    }
  };

  const handleAddManualTrack = async (candidate: TrackCandidate) => {
    const newTrack: RunTrack = {
      name: candidate.name,
      artist: candidate.artist,
      // Only ever runs from the click below, never during render; can't wrap
      // this in useCallback like /run's own copy of this handler does, since
      // this one is declared after this component's early "loading"/"not-found"
      // returns (rules-of-hooks forbids a hook after a conditional return).
      // eslint-disable-next-line react-hooks/purity
      playedAt: Date.now(),
      artworkUrl: candidate.artworkUrl || undefined,
    };
    const next = [...manualTracks, newTrack];
    setManualTracks(next);
    setMusicQuery("");
    setMusicResults(null);
    await updateRunTracks(run.id, next);
  };

  const handleRemoveTrack = async (removed: RunTrack) => {
    const next = manualTracks.filter((t) => t !== removed);
    setManualTracks(next);
    await updateRunTracks(run.id, next);
  };

  const handleShareWithCoach = async (coachId: string) => {
    setSharingId(coachId);
    const result = await shareRunWithCoaches(run, [coachId], newRecords.map((r) => r.label));
    setSharingId(null);
    if (result.ok) setSharedWith((current) => [...current, coachId]);
  };

  const handleToggleFriendsShare = async () => {
    setSharingFriends(true);
    const next = !friendsShared;
    // Only ever uploaded on the way to actually posting — unsharing needs
    // no photo, and re-picking the same file across toggles would just
    // waste an upload nobody asked for.
    const photoUrl = next && postPhoto ? ((await uploadSharedPhoto(postPhoto)) ?? undefined) : undefined;
    const result = await setRunFriendsVisibility(run, next, newRecords.map((r) => r.label), {
      caption: caption.trim() || undefined,
      placeName: resolvePlaceLabel(run) ?? undefined,
      elevationGainMeters: elevationGain ?? undefined,
      photoUrl,
    });
    setSharingFriends(false);
    if (result.ok) setFriendsShared(next);
  };

  const handlePickPostPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setPostPhoto(file);
    setPostPhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const handleRemovePostPhoto = () => {
    setPostPhoto(null);
    setPostPhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (postPhotoInputRef.current) postPhotoInputRef.current.value = "";
  };

  return (
    <>
      <ScreenHeader
        title={formatRunDate(started)}
        subtitle={timeFormatter.format(started)}
        badge={
          <div className="flex items-center gap-2">
            <Link
              href={`/run?repeatRunId=${run.id}`}
              aria-label="Repetir essa corrida"
              className="pr-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:border-accent hover:text-accent active:scale-95"
            >
              <RepeatIcon />
            </Link>
            <Link
              href={`/compartilhar?run=${run.id}`}
              aria-label="Compartilhar essa corrida"
              className="pr-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:border-accent hover:text-accent active:scale-95"
            >
              <ShareIcon />
            </Link>
          </div>
        }
      />

      <Screen>
        {/* `-mx-5` cancels Screen's own `px-5` specifically for this one
            element — the map reads better full-bleed than boxed in with
            everything else on the page, so it's the one thing here that
            deliberately breaks out of the shared content column. */}
        <div className={`pr-enter -mx-5 ${SPAN_COLUMNS}`} style={delay(20)}>
          <RouteReplay points={run.points} unit={unit} rounded={false} />
        </div>

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(50)}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">Distância</span>
              <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums lg:tracking-[-0.02em]">
                {formatDistance(run.distanceMeters, unit)}
                <span className="ml-1 text-sm text-muted">{unitLabel(unit)}</span>
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">Tempo</span>
              <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums lg:tracking-[-0.02em]">{formatElapsed(seconds)}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">{paceLabel(unit)}</span>
              <p className="text-metal mt-0.5 font-mono text-2xl tabular-nums lg:tracking-[-0.02em]">
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
                    className="pr-press mt-1.5 text-left text-xs font-medium text-accent hover:opacity-80 active:scale-95"
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

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(86)}>
          <CardTitle>Lugar</CardTitle>
          {matchedPlace ? (
            <Link
              href={`/lugares/${matchedPlace.id}`}
              className="pr-press mt-1 inline-block text-sm font-medium text-accent underline underline-offset-2 hover:opacity-80"
            >
              {matchedPlace.name}
            </Link>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted text-pretty">
                Essa rota não bate com nenhum lugar do catálogo — digite onde foi pra poder buscar por
                isso no histórico depois.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={placeNameInput}
                  onChange={(event) => setPlaceNameInput(event.target.value)}
                  placeholder="Ex.: Parque tal, bairro tal…"
                  maxLength={60}
                  className="pr-press min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  disabled={savingPlaceName || placeNameInput.trim() === savedPlaceName}
                  onClick={() => void handleSavePlaceName()}
                  className="pr-press shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-accent active:scale-95 disabled:opacity-60"
                >
                  {savingPlaceName ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </>
          )}
        </Card>

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(87)}>
          <CardTitle>Trilha sonora</CardTitle>
          <Keywords items={["música ou playlist", "fica salva na corrida", "pra lembrar depois"]} />

          {manualTracks.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {[...manualTracks].sort((a, b) => b.playedAt - a.playedAt).map((t) => (
                <li
                  key={`${t.name}-${t.artist}-${t.playedAt}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
                >
                  {t.artworkUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {t.name} <span className="text-muted">— {t.artist}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveTrack(t)}
                    aria-label={`Remover ${t.name}`}
                    className="pr-press shrink-0 rounded-full p-1.5 text-muted hover:bg-bad/10 hover:text-bad active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleMusicSearch} className="mt-3 flex gap-2">
            <input
              type="text"
              value={musicQuery}
              onChange={(event) => setMusicQuery(event.target.value)}
              placeholder="nome da música ou artista"
              className="pr-press min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={musicSearching || !musicQuery.trim()}
              className="pr-press shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-accent active:scale-95 disabled:opacity-60"
            >
              {musicSearching ? "Buscando…" : "Buscar"}
            </button>
          </form>

          {musicSearchFailed && (
            <p className="mt-2 text-xs text-bad">Não deu pra buscar agora — confere a internet e tenta de novo.</p>
          )}

          {!musicSearchFailed && musicResults !== null && musicResults.length === 0 && (
            <p className="mt-2 text-xs text-muted">Nada encontrado.</p>
          )}

          {musicResults !== null && musicResults.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {musicResults.map((candidate, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => void handleAddManualTrack(candidate)}
                    className="pr-press flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-background active:scale-[0.98]"
                  >
                    {candidate.artworkUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    )}
                    <span className="truncate">
                      {candidate.name} <span className="text-muted">— {candidate.artist}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {recoveryContext && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(85)}>
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
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(90)}>
            <CardTitle aside={<NoticeBadge>{newRecords.length}</NoticeBadge>}>Conquistas dessa corrida</CardTitle>
            <div className="flex flex-col gap-3">
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
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(170)}>
            <CardTitle>Enviar pro treinador</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Só essa corrida, só pra quem você escolher aqui — nada é enviado automaticamente.
            </p>
            <ul className="flex flex-col gap-2.5">
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
                      className={`pr-press shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-60 ${
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

        {friendCount > 0 && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(172)}>
            <CardTitle>Compartilhar com amigos</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Aparece no feed de todos os seus amigos aceitos, com Bora — nunca só pra um por vez.
            </p>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={captionPlaceholder}
              maxLength={140}
              className="pr-press mb-3 w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:border-accent"
            />
            <div className="mb-3 flex items-center gap-2.5">
              <input
                id={postPhotoInputId}
                ref={postPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickPostPhoto}
                className="hidden"
              />
              {postPhotoPreviewUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an Appwrite/next/image asset. */}
                  <img src={postPhotoPreviewUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={handleRemovePostPhoto}
                    aria-label="Remover foto"
                    className="pr-press absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bad text-white hover:opacity-90 active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label
                  htmlFor={postPhotoInputId}
                  className="pr-press flex items-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent active:scale-95"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
                    <circle cx="12" cy="12.5" r="3.2" />
                  </svg>
                  Anexar foto
                </label>
              )}
            </div>
            <button
              type="button"
              disabled={sharingFriends}
              onClick={() => void handleToggleFriendsShare()}
              className={`pr-press flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold active:scale-[0.98] disabled:opacity-60 ${
                friendsShared ? "bg-good/15 text-good" : "border border-border text-foreground hover:border-accent"
              }`}
            >
              {sharingFriends
                ? "Salvando…"
                : friendsShared
                  ? "Compartilhado — toque pra remover do feed"
                  : "Compartilhar essa corrida com amigos"}
            </button>
          </Card>
        )}

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(175)}>
          <CardTitle>Vídeo sincronizado</CardTitle>
          <Keywords className="mb-3" items={["vídeo de fora", "ritmo e distância", "sincronizado ao gps"]} />
          <Link
            href={`/historico/video?run=${run.id}`}
            className="pr-press flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-semibold hover:border-accent active:scale-[0.98]"
          >
            Sincronizar vídeo
          </Link>
        </Card>

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(180)}>
          {confirmingDelete ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs leading-snug text-pretty">Excluir essa corrida? Não dá pra desfazer.</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="pr-press rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-foreground/[0.04] active:scale-95 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="pr-press rounded-full bg-bad px-3 py-2 text-xs font-semibold text-white hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  {deleting ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="pr-press flex w-full items-center justify-center gap-2 rounded-xl bg-bad py-3 text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98]"
            >
              <TrashIcon />
              Excluir corrida
            </button>
          )}
        </Card>

        <Link
          href="/perfil?tab=progresso"
          className="pr-enter pr-press flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(210)}
        >
          Voltar pro progresso
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
