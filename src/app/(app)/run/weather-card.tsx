"use client";

import { useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Card } from "../ui";
import { fetchRunningWeather, type RunWeatherForecast } from "@/lib/runningWeather";

type WeatherStatus = "idle" | "loading" | "ready" | "denied" | "failed";

/** Bar height reads as "how much this hour asks for caution" — a good hour barely shows a dot, a bad one grows tall — same visual language as the reference screenshot this feature was requested from. Color is the primary signal (`--good`/`--warn`/`--bad`, already used elsewhere for pace-vs-goal deltas); height is secondary emphasis. */
const SCORE_BAR_CLASS: Record<RunWeatherForecast["hours"][number]["score"], string> = {
  bom: "bg-good h-1.5",
  razoavel: "bg-warn h-4",
  ruim: "bg-bad h-8",
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
          <div className="flex items-end justify-between gap-1.5">
            {forecast.hours.map((hour) => (
              <div key={hour.time} className="flex flex-1 flex-col items-center gap-1.5">
                <div className={`w-2.5 rounded-full ${SCORE_BAR_CLASS[hour.score]}`} aria-hidden="true" />
                <span className="text-[10px] text-muted">{hour.time.slice(11, 13)}h</span>
              </div>
            ))}
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
