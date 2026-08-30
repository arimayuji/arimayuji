/**
 * Aquecimento (pré-corrida) e Alongamento (pós-corrida) guiados —
 * conteúdo fixo, fundamentado nos fatos já curados em `evidence/facts.ts`
 * (nunca citado inline aqui — só o `evidenceTopic` de cada passo, usado
 * pra linkar pra `/estudos` no navegador externo, mesmo padrão que
 * `/plano` já usa).
 *
 * As duas rotinas não são a mesma coisa em ordem diferente: aquecimento
 * pré-corrida é sempre dinâmico (`dynamic-warmup-beats-static`,
 * `static-stretch-pre-run-hurts-performance` — alongar estático antes de
 * correr de fato piora performance). Alongamento estático pertence ao
 * pós-corrida (`post-session-is-where-static-stretch-belongs`), com uma
 * caminhada leve de cooldown antes dele
 * (`acsm-session-structure-5-10-min`).
 */
import type { DecisionTopic } from "./evidence/types";

export interface WarmupStep {
  id: string;
  name: string;
  durationSeconds: number;
  /** Curto, em texto — sem imagem/vídeo de demonstração de propósito (ver SOCIAL-CONTEXT.md: nunca gerar por IA a forma/técnica de exercício). */
  instruction: string;
  evidenceTopic?: DecisionTopic;
}

export interface WarmupRoutine {
  id: "aquecimento" | "alongamento";
  title: string;
  /** Uma frase curta explicando o porquê — nunca a citação bruta, só o resumo; a citação de verdade mora em /estudos. */
  rationale: string;
  steps: WarmupStep[];
}

export const WARMUP_ROUTINE: WarmupRoutine = {
  id: "aquecimento",
  title: "Aquecimento antes de correr",
  rationale: "Movimento dinâmico — nunca alongamento parado, que na real piora a performance se feito antes de correr.",
  steps: [
    {
      id: "caminhada-rapida",
      name: "Caminhada rápida",
      durationSeconds: 60,
      instruction: "Caminhe num ritmo acelerado, braços se movendo naturalmente, pra elevar a temperatura do corpo aos poucos.",
      evidenceTopic: "warmup",
    },
    {
      id: "trote-leve",
      name: "Trote leve",
      durationSeconds: 90,
      instruction: "Trote bem tranquilo, respiração confortável — ainda não é a corrida, só continuar subindo a temperatura.",
      evidenceTopic: "warmup",
    },
    {
      id: "balanco-perna-direita",
      name: "Balanço de perna (direita)",
      durationSeconds: 30,
      instruction: "Apoiado em algo estável, balance a perna direita pra frente e pra trás, amplitude controlada, sem forçar.",
      evidenceTopic: "warmup",
    },
    {
      id: "balanco-perna-esquerda",
      name: "Balanço de perna (esquerda)",
      durationSeconds: 30,
      instruction: "Mesmo movimento, agora com a perna esquerda.",
      evidenceTopic: "warmup",
    },
    {
      id: "joelho-alto",
      name: "Joelho alto",
      durationSeconds: 30,
      instruction: "Corrida no lugar (ou avançando devagar) levantando bem o joelho a cada passada, ritmo controlado.",
      evidenceTopic: "warmup",
    },
    {
      id: "chute-no-gluteo",
      name: "Chute no glúteo",
      durationSeconds: 30,
      instruction: "Corrida leve levando o calcanhar em direção ao glúteo a cada passada.",
      evidenceTopic: "warmup",
    },
    {
      id: "afundo-caminhando",
      name: "Afundo caminhando",
      durationSeconds: 30,
      instruction: "Dê um passo longo à frente, desça até o joelho de trás quase tocar o chão, e continue alternando as pernas andando.",
      evidenceTopic: "warmup",
    },
    {
      id: "arrancada-curta",
      name: "Arrancada curta",
      durationSeconds: 30,
      instruction: "Uma aceleração curta e controlada, só pra ligar o corpo pro ritmo de corrida — não é um sprint máximo.",
      evidenceTopic: "warmup",
    },
  ],
};

