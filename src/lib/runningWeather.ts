/**
 * "Clima pra corrida" — an hourly running-condition forecast for the next
 * few hours, via Open-Meteo (`open-meteo.com`, no API key required, unlike
 * MapTiler's elevation lookup in `elevation.ts`). Same "no fake numbers"
 * convention as the rest of this backend layer: every failure (network,
 * bad response, no data for the coordinates) collapses to `null`, never a
 * thrown error or an invented forecast.
 *
 * The good/reasonable/bad scoring below is a simple heuristic this app
 * made up from temperature/rain/wind — not a clinical or scientifically
 * validated index (there's no equivalent fact in `evidence/facts.ts`, e.g.
 * WBGT/heat-index guidance, backing these exact thresholds). Keep any UI
 * copy honest about that: "estimativa simples", never "recomendação".
 */

export type RunConditionScore = "bom" | "razoavel" | "ruim";

export interface HourlyRunCondition {
  /** Local ISO time string as Open-Meteo returns it (`timezone=auto` already resolves it to the coordinates' own timezone), e.g. "2026-08-30T10:00". */
  time: string;
  tempC: number;
  feelsLikeC: number;
  precipProbability: number;
  windKmh: number;
  score: RunConditionScore;
}

export interface RunWeatherForecast {
  hours: HourlyRunCondition[];
  /** One short pt-BR sentence summarizing the window — see `buildSummary`. */
  summary: string;
}

/** How many hours ahead (including the current one) the widget shows — enough to answer "should I go now or wait a bit," not a full-day forecast. */
const WINDOW_HOURS = 7;

/**
 * Thresholds are deliberately simple and stated as such in the module
 * comment above — feels-like temperature is the primary signal (matches
 * how a runner actually experiences heat better than raw air temp), rain
 * probability and wind are secondary cutoffs.
 */
export function scoreHour(hour: Pick<HourlyRunCondition, "feelsLikeC" | "precipProbability" | "windKmh">): RunConditionScore {
  const { feelsLikeC, precipProbability, windKmh } = hour;
  if (feelsLikeC >= 30 || feelsLikeC <= 5 || precipProbability >= 60 || windKmh >= 40) return "ruim";
  if (feelsLikeC >= 25 || feelsLikeC <= 10 || precipProbability >= 30 || windKmh >= 25) return "razoavel";
  return "bom";
}

const SCORE_RANK: Record<RunConditionScore, number> = { ruim: 0, razoavel: 1, bom: 2 };

function formatHourLabel(iso: string): string {
  const hour = iso.slice(11, 13);
  return `${hour}h`;
}

/**
 * A single sentence describing "now" and, if it's not already good, the
 * next hour in the window that's better — never invents a good time that
 * isn't actually in the data (if nothing ahead improves, says so instead
 * of picking an arbitrary hour).
 */
export function buildSummary(hours: HourlyRunCondition[]): string {
  if (hours.length === 0) return "Sem previsão disponível agora.";
  const now = hours[0];
  const nowLabel = now.score === "bom" ? "boas" : now.score === "razoavel" ? "razoáveis" : "ruins";

  if (now.score === "bom") {
    return "As condições agora estão boas pra corrida.";
  }

  const better = hours.slice(1).find((h) => SCORE_RANK[h.score] > SCORE_RANK[now.score]);
  if (better) {
    const betterLabel = better.score === "bom" ? "ideais" : "melhores";
    return `As condições agora estão ${nowLabel}. Por volta das ${formatHourLabel(better.time)}, ficam ${betterLabel}.`;
  }

  return `As condições agora estão ${nowLabel} e devem continuar assim nas próximas horas.`;
}

/**
 * Fetches the next `WINDOW_HOURS` hours of running-condition forecast for
 * `lat`/`lon`, or `null` on any failure — network error, non-2xx, or a
 * response missing the fields this needs. Never throws to the caller.
 */
export async function fetchRunningWeather(lat: number, lon: number): Promise<RunWeatherForecast | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m` +
      `&timezone=auto&forecast_days=2`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();

    const times: string[] | undefined = data?.hourly?.time;
    const temps: number[] | undefined = data?.hourly?.temperature_2m;
    const feelsLike: number[] | undefined = data?.hourly?.apparent_temperature;
    const precip: number[] | undefined = data?.hourly?.precipitation_probability;
    const wind: number[] | undefined = data?.hourly?.wind_speed_10m;
    const utcOffsetSeconds: number | undefined = data?.utc_offset_seconds;
    if (!times || !temps || !feelsLike || !precip || !wind || typeof utcOffsetSeconds !== "number") return null;

    // Open-Meteo's `hourly.time` entries are local naive timestamps for the
    // requested coordinates (no offset in the string itself) — shift "now"
    // by the same `utc_offset_seconds` the response reports so the string
    // comparison below lines up against the right timezone, regardless of
    // what timezone this code happens to be running in.
    const localNow = new Date(Date.now() + utcOffsetSeconds * 1000);
    const localNowFloored = localNow.toISOString().slice(0, 13) + ":00"; // "YYYY-MM-DDTHH:00", matching `times`' format
    let startIndex = times.findIndex((t) => t >= localNowFloored);
    if (startIndex < 0) startIndex = 0;

    const hours: HourlyRunCondition[] = [];
    for (let i = startIndex; i < times.length && hours.length < WINDOW_HOURS; i++) {
      if (temps[i] == null || feelsLike[i] == null || precip[i] == null || wind[i] == null) continue;
      const partial = { feelsLikeC: feelsLike[i], precipProbability: precip[i], windKmh: wind[i] };
      hours.push({
        time: times[i],
        tempC: temps[i],
        feelsLikeC: feelsLike[i],
        precipProbability: precip[i],
        windKmh: wind[i],
        score: scoreHour(partial),
      });
    }
    if (hours.length === 0) return null;

    return { hours, summary: buildSummary(hours) };
  } catch (error) {
    console.warn("[runningWeather] fetch failed — running-condition forecast unavailable.", error);
    return null;
  }
}
