"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCompletedRuns, type CompletedRun, type StoredPoint } from "@/lib/tracking/storage";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import type { DistanceUnit } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader, Stat } from "../ui";

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

function runSeconds(run: CompletedRun): number {
  return Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
}

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
function RouteThumb({ points }: { points: StoredPoint[] }) {
  const size = 56;
  const pad = 6;

  if (points.length < 2) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
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
      className="h-14 w-14 shrink-0 rounded-xl border border-border bg-background text-accent"
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
    <Card className="pr-enter flex flex-col items-center px-6 py-10 text-center" style={delay(80)}>
      <svg
        viewBox="0 0 120 72"
        className="pr-svg h-auto w-40 text-accent"
        role="img"
        aria-label="Ilustração de um percurso ainda não percorrido"
      >
        <path
          d="M10 58 C 30 58, 26 22, 48 22 S 76 50, 96 34 L 110 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="5 7"
          opacity="0.35"
        />
        <circle cx="10" cy="58" r="5" fill="currentColor" />
        <circle cx="110" cy="16" r="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>

      <h2 className="mt-6 text-lg font-semibold text-balance">
        Seu histórico começa na primeira corrida
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted text-pretty">
        Ainda não há nenhuma corrida gravada neste aparelho. Assim que você finalizar um
        treino, ele aparece aqui com distância, tempo, pace médio e o traçado do percurso.
      </p>

      <Link
        href="/run"
        className="mt-7 w-full max-w-xs rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      >
        Gravar primeira corrida
      </Link>

      <p className="mt-5 max-w-xs text-xs leading-relaxed text-muted">
        As corridas ficam salvas só neste aparelho, offline. Nada é enviado pra nenhum
        servidor.
      </p>
    </Card>
  );
}

function Summary({ runs, unit }: { runs: CompletedRun[]; unit: DistanceUnit }) {
  const totalMeters = runs.reduce((sum, run) => sum + run.distanceMeters, 0);
  const totalSeconds = runs.reduce((sum, run) => sum + runSeconds(run), 0);

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
          <>
            Já há corridas suficientes pra desenhar evolução de pace. O gráfico entra na
            próxima etapa, calculado sobre estes treinos reais.
          </>
        )}
      </p>
    </Card>
  );
}

function RunRow({ run, unit, index }: { run: CompletedRun; unit: DistanceUnit; index: number }) {
  const seconds = runSeconds(run);
  const started = new Date(run.startedAt);

  return (
    <li className="pr-enter" style={delay(90 + index * 45)}>
      <article className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        <RouteThumb points={run.points} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-medium">{formatRunDate(started)}</h3>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {timeFormatter.format(started)}
            </span>
          </div>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {formatDistance(run.distanceMeters, unit)}
            <span className="ml-1 text-sm text-muted">{unitLabel(unit)}</span>
          </p>
          <dl className="mt-1.5 flex gap-4 font-mono text-xs tabular-nums text-muted">
            <div className="flex gap-1.5">
              <dt className="not-italic">tempo</dt>
              <dd className="text-foreground">{formatElapsed(seconds)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{paceLabel(unit)}</dt>
              <dd className="text-foreground">
                {formatAveragePace(run.distanceMeters, seconds, unit)}
              </dd>
            </div>
          </dl>
          {run.shoeName && (
            <p className="mt-1.5 truncate font-mono text-xs text-muted">
              <span className="text-[10px] uppercase tracking-wide">tênis</span>{" "}
              <span className="text-foreground">{run.shoeName}</span>
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

export default function HistoricoPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();

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

  return (
    <>
      <ScreenHeader
        title="Histórico"
        subtitle="Suas corridas gravadas, direto do armazenamento local deste aparelho."
        badge={runs.length > 0 ? <NoticeBadge>dados reais</NoticeBadge> : undefined}
      />

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
            {runs.length >= 2 && <Summary runs={runs} unit={unit} />}
            <ul className="flex flex-col gap-3">
              {runs.map((run, index) => (
                <RunRow key={run.id} run={run} unit={unit} index={index} />
              ))}
            </ul>
          </>
        )}
      </Screen>
    </>
  );
}