export const STRETCH_ROUTINE: WarmupRoutine = {
  id: "alongamento",
  title: "Alongamento depois de correr",
  rationale: "Caminhada leve primeiro, depois alongamento estático — não é pra evitar dor no dia seguinte, é ganho de mobilidade a longo prazo.",
  steps: [
    {
      id: "caminhada-cooldown",
      name: "Caminhada leve",
      durationSeconds: 120,
      instruction: "Caminhe num ritmo bem tranquilo, deixando a frequência cardíaca baixar antes de parar de vez.",
      evidenceTopic: "cooldown",
    },
    {
      id: "panturrilha-direita",
      name: "Panturrilha (perna direita)",
      durationSeconds: 30,
      instruction: "De frente pra uma parede, perna direita atrás e esticada, calcanhar no chão, incline o corpo à frente até sentir o alongamento na panturrilha.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "panturrilha-esquerda",
      name: "Panturrilha (perna esquerda)",
      durationSeconds: 30,
      instruction: "Mesmo alongamento, agora com a perna esquerda atrás.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "posterior-coxa-direita",
      name: "Posterior de coxa (perna direita)",
      durationSeconds: 30,
      instruction: "Sentado ou em pé, perna direita esticada à frente, incline o tronco em direção ao pé sem forçar o joelho.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "posterior-coxa-esquerda",
      name: "Posterior de coxa (perna esquerda)",
      durationSeconds: 30,
      instruction: "Mesmo alongamento, agora com a perna esquerda.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "quadriceps-direita",
      name: "Quadríceps (perna direita)",
      durationSeconds: 30,
      instruction: "Em pé, segure o pé direito atrás do corpo com a mão do mesmo lado, joelhos juntos, puxe o calcanhar em direção ao glúteo.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "quadriceps-esquerda",
      name: "Quadríceps (perna esquerda)",
      durationSeconds: 30,
      instruction: "Mesmo alongamento, agora com a perna esquerda.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "gluteo-direita",
      name: "Glúteo (perna direita)",
      durationSeconds: 30,
      instruction: "Deitado ou sentado, cruze o tornozelo direito sobre o joelho esquerdo e puxe a coxa esquerda em direção ao peito.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "gluteo-esquerda",
      name: "Glúteo (perna esquerda)",
      durationSeconds: 30,
      instruction: "Mesmo alongamento, invertendo os lados.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "flexor-quadril-direita",
      name: "Flexor do quadril (perna direita)",
      durationSeconds: 30,
      instruction: "Ajoelhado com o joelho direito no chão e o pé esquerdo à frente apoiado no chão, empurre o quadril pra frente mantendo o tronco ereto, até sentir o alongamento na frente do quadril direito.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "flexor-quadril-esquerda",
      name: "Flexor do quadril (perna esquerda)",
      durationSeconds: 30,
      instruction: "Mesmo alongamento, agora com o joelho esquerdo no chão e o pé direito à frente.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "alongamento-lateral-tronco-direito",
      name: "Alongamento lateral do tronco (lado direito)",
      durationSeconds: 30,
      instruction: "Em pé, braço direito esticado por cima da cabeça, incline o tronco pra esquerda sem girar o quadril, até sentir o alongamento na lateral direita do corpo.",
      evidenceTopic: "static_stretch_post",
    },
    {
      id: "alongamento-lateral-tronco-esquerdo",
      name: "Alongamento lateral do tronco (lado esquerdo)",
      durationSeconds: 30,
      instruction: "Mesmo alongamento, braço esquerdo por cima da cabeça, inclinando pro lado direito.",
      evidenceTopic: "static_stretch_post",
    },
  ],
};

export function totalDurationSeconds(steps: WarmupStep[]): number {
  return steps.reduce((sum, step) => sum + step.durationSeconds, 0);
}

export function routineByType(tipo: "aquecimento" | "alongamento"): WarmupRoutine {
  return tipo === "alongamento" ? STRETCH_ROUTINE : WARMUP_ROUTINE;
}
