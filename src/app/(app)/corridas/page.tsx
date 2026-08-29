"use client";

import { useEffect, useMemo, useState } from "react";
import { listUpcomingCityRaces, type CityRace } from "@/lib/cityRaces";
import { useHeaderClose } from "../app-shell";
import { Card, delay, NoticeBadge, Screen, ScreenHeader } from "../ui";

/**
 * "Calendário de corridas de rua" — a live feed of upcoming street races,
 * synced weekly server-side from two public sources (Corrida Perfeita
 * nationwide, FPA for São Paulo state — see the sync-city-races action in
 * client-actions/src/main.js). This screen only ever reads; it never
 * writes to `city_races`.
 */

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; races: CityRace[] };

const ALL_STATES = "todos";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

function formatRaceDate(iso: string): string {
  const text = dateFormatter.format(new Date(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function RaceCard({ race }: { race: CityRace }) {
  const location = [race.city, race.state].filter(Boolean).join(" - ");
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold tracking-wide text-accent">{formatRaceDate(race.date)}</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-pretty">{race.name}</h3>
          {location && <p className="mt-1 text-xs text-muted">{location}</p>}
        </div>
        {race.registrationUrl && (
          <a
            href={race.registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground"
          >
            Inscreva-se
          </a>
        )}
      </div>
      {race.distancesKm.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {race.distancesKm.map((km) => (
            <span key={km} className="rounded-full bg-background px-2.5 py-1 font-mono text-[11px] font-bold text-muted">
              {km}km
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function CorridasPage() {
  useHeaderClose("/lugares");
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [state, setState] = useState<string>(ALL_STATES);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listUpcomingCityRaces()
      .then((races) => !cancelled && setLoad({ status: "ready", races }))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const races = useMemo(() => (load.status === "ready" ? load.races : []), [load]);
  const states = useMemo(() => {
    const counts = new Map<string, number>();
    for (const race of races) {
      if (!race.state) continue;
      counts.set(race.state, (counts.get(race.state) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([, a], [, b]) => b - a).map(([uf]) => uf);
  }, [races]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return races.filter((race) => {
      if (state !== ALL_STATES && race.state !== state) return false;
      if (!q) return true;
      return race.name.toLowerCase().includes(q) || race.city.toLowerCase().includes(q);
    });
  }, [races, state, query]);

  return (
    <>
      <ScreenHeader
        title="Corridas de rua"
        subtitle="Próximas provas no Brasil — atualizado semanalmente a partir de fontes públicas."
        badge={<NoticeBadge>{races.length > 0 ? `${races.length} provas` : "beta"}</NoticeBadge>}
      />

      <Screen>
        {load.status === "loading" && (
          <p className="pr-enter text-center text-sm text-muted" style={delay(20)}>
            Carregando corridas…
          </p>
        )}

        {load.status === "error" && (
          <Card>
            <p className="text-sm text-muted">Não deu pra carregar o calendário agora. Tenta de novo mais tarde.</p>
          </Card>
        )}

        {load.status === "ready" && (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou cidade…"
              className="pr-enter h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-accent"
              style={delay(20)}
            />

            {states.length > 1 && (
              <div className="pr-enter -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={delay(35)}>
                <button
                  type="button"
                  onClick={() => setState(ALL_STATES)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    state === ALL_STATES ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
                  }`}
                >
                  Todos os estados
                </button>
                {states.map((uf) => (
                  <button
                    key={uf}
                    type="button"
                    onClick={() => setState(uf)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                      state === uf ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
                    }`}
                  >
                    {uf}
                  </button>
                ))}
              </div>
            )}

            {filtered.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">
                  {races.length === 0
                    ? "Nenhuma corrida encontrada ainda — volta em alguns dias, a lista é atualizada toda semana."
                    : "Nenhuma corrida bate com esse filtro."}
                </p>
              </Card>
            ) : (
              filtered.slice(0, 100).map((race, index) => (
                <div key={race.$id} className="pr-enter" style={delay(60 + index * 20)}>
                  <RaceCard race={race} />
                </div>
              ))
            )}

            <p className="pr-enter text-center text-xs leading-relaxed text-muted text-pretty" style={delay(80 + filtered.length * 20)}>
              Dados de Corrida Perfeita (nacional) e Federação Paulista de Atletismo (SP) — o Xanthus não organiza nem
              garante nenhuma dessas provas, só reúne o calendário público num lugar só.
            </p>
          </>
        )}
      </Screen>
    </>
  );
}
