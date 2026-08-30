"use client";

import { useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Card } from "../ui";
import { fetchRunningWeather, type RunWeatherForecast } from "@/lib/runningWeather";

type WeatherStatus = "idle" | "loading" | "ready" | "denied" | "failed";

/** Same `--good`/`--warn`/`--bad` tokens used elsewhere for pace-vs-goal deltas — read as CSS custom properties (not Tailwind classes) so the SVG's `stroke`/`fill` can pick a color per point rather than per whole element. */
const SCORE_STROKE: Record<RunWeatherForecast["hours"][number]["score"], string> = {
  bom: "var(--good)",
  razoavel: "var(--warn)",
  ruim: "var(--bad)",
};

const CHART_HEIGHT = 32;
const CHART_TOP_PAD = 4;
const CHART_BOTTOM_PAD = 4;

/**
 * One x/y point per hour (feels-like temperature, normalized to the
 * window's own min/max) plus that hour's stroke color — a temperature
 * curve reads as "how the next few hours actually trend" better than a
 * bar-per-hour "verdict" chart did (the previous design, replaced after
 * user feedback that it looked off). Same viewBox-percentage /
 * `preserveAspectRatio="none"` convention as `Sparkline` in
 * `historico/detalhe/run-detail.tsx` (not reused directly — that one's
 * local to that file and always single-colored via `currentColor`).
 */
function buildLinePoints(hours: RunWeatherForecast["hours"]) {
  const temps = hours.map((h) => h.feelsLikeC);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;
  const usableHeight = CHART_HEIGHT - CHART_TOP_PAD - CHART_BOTTOM_PAD;
  return hours.map((hour, i) => {
    const x = hours.length > 1 ? (i / (hours.length - 1)) * 100 : 50;
    const y = CHART_HEIGHT - CHART_BOTTOM_PAD - ((hour.feelsLikeC - min) / span) * usableHeight;
    return { x, y, hour };
  });
}

/**
 * "Clima pra corrida" — collapsed by default (just a button), never fetches
 * anything on mount. Tapping "Ver previsão" IS the consent: it triggers the
 * one-shot low-accuracy location read (same call `friend-presence-ping.tsx`
 * already uses for "amigo por perto") and, on success, the Open-Meteo
 * lookup. Purely informational — never blocks or is required for "Iniciar
 * corrida" below it.
 */
export function RunWeatherCard() {
  const [status, setStatus] = useState<WeatherStatus>("idle");
  const [forecast, setForecast] = useState<RunWeatherForecast | null>(null);

  async function handleCheckWeather() {
    setStatus("loading");
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false });
      const result = await fetchRunningWeather(position.coords.latitude, position.coords.longitude);
      if (!result) {
        setStatus("failed");
        return;
      }
      setForecast(result);
      setStatus("ready");
    } catch {
      // Permission denied, GPS unavailable, timeout — same bucket, no need
      // to distinguish for the athlete (same convention as friend-presence-ping.tsx).
      setStatus("denied");
    }
  }

  return (
    <Card>
      <span className="mb-3 block text-[11px] font-semibold tracking-wide text-muted uppercase">
        Clima pra corrida
      </span>

      {status === "idle" && (
        <button
          type="button"
          onClick={handleCheckWeather}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent/10 px-3.5 py-2 text-xs font-semibold text-accent"
        >
          Ver previsão
        </button>
      )}

      {status === "loading" && <p className="text-xs text-muted">Buscando previsão…</p>}

      {status === "ready" && forecast && (
        <div className="space-y-2">
          <svg
            viewBox={`0 0 100 ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-16 w-full overflow-visible"
            aria-hidden="true"
          >
            {buildLinePoints(forecast.hours).map((point, i, points) => {
              if (i === 0) return null;
              const prev = points[i - 1];
              return (
                <line
                  key={point.hour.time}
                  x1={prev.x}
                  y1={prev.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={SCORE_STROKE[prev.hour.score]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {buildLinePoints(forecast.hours).map((point) => (
              <circle
                key={point.hour.time}
                cx={point.x}
                cy={point.y}
                r={2.4}
                fill={SCORE_STROKE[point.hour.score]}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="flex justify-between">
            {forecast.hours.map((hour) => (
              <div key={hour.time} className="flex flex-1 flex-col items-center gap-0.5">
                <span className="text-[10px] font-semibold text-foreground">{Math.round(hour.tempC)}°</span>
                <span className="text-[9px] text-muted">{hour.time.slice(11, 13)}h</span>
              </div>
            ))}
          </div>
          <p className="pt-1 text-xs leading-relaxed text-foreground">{forecast.summary}</p>
          <p className="text-[10px] leading-relaxed text-muted">
            Estimativa simples do app (temperatura, chuva, vento) — não é uma recomendação médica.
          </p>
        </div>
      )}

      {(status === "denied" || status === "failed") && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            {status === "denied"
              ? "Não conseguimos acessar sua localização pra buscar a previsão."
              : "Não deu pra buscar a previsão agora."}
          </p>
          <button
            type="button"
            onClick={handleCheckWeather}
            className="rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </Card>
  );
}
