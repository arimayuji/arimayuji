import Link from "next/link";
import { Card, CardTitle, delay, ExampleBadge, Screen, ScreenHeader } from "../ui";
import { ShareCard } from "../share-card";

/**
 * Share-card preview.
 *
 * Reached from /perfil (and from the post-run summary), outside the tab bar
 * because it is a detail view, not a destination — the Perfil tab stays lit.
 * The card itself is a still image: no photo picker, no route animation, no
 * export. Those come after the recording pipeline is validated on real runs.
 */

const PENDING = [
  {
    title: "Sua foto de fundo",
    detail:
      "O fundo aqui é um desenho provisório. Na versão final você escolhe uma foto da corrida e o traçado se ajusta a ela.",
  },
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

export default function CompartilharPage() {
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
          <ShareCard />
        </div>

        <p className="pr-enter text-center text-xs leading-relaxed text-muted" style={delay(140)}>
          Percurso, distância, tempo e pace acima são de demonstração — não são de nenhuma
          corrida real.
        </p>

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

        <div className="pr-enter flex flex-col gap-3" style={delay(260)}>
          <button
            type="button"
            disabled
            className="min-h-14 w-full cursor-not-allowed rounded-full border border-border bg-surface px-6 py-4 text-base font-semibold text-muted"
          >
            Trocar foto de fundo — em breve
          </button>
          <button
            type="button"
            disabled
            className="min-h-14 w-full cursor-not-allowed rounded-full border border-border bg-surface px-6 py-4 text-base font-semibold text-muted"
          >
            Compartilhar — em breve
          </button>
        </div>
      </Screen>
    </>
  );
}
