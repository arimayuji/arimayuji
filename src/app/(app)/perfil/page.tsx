"use client";

import { useState } from "react";
import Link from "next/link";
import { ANNOUNCE_OPTIONS, announceLabel, type DistanceUnit } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { ShareCardTeaser } from "../share-card";
import { isConfigured, startAuthorization } from "@/lib/spotify/auth";
import { disconnectSpotify, useSpotifyConnected } from "@/lib/spotify/useConnection";

/**
 * Profile: two halves, kept visually distinct on purpose.
 *
 * The top half is real — the settings there are written to localStorage and
 * actually consumed (/run seeds its announcement interval from one, /historico
 * formats distances with the other). The bottom half is the race-goal mockup,
 * which persists nothing yet and is labelled as such rather than pretending.
 */

const UNITS: { value: DistanceUnit; label: string; hint: string }[] = [
  { value: "km", label: "Quilômetros", hint: "km · min/km" },
  { value: "mi", label: "Milhas", hint: "mi · min/mi" },
];

/** Shared look for the segmented selectors — big targets, single accent. */
function SegmentedButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 flex-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-foreground hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Spotify: read-only, on purpose. It shows what was playing during a run —
 * nothing here plays, pauses, or skips anything, so a free account works the
 * same as Premium. Needs a Client ID the product owner registers themselves
 * (developer.spotify.com/dashboard); until then this degrades to an
 * explanation instead of a broken button.
 */
function SpotifyCard() {
  const connected = useSpotifyConnected();
  const configured = isConfigured();

  return (
    <Card className="pr-enter" style={delay(135)}>
      <CardTitle
        aside={
          configured ? (
            <NoticeBadge>{connected ? "conectado" : "não conectado"}</NoticeBadge>
          ) : (
            <ExampleBadge>não configurado</ExampleBadge>
          )
        }
      >
        Spotify
      </CardTitle>
      <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
        Mostra a(s) música(s) que estavam tocando durante a corrida, no resumo do final. Só
        leitura — o Pegasus Run nunca toca, pausa ou pula nada, então funciona em conta free ou
        Premium.
      </p>
      {!configured ? (
        <p className="text-xs leading-relaxed text-muted">
          Falta configurar o app no painel do Spotify (Client ID em
          <code className="mx-1 rounded bg-background px-1 py-0.5 text-[11px]">
            NEXT_PUBLIC_SPOTIFY_CLIENT_ID
          </code>
          ).
        </p>
      ) : connected ? (
        <button
          type="button"
          onClick={disconnectSpotify}
          className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-bad hover:text-bad"
        >
          Desconectar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void startAuthorization()}
          className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground"
        >
          Conectar Spotify
        </button>
      )}
    </Card>
  );
}

export default function PerfilPage() {
  /** Writes immediately — no save button to forget on the way out the door. */
  const [prefs, update] = usePreferences();

  // Mockup fields: editable so the layout can be judged, but nothing is stored.
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");

  return (
    <>
      <ScreenHeader
        title="Perfil"
        subtitle="Preferências que já valem de verdade, e o que ainda é maquete."
      />

      <Screen>
        <Card className="pr-enter" style={delay(60)}>
          <CardTitle aside={<NoticeBadge>salvo neste aparelho</NoticeBadge>}>
            Preferências de corrida
          </CardTitle>

          <fieldset>
            <legend className="text-sm font-medium">Aviso por voz a cada</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Valor inicial da tela de corrida. Dá pra mudar antes de cada treino.
            </p>
            <div className="mt-3 flex gap-2">
              {ANNOUNCE_OPTIONS.map((meters) => (
                <SegmentedButton
                  key={meters}
                  selected={prefs.announceIntervalMeters === meters}
                  onClick={() => update({ announceIntervalMeters: meters })}
                >
                  {announceLabel(meters)}
                </SegmentedButton>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6 border-t border-border pt-5">
            <legend className="text-sm font-medium">Unidade de distância</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Aplicada no histórico. A tela de corrida segue em km enquanto o tracking está em
              validação.
            </p>
            <div className="mt-3 flex gap-2">
              {UNITS.map((unit) => (
                <SegmentedButton
                  key={unit.value}
                  selected={prefs.distanceUnit === unit.value}
                  onClick={() => update({ distanceUnit: unit.value })}
                >
                  <span className="block">{unit.label}</span>
                  <span className="mt-0.5 block font-mono text-[10px] opacity-70">
                    {unit.hint}
                  </span>
                </SegmentedButton>
              ))}
            </div>
          </fieldset>
        </Card>

        <SpotifyCard />

        <Card className="pr-enter" style={delay(110)}>
          <CardTitle aside={<ExampleBadge>ainda não salva</ExampleBadge>}>
            Meta de prova
          </CardTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Maquete de tela. Dá pra digitar pra ver o formato, mas nada aqui é gravado ainda —
            some ao recarregar. Vai passar a valer quando o plano de treino existir e precisar
            desses dados.
          </p>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Prova alvo</span>
            <input
              type="text"
              value={raceName}
              onChange={(event) => setRaceName(event.target.value)}
              placeholder="Ex.: Meia de São Paulo"
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="mt-4 block space-y-1.5">
            <span className="text-sm font-medium">Data da prova</span>
            <input
              type="date"
              value={raceDate}
              onChange={(event) => setRaceDate(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm tabular-nums outline-none focus:border-accent"
            />
          </label>

          <Link
            href="/plano"
            className="mt-4 inline-block text-sm text-accent underline underline-offset-2"
          >
            Ver a prévia do plano semanal
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(160)}>
          <CardTitle>Card pra compartilhar</CardTitle>
          <Link href="/compartilhar" className="block rounded-xl focus:outline-accent">
            <ShareCardTeaser />
            <span className="mt-4 block w-full rounded-full border border-border bg-background px-6 py-3.5 text-center text-sm font-semibold">
              Abrir prévia do card
            </span>
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(210)}>
          <CardTitle>Seus dados</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            Corridas e preferências ficam no armazenamento deste aparelho, offline. Não há
            conta, login nem envio pra servidor — e por isso também não há sincronização entre
            aparelhos ainda.
          </p>
        </Card>
      </Screen>
    </>
  );
}
