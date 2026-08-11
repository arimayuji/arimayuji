import Link from "next/link";

const PILLARS = [
  { title: "Preço travado", body: "Nenhuma feature grátis vira paga depois. Seu histórico é seu para sempre." },
  { title: "GPS em que dá pra confiar", body: "Filtro de posição e pace pensado para não oscilar durante a corrida." },
  { title: "Seus dados, seu controle", body: "Export livre. Sem lock-in." },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pegasus Run</p>
          <h1 className="text-balance text-4xl font-semibold sm:text-5xl">
            Pace estável. Sem letra miúda.
          </h1>
          <p className="mx-auto max-w-md text-pretty text-muted">
            Grave sua corrida com aviso de pace por voz a cada trecho e previsão de chegada em
            tempo real &mdash; construído para resolver o que os apps de corrida fazem mal.
          </p>
        </div>
        <Link
          href="/run"
          className="rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Começar a correr
        </Link>
      </section>

      <section className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="bg-background px-6 py-8">
            <h2 className="font-semibold">{pillar.title}</h2>
            <p className="mt-2 text-sm text-muted">{pillar.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
