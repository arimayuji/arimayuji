/**
 * "Lugares pra correr" — the curated seed list, same pattern as
 * `src/lib/evidence/facts.ts`: a hand-researched static array shipped with
 * the app, not a database table. Every place here was actually researched
 * (real hours, real infrastructure, real safety reporting where it
 * exists) — nothing is filler. Per-person community ratings are a
 * separate, live layer on top of this (see `src/lib/placeRatings.ts`);
 * this file is just the honest starting point before any of those exist.
 *
 * Criteria are 1–5, each with a specific justification — never a bare
 * number with no reasoning, matching the evidence base's own rule that a
 * score without a "why" isn't trustworthy.
 */

export interface CriteriaScore {
  score: number;
  note: string;
}

export interface PlaceCriteria {
  seguranca: CriteriaScore;
  percurso: CriteriaScore;
  estrutura: CriteriaScore;
  iluminacao: CriteriaScore;
  fluxo: CriteriaScore;
}

export interface RunningPlace {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  description: string;
  criteria: PlaceCriteria;
  bestTime: string;
  /** Null for a linear route (no natural loop) or when no reliable figure exists. */
  loopDistanceMeters: number | null;
  /** Real safety caveat worth surfacing prominently — omitted when there isn't one. */
  safetyFlag?: string;
  sources: string[];
}

/** Cities with real researched entries. Anything else shown in the filter is "em breve". */
export const CITIES_WITH_PLACES = ["São Paulo"] as const;

