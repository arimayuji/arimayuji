"use client";

import { useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Card } from "../ui";
import { fetchRunningWeather, type RunWeatherForecast } from "@/lib/runningWeather";

type WeatherStatus = "idle" | "loading" | "ready" | "denied" | "failed";
type Score = RunWeatherForecast["hours"][number]["score"];

/** Same `--good`/`--warn`/`--bad` tokens used elsewhere for pace-vs-goal deltas, as Tailwind text-color classes so the face icon (stroked with `currentColor`) picks up the right color per hour. */
const SCORE_TEXT_CLASS: Record<Score, string> = {
  bom: "text-good",
  razoavel: "text-warn",
  ruim: "text-bad",
};

const FACE_ICON_PROPS = {
  viewBox: "0 0 20 20",
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Copies the happy/neutral/sad face convention from weather apps, per direct request — replaces the earlier temperature-curve design (also replaced after feedback) as the hour-by-hour verdict. Line-art style, matching every other icon in this app (`RepeatIcon`/`WarmupIcon` in `run/page.tsx`), never emoji characters (wouldn't pick up the `--good`/`--warn`/`--bad` color or the app's own line weight). */
function HappyFaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...FACE_ICON_PROPS}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="7.2" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M7 11.8Q10 14.8 13 11.8" />
    </svg>
  );
}

function NeutralFaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...FACE_ICON_PROPS}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="7.2" cy="8.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="8.8" r="0.9" fill="currentColor" stroke="none" />
      <path d="M7 12.8L13 12.8" />
    </svg>
  );
}

function SadFaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...FACE_ICON_PROPS}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="7.2" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <path d="M7 14Q10 11 13 14" />
    </svg>
  );
}

const FACE_ICON: Record<Score, typeof HappyFaceIcon> = {
  bom: HappyFaceIcon,
  razoavel: NeutralFaceIcon,
  ruim: SadFaceIcon,
};

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
        <div className="space-y-3">
          <div className="flex justify-between">
            {forecast.hours.map((hour) => {
              const FaceIcon = FACE_ICON[hour.score];
              return (
                <div key={hour.time} className="flex flex-1 flex-col items-center gap-1">
                  <FaceIcon className={`h-6 w-6 ${SCORE_TEXT_CLASS[hour.score]}`} />
                  <span className="text-[10px] font-semibold text-foreground">{Math.round(hour.tempC)}°</span>
                  <span className="text-[9px] text-muted">{hour.time.slice(11, 13)}h</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-foreground">{forecast.summary}</p>
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
