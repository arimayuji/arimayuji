"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { SCENARIOS, ShareCard, type ScenarioId } from "../share-card";

/**
 * Share-card preview.
 *
 * Reached from /perfil (and from the post-run summary), outside the tab bar
 * because it is a detail view, not a destination — the Perfil tab stays lit.
 *
 * The scenario picker and the photo upload below are both real: swapping in
 * the illustrated background or your own photo genuinely works. What's still
 * a mockup is everything else — the route and the numbers.
 */

const PENDING = [
  {
    title: "Traçado animado",
    detail:
      "O percurso vai ser desenhado em movimento, do início ao fim da corrida. Esta prévia é estática.",
  },
  {
    title: "Números reais",
    detail:
      "Distância, tempo e pace virão da corrida que você escolher no histórico. Os desta tela são inventados.",
  },
];

const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export default function CompartilharPage() {
  const [scenario, setScenario] = useState<ScenarioId>("madrugada");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Revokes the *previous* object URL whenever it's replaced or the screen
  // unmounts — the cleanup closes over the value from the render it belongs
  // to, so this never revokes the URL that's actually in use.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoUrl(URL.createObjectURL(file));
  }

  return (
    <>
      <div className="px-5 pt-6">
        <div className="mx-auto w-full max-w-md">
          <Link href="/perfil" className="text-sm text-muted hover:text-foreground">
            &larr; Perfil
          </Link>
        </div>
      </div>

      <ScreenHeader
        title="Card pra compartilhar"
        badge={<ExampleBadge>prévia estática</ExampleBadge>}
        subtitle="Como a corrida vira imagem. Ainda não é possível gerar o card de verdade."
      />

      <Screen>
        <div className="pr-enter mx-auto w-full max-w-[300px]" style={delay(80)}>
          <ShareCard scenario={scenario} photoUrl={photoUrl ?? undefined} />
        </div>

        <p className="pr-enter text-center text-xs leading-relaxed text-muted" style={delay(140)}>
          Percurso, distância, tempo e pace acima são de demonstração — não são de nenhuma
          corrida real.
        </p>

        <Card className="pr-enter" style={delay(170)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Sua foto</CardTitle>
          <p className="text-xs leading-relaxed text-muted text-pretty">
            Suba uma foto da sua corrida pra usar como fundo do card, no lugar de um cenário
            desenhado.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label
              htmlFor="share-photo-input"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-accent"
            >
              {photoUrl ? "Trocar foto" : "Escolher foto"}
            </label>
            <input
              id="share-photo-input"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePhotoChange}
            />
            {photoUrl && (
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-muted transition-colors hover:border-warn hover:text-warn"
              >
                Remover foto
              </button>
            )}
          </div>
        </Card>

        <Card className={`pr-enter ${photoUrl ? "opacity-50" : ""}`} style={delay(185)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>
            Cenário de fundo
          </CardTitle>
          {photoUrl && (
            <p className="mb-3 text-xs text-muted">
              Desativado enquanto uma foto está selecionada.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                type="button"
                disabled={!!photoUrl}
                onClick={() => setScenario(id)}
                aria-pressed={scenario === id}
                className={`min-h-14 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  scenario === id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground hover:border-accent disabled:hover:border-border"
                }`}
              >
                <span className="block">{SCENARIOS[id].label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  {SCENARIOS[id].hint}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="pr-enter mt-2" style={delay(200)}>
          <CardTitle>O que falta pra ficar de pé</CardTitle>
          <ul className="flex flex-col gap-4">
            {PENDING.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted text-pretty">
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <button
          type="button"
          disabled
          className="pr-enter min-h-14 w-full cursor-not-allowed rounded-full border border-border bg-surface px-6 py-4 text-base font-semibold text-muted"
          style={delay(260)}
        >
          Compartilhar — em breve
        </button>
      </Screen>
    </>
  );
}