export const RUNNING_PLACES: RunningPlace[] = [
  {
    id: "parque-ibirapuera",
    name: "Parque Ibirapuera",
    city: "São Paulo",
    neighborhood: "Vila Mariana / Moema · Zona Sul",
    description:
      "O parque urbano mais frequentado de São Paulo, com três circuitos: a Volta do Lago (asfalto, plana), a Pista de Cooper (terra batida, marcação a cada 100m) e a Volta da Grade. Aberto das 5h à 0h — praticamente o único parque grande onde dá pra treinar antes do trabalho e depois do expediente.",
    criteria: {
      seguranca: {
        score: 4,
        note: "Parque concedido à Urbia, com equipe própria e fluxo altíssimo de gente desde as 5h — o volume de pessoas é, na prática, o principal fator de segurança. Áreas periféricas da Volta da Grade são bem menos movimentadas que o miolo.",
      },
      percurso: {
        score: 5,
        note: "A maior variedade de percursos da cidade em um só lugar: Volta do Lago (~3km, asfalto plano), Pista de Cooper (1,2–1,5km, terra batida, marcada a cada 100m), Volta da Grade (~6km, terra/grama, leve ondulação).",
      },
      estrutura: {
        score: 5,
        note: "16 banheiros reformados, vestiário com chuveiro (Arena Centauro, ~R$30/10min), estacionamento, ambulatório médico, marcação de distância na Pista de Cooper.",
      },
      iluminacao: {
        score: 4,
        note: "Opera até meia-noite com portões principais abertos até 23h — mas o trecho de terra da Volta da Grade, na periferia do parque, é claramente menos iluminado que a Volta do Lago.",
      },
      fluxo: {
        score: 2,
        note: "Ponto fraco real: a Volta do Lago engarrafa no pico (7h-8h) e em fins de semana. Conflito documentado entre ciclista, corredor e pedestre — o limite de 20km/h pra bikes existe porque é desrespeitado.",
      },
    },
    bestTime: "Dia de semana, 5h30–6h30, antes do pico das 7h",
    loopDistanceMeters: 3000,
    sources: [
      "https://ibirapuera.org/correr/percursos-e-caminhos/",
      "https://prefeitura.sp.gov.br/web/meio_ambiente/w/parques/regiao_sul/14062",
    ],
  },
  {
    id: "parque-villa-lobos",
    name: "Parque Villa-Lobos",
    city: "São Paulo",
    neighborhood: "Alto de Pinheiros · Zona Oeste",
    description:
      "Pista perimetral plana e larga, principal alternativa ao Ibirapuera pra quem treina distância. Abriga uma companhia da Polícia Militar dentro do parque. Fecha às 19h — não serve pra quem corre à noite.",
    criteria: {
      seguranca: {
        score: 4,
        note: "Abriga a 1ª Cia do 23º BPM/M dentro da área, com policiamento ciclístico — provavelmente a melhor estrutura de segurança entre os parques de SP.",
      },
      percurso: {
        score: 4,
        note: "Anel principal de ~3,5km, plano e largo, mais pistas de cooper sinalizadas por cor. Bem mais exposto ao sol que o Ibirapuera, quase sem variação de altimetria.",
      },
      estrutura: {
        score: 4,
        note: "Bebedouros ao lado da pista, sanitários acessíveis, estacionamento com 750 vagas — mas lota a partir das 9h no fim de semana.",
      },
      iluminacao: {
        score: 1,
        note: "Fecha às 19h — não é questão de qualidade da luz, é que o parque simplesmente não opera à noite na maior parte do ano.",
      },
      fluxo: {
        score: 3,
        note: "~3 mil visitantes em dia útil contra ~20-25 mil em fim de semana. Confortável de segunda a sexta, congestionado domingo de manhã.",
      },
    },
    bestTime: "Dia de semana, 5h30–7h, logo na abertura",
    loopDistanceMeters: 3500,
    sources: ["https://pt.wikipedia.org/wiki/Parque_Estadual_Villa-Lobos"],
  },
  {
    id: "parque-do-povo",
    name: "Parque do Povo – Mário Pimenta Camargo",
    city: "São Paulo",
    neighborhood: "Itaim Bibi / Vila Olímpia · Zona Sul",
    description:
      "Parque do trabalhador de escritório, entre Itaim e Vila Olímpia. Pista curta (~1,5km) que lota no fim de tarde. Funciona até 22h — uma das poucas opções pra correr à noite na Zona Sul.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Alto movimento e horário estendido ajudam dentro do parque — mas a ciclopassarela de acesso, na Vila Olímpia, é apontada nominalmente (reportagem de jan/2025) como um dos trechos com mais roubos contra ciclistas e corredores da cidade.",
      },
      percurso: {
        score: 2,
        note: "Pista curta (~1,5km), plana, sem variação — serve pra treino leve ou pouco tempo. Arborização ainda em formação, pouca sombra.",
      },
      estrutura: {
        score: 3,
        note: "Sanitários, quadras, aparelhos de ginástica, ciclovia. Não confirmei bebedouros ao longo da pista em fonte oficial.",
      },
      iluminacao: {
        score: 4,
        note: "Opera até 22h, descrito por guias locais como bem iluminado — mas não achei confirmação oficial do padrão de iluminação.",
      },
      fluxo: {
        score: 3,
        note: "Lota das 18h às 20h com quem sai do escritório. Pista curta faz a sensação de aglomeração aparecer rápido nesse horário.",
      },
    },
    bestTime: "Manhã cedo (6h-7h30) ou noite após 20h30, quando o pico de saída do trabalho já passou",
    loopDistanceMeters: 1500,
    safetyFlag:
      "Roubos reportados na ciclopassarela de acesso ao parque, na Vila Olímpia (jan/2025) — o parque em si é razoável, a conexão com a Marginal não é.",
    sources: [
      "https://prefeitura.sp.gov.br/web/meio_ambiente/w/parques/regiao_centrooeste/22396",
      "https://www.acre.com.br/ciclistas-reclamam-de-roubos-na-ciclovia-do-rio-pinheiros-31-01-2025-cotidiano/",
    ],
  },
  {
    id: "avenida-paulista",
    name: "Avenida Paulista",
    city: "São Paulo",
    neighborhood: "Bela Vista / Jardim Paulista · Centro-Sul",
    description:
      "2,8km corridos nas calçadas ou na ciclovia central. Fecha pra carros aos domingos (Ruas Abertas), mas a janela foi reduzida em 2023 pra 9h–16h — horário de calor e multidão, pior pra treino do que a madrugada de um dia útil.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Uma das vias mais vigiadas da cidade, ativa quase 24h — mas é região central, com furto de celular/relógio como crime cotidiano. Avaliação genuinamente dividida, sem dado específico sobre corredores.",
      },
      percurso: {
        score: 2,
        note: "Linear, sem volta fechada, com semáforo e travessia o tempo todo — impossível manter ritmo cronometrado com consistência.",
      },
      estrutura: {
        score: 2,
        note: "Nenhum bebedouro ou banheiro dedicado a corredor. O Sesc Avenida Paulista oferece treino gratuito (projeto Re(Correr)), mas isso é do entorno, não da via.",
      },
      iluminacao: {
        score: 5,
        note: "Uma das vias mais bem iluminadas de SP, contínua a qualquer hora — o maior trunfo pra quem corre de madrugada.",
      },
      fluxo: {
        score: 2,
        note: "Ruas Abertas (domingo) foi cortado de 8h–18h pra 9h–16h em out/2023 — horário de pico de gente, não de treino. Dia de semana, calçada disputada com pedestre em deslocamento.",
      },
    },
    bestTime: "Dia de semana, 5h30–6h30 — o único horário em que a via funciona como pista de verdade",
    loopDistanceMeters: null,
    sources: [
      "https://prefeitura.sp.gov.br/w/noticia/prefeitura-padroniza-horario-do-ruas-abertas-das-9h-as-16h-na-paulista-e-liberdade",
    ],
  },
  {
    id: "parque-agua-branca",
    name: "Parque da Água Branca",
    city: "São Paulo",
    neighborhood: "Água Branca / Barra Funda · Zona Oeste",
    description:
      "Clima bucólico incomum pra região da Barra Funda — árvores grandes, lagos, feira orgânica. Circuito interno de ~1,1km com trecho de areia. Bom pra corrida leve e sombreada, pequeno demais pra treino longo.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Parque estadual fechado, com portaria e público familiar constante. Entorno (Barra Funda) tem movimento mais irregular fora do horário comercial.",
      },
      percurso: {
        score: 2,
        note: "Circuito curto (~1,1km) com trecho de areia — bom pra variar estímulo, pequeno demais pra treino longo sem repetir muitas voltas.",
      },
      estrutura: {
        score: 4,
        note: "Bebedouros distribuídos, banheiros adaptados, rampas de acesso, quiosques. Atrativos extras (aquário, museu geológico) ajudam a virar programa, não só treino.",
      },
      iluminacao: {
        score: 2,
        note: "O parque afirma ter iluminação noturna, mas fecha às 20h (uma fonte cita 22h) — sobra pouca janela de corrida realmente noturna.",
      },
      fluxo: {
        score: 4,
        note: "Bem mais tranquilo que Ibirapuera/Villa-Lobos — uso predominantemente familiar e contemplativo, sem aglomeração de corredor.",
      },
    },
    bestTime: "Manhã de dia útil, logo na abertura às 6h",
    loopDistanceMeters: 1100,
    sources: ["https://www.saopaulo.sp.gov.br/conhecasp/parques-e-reservas-naturais/parque-da-agua-branca/"],
  },
  {
    id: "cidade-universitaria-usp",
    name: "Cidade Universitária USP / Raia Olímpica",
    city: "São Paulo",
    neighborhood: "Butantã · Zona Oeste",
    description:
      "O maior ponto de encontro de corrida de SP aos sábados de manhã, na Av. Prof. Mello Moraes ao redor da Raia Olímpica (~2,1km). Acesso livre, espaço enorme e plano — mas com histórico real de ocorrências criminais que precisa ser dito.",
    criteria: {
      seguranca: {
        score: 2,
        note: "163 ocorrências de furto/roubo/sequestro registradas no campus entre jan-out/2023, com casos violentos documentados. Correr em grupo à luz do dia muda o quadro; sozinho em trecho isolado, não. Nota baixa é deliberada, reflete o que está documentado.",
      },
      percurso: {
        score: 4,
        note: "Os melhores percursos longos e planos da Zona Oeste — Raia Olímpica de 2.200x100m, volta completa de ~4km, muita árvore em parte do trajeto.",
      },
      estrutura: {
        score: 2,
        note: "Acesso à raia em si é controlado (alambrado). Sem bebedouro público confirmado ao longo da avenida — leve sua própria hidratação. Estacionamento abundante e grátis.",
      },
      iluminacao: {
        score: 2,
        note: "Avenida frequentada das 6h à meia-noite, mas dado o histórico de ocorrências, corrida noturna solo não é recomendada — nota reflete o risco, não a iluminação em si.",
      },
      fluxo: {
        score: 4,
        note: "Espaço muito amplo — mesmo cheio, raramente disputa espaço. Sábado de manhã concentra assessorias e grupos, mas com largura de sobra.",
      },
    },
    bestTime: "Sábado ou domingo, 7h-9h, junto com os grupos de corrida — nunca sozinho à noite",
    loopDistanceMeters: 4000,
    safetyFlag:
      "163 ocorrências de furto/roubo/sequestro no campus entre jan-out de 2023. Vá em grupo, evite trechos isolados e horário noturno.",
    sources: ["https://cepe.usp.br/infraestrutura/13-raia-olimpica/"],
  },
  {
    id: "marginal-pinheiros-bruno-covas",
    name: "Marginal Pinheiros – Parque Bruno Covas",
    city: "São Paulo",
    neighborhood: "Margens do Rio Pinheiros · Zona Oeste/Sul",
    description:
      "O trecho plano mais longo e contínuo de São Paulo — 8,2km no Parque Bruno Covas, 21,5km na ciclovia da outra margem. É onde a cidade treina maratona. Também é o lugar desta lista com o problema de segurança mais concreto e recente.",
    criteria: {
      seguranca: {
        score: 2,
        note: "Reportagem de jan/2025 documenta assaltos violentos contra ciclistas e corredores, com trechos nomeados: ciclopassarela do Parque do Povo (Vila Olímpia) e o intervalo Granja Julieta–Ponte Octavio Frias (Morumbi), sobretudo fim de tarde.",
      },
      percurso: {
        score: 4,
        note: "8,2km contínuos e totalmente planos, sem semáforo, sem travessia — ideal pra rodagem longa. Contras: quase sem sombra, visual monótono, barulho da Marginal ao lado.",
      },
      estrutura: {
        score: 3,
        note: "Pontos de apoio na ciclovia (banheiro, chuveiro, recarga de celular) entre os acessos principais. Playground e mirante no lado do parque — mas sem bebedouro confirmado ao longo dos 8,2km.",
      },
      iluminacao: {
        score: 1,
        note: "Fecha às 18h30-22h — mas o fim de tarde é justamente o horário de maior risco de assalto reportado. Uso seguro se limita à luz do dia.",
      },
      fluxo: {
        score: 3,
        note: "Espaço compartilhado com ciclista em velocidade, mas a extensão é tão grande que não há aglomeração como nos parques.",
      },
    },
    bestTime: "Manhã, 6h-9h — evite fim de tarde/noite e os trechos citados como críticos",
    loopDistanceMeters: null,
    safetyFlag:
      "Assaltos reportados em jan/2025 na ciclopassarela do Parque do Povo e entre Granja Julieta e a Ponte Octavio Frias, sobretudo no fim de tarde. Corra em grupo.",
    sources: ["https://www.acre.com.br/ciclistas-reclamam-de-roubos-na-ciclovia-do-rio-pinheiros-31-01-2025-cotidiano/"],
  },
  {
    id: "parque-aclimacao",
    name: "Parque da Aclimação",
    city: "São Paulo",
    neighborhood: "Aclimação · Centro-Sul",
    description:
      "Parque histórico de 1939 em torno de um lago, com subidas e descidas de verdade — raro nos parques planos de SP. Bom pra treino de força/ladeira sem sair da cidade. Pequeno, público familiar, não é lugar de treino de ritmo.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Cercado, com portaria e horário definido, em bairro residencial consolidado. Sem dado específico verificável — nota intermediária por falta de informação, não por indício negativo.",
      },
      percurso: {
        score: 3,
        note: "Diferencial real: volta do lago com subida, descida e plano — raro na cidade. Fontes divergem entre 960m e 1,5km pro circuito do lago.",
      },
      estrutura: {
        score: 3,
        note: "Pista de cooper, sanitários acessíveis, aparelhos de ginástica, cachorródromo. Sem bebedouro confirmado ao longo da pista.",
      },
      iluminacao: {
        score: 2,
        note: "Funciona das 5h às 20h — abertura cedo ajuda quem corre de madrugada, mas fecha antes do anoitecer.",
      },
      fluxo: {
        score: 3,
        note: "Uso familiar intenso no fim de semana, moderado em dia útil. Pista estreita em pontos, compartilhada com caminhante e cachorro.",
      },
    },
    bestTime: "Dia de semana, 5h-7h — pista vazia e clima fresco, que é quando as subidas rendem",
    loopDistanceMeters: 960,
    sources: ["https://prefeitura.sp.gov.br/web/meio_ambiente/w/parques/regiao_centrooeste/5728"],
  },
  {
    id: "horto-florestal",
    name: "Parque Estadual Alberto Löfgren (Horto Florestal)",
    city: "São Paulo",
    neighborhood: "Horto Florestal · Zona Norte",
    description:
      "Mata Atlântica de verdade dentro da cidade, junto à Serra da Cantareira. Volta de ~2km em torno do lago com trilha de terra e altimetria real — o trail running mais acessível de SP. Fecha cedo, destino exclusivamente diurno.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Parque estadual cercado, com portaria e horário restrito. Trechos de mata podem deixar o corredor isolado de outros frequentadores — sem fonte oficial sobre o esquema de segurança.",
      },
      percurso: {
        score: 4,
        note: "O melhor percurso natural da lista: ~2km em torno do lago, terra batida, ~50m de ganho de altimetria. O parque já sediou provas de até 15km.",
      },
      estrutura: {
        score: 3,
        note: "Estacionamento, sanitários, fraldário, bicas de água potável bastante usadas por quem treina.",
      },
      iluminacao: {
        score: 1,
        note: "Fecha às 18h — sem corrida noturna, ponto final. Trechos de mata fechada significam pouca luz mesmo perto do horário de fechamento.",
      },
      fluxo: {
        score: 4,
        note: "Praticamente vazio em dia útil. Movimento concentrado em manhãs de fim de semana, ainda assim sem congestionamento.",
      },
    },
    bestTime: "Manhã de dia útil ou sábado cedo, 6h-9h — chegue com folga pro fechamento às 18h",
    loopDistanceMeters: 2000,
    sources: ["https://www.saopaulo.sp.gov.br/conhecasp/parques-e-reservas-naturais/horto-florestal/"],
  },
  {
    id: "ceret-tatuape",
    name: "Parque CERET",
    city: "São Paulo",
    neighborhood: "Tatuapé / Jardim Anália Franco · Zona Leste",
    description:
      "A resposta mais concreta pra Zona Leste: pista oficial de atletismo de 400m, gratuita, a opção mais acessível da cidade pra tiro cronometrado de verdade — algo que nenhum outro parque desta lista tem de graça.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Equipamento municipal cercado, com portaria e uso intenso da comunidade do Tatuapé. Sem dado verificável nos dois sentidos — nota intermediária por falta de informação.",
      },
      percurso: {
        score: 4,
        note: "Pista oficial de atletismo de 400m (gratuita, sem agendamento) + circuito de caminhada/corrida com marcação colorida por quilometragem.",
      },
      estrutura: {
        score: 4,
        note: "Banheiros, bebedouros, estacionamento grátis, maior piscina pública da América Latina no mesmo complexo. Pode ser exigida carteirinha dos centros esportivos — confirme antes de ir.",
      },
      iluminacao: {
        score: 3,
        note: "Segunda a sexta até 22h, fim de semana até 20h (Prefeitura) — janela noturna real em dia útil, uma das poucas desta lista.",
      },
      fluxo: {
        score: 3,
        note: "Pico no fim de tarde de dia útil e manhã de fim de semana. A pista de atletismo separa fisicamente quem treina velocidade de quem caminha — vantagem que nenhum parque de acesso livre oferece.",
      },
    },
    bestTime: "Terça a quinta, 19h-21h, pra usar a pista de atletismo (parque abre até 22h em dia útil)",
    loopDistanceMeters: 1600,
    sources: ["https://prefeitura.sp.gov.br/web/esportes/w/ceret/8631"],
  },
];

export function getPlace(id: string): RunningPlace | undefined {
  return RUNNING_PLACES.find((place) => place.id === id);
}

export function getPlacesByCity(city: string): RunningPlace[] {
  return RUNNING_PLACES.filter((place) => place.city === city);
}
