import Link from "next/link";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader, Stat } from "../ui";
import { EvidenceFactRow } from "../evidence-row";
import {
  DECISION_TOPICS_IN_DISPLAY_ORDER,
  EVIDENCE_FACTS,
  getEvidenceForTopicRanked,
  topicLabel,
} from "@/lib/evidence";

/**
 * Every citation the plan engine can point to, browsable directly — not a
 * client component, not a hook in sight: the whole page is a pure render of
 * `EVIDENCE_FACTS`, so it ships without JS. The rest of the app only ever
 * shows the one or two facts relevant to whatever decision is on screen;
 * this is the place that proves the other 20-odd aren't hiding.
 */

const STRENGTH_COUNTS = { forte: 0, moderada: 0, consenso: 0, mito: 0 };
for (const fact of EVIDENCE_FACTS) STRENGTH_COUNTS[fact.strength] += 1;

export default function EstudosPage() {
  return (
    <>
      <ScreenHeader
        title="Estudos"
        badge={<NoticeBadge>fontes reais</NoticeBadge>}
        subtitle="Toda citação usada em algum lugar do app, numa lista só — cada uma foi buscada e lida, não lembrada de memória. Sem link é porque a fonte é um livro/currículo protegido; citamos o achado, não copiamos o texto."
      />

      <Screen>
        <Card className="pr-enter" style={delay(40)}>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Estudos" value={String(EVIDENCE_FACTS.length)} />
            <Stat label="Fortes" value={String(STRENGTH_COUNTS.forte)} />
            <Stat label="Moderadas" value={String(STRENGTH_COUNTS.moderada)} />
            <Stat label="Mitos" value={String(STRENGTH_COUNTS.mito)} />
          </div>
        </Card>

        {DECISION_TOPICS_IN_DISPLAY_ORDER.map((topic, index) => {
          const facts = getEvidenceForTopicRanked(topic);
          if (facts.length === 0) return null;
          return (
            <Card key={topic} className="pr-enter" style={delay(80 + index * 25)}>
              <CardTitle aside={<NoticeBadge>{facts.length}</NoticeBadge>}>
                {topicLabel(topic)}
              </CardTitle>
              <ul className="flex flex-col gap-3">
                {facts.map((fact) => (
                  <EvidenceFactRow key={fact.id} fact={fact} />
                ))}
              </ul>
            </Card>
          );
        })}

        <p className="pr-enter text-center text-xs leading-relaxed text-muted text-pretty" style={delay(80 + DECISION_TOPICS_IN_DISPLAY_ORDER.length * 25)}>
          Nenhum número aqui vem de um modelo de IA. O motor de plano (
          <Link href="/plano" className="underline underline-offset-2 hover:text-accent">
            /plano
          </Link>
          ) é aritmética sobre essas fontes — cada decisão que ele toma aponta pra uma linha
          acima.
        </p>
      </Screen>
    </>
  );
}
