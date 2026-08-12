import type { EvidenceFact } from "./types";

/**
 * Curated from three research passes: general training methodology (VDOT,
 * progression, periodization, overtraining); per the product owner's
 * request, a US-sources-only pass on warm-up/cool-down/prescription; and a
 * follow-up pass deepening topics that had only a single citation (injury
 * risk factors, in-run hydration, cool-down, post-run stretch ROM, taper
 * discipline). Nothing here is invented — every claim traces to a source
 * found during that research, each one fetched and read directly (not
 * recalled from memory) before being added. Add facts by extending this
 * array; there is no build step or embedding index to regenerate.
 */
export const EVIDENCE_FACTS: EvidenceFact[] = [
  // ---------------------------------------------------------------- pace zones
  {
    id: "vdot-pace-zones",
    topic: "pace_zones",
    claim:
      "Um tempo de prova recente pode ser convertido em zonas de pace de treino (fácil, limiar, intervalado, repetição) pela fórmula VDOT de Daniels & Gilbert — um modelo empírico, não uma medição direta de VO2max.",
    strength: "moderada",
    source: {
      name: "Daniels & Gilbert — Oxygen Power (1979); resumo das equações",
      org: "Daniels' Running Formula",
      url: "https://www.letsrun.com/forum/flat_read.php?thread=3704747",
      citable: false,
    },
    caveat:
      "As equações em si (custo de O2 e %VO2max sustentável por duração) são de domínio público; as tabelas impressas do livro são conteúdo protegido — derive numericamente, não copie a tabela. \"VDOT\" é marca registrada, não usar como nome de feature.",
  },
  {
    id: "riegel-race-prediction",
    topic: "race_time_prediction",
    claim:
      "A fórmula de Riegel (T2 = T1 · (D2/D1)^1.06) estima o tempo equivalente em outra distância a partir de uma prova recente; o expoente é ajuste empírico que varia com o nível do atleta (~1.04 em elite, ~1.10–1.12 em baixa quilometragem) e degrada acima da maratona.",
    strength: "moderada",
    source: {
      name: "Riegel, P.S. (1977) — análise de precisão",
      url: "https://www.runpacelab.com/guides/riegel-formula-accuracy/",
      citable: true,
    },
  },

  // ---------------------------------------------------------- volume progression
  {
    id: "ten-percent-rule-rct-null",
    topic: "volume_progression",
    claim:
      "A regra dos 10% (aumentar o volume semanal em no máximo 10%) não teve efeito comprovado sobre lesão: um ensaio controlado randomizado comparou progressão de 10%/semana contra um plano bem mais agressivo (~24%/semana) e a taxa de lesão foi estatisticamente igual (20,8% vs 20,3%).",
    strength: "forte",
    source: {
      name: "Buist et al. — GRONORUN, American Journal of Sports Medicine",
      url: "https://www.ovid.com/journals/ajsm/abstract/10.1177/0363546507307505~no-effect-of-a-graded-training-program-on-the-number-of",
      citable: true,
    },
    caveat: "Resultado nulo: o estudo não confirma a regra, refuta que ela reduza lesão sozinha.",
  },
  {
    id: "nielsen-30-percent-2-weeks",
    topic: "volume_progression",
    claim:
      "O sinal real encontrado em estudo prospectivo é um salto de volume acima de 30% em 2 semanas, associado a maior risco de lesões \"de distância\" (HR 1.59); aumentos entre 10% e 30% não diferiram do grupo abaixo de 10%.",
    strength: "moderada",
    source: {
      name: "Nielsen et al. (2014) — Journal of Orthopaedic & Sports Physical Therapy",
      url: "https://www.jospt.org/doi/10.2519/jospt.2014.5164",
      citable: true,
    },
    caveat: "Intervalo de confiança (0.96–2.66) cruza 1 — é sinal, não prova definitiva.",
  },
  {
    id: "volume-vs-intensity-progression-equal-risk",
    topic: "volume_progression",
    claim:
      "Progredir o treino aumentando volume ou aumentando intensidade resultou no mesmo risco de lesão em corredores recreativos.",
    strength: "moderada",
    source: {
      name: "Run Clever RCT",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5841490/",
      citable: true,
    },
  },
  {
    id: "acwr-not-predictive",
    topic: "volume_progression",
    claim:
      "O ACWR (razão de carga aguda:crônica), popular em apps de fitness como métrica de risco, perde a relação preditiva quando tratado como variável contínua em vez de categorizada artificialmente — não há base para usá-lo como regra de segurança.",
    strength: "mito",
    source: {
      name: "Revisão sistemática sobre ACWR",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12487117/",
      citable: true,
    },
  },
  {
    id: "nata-10-percent-grade-c",
    topic: "volume_progression",
    claim:
      "A própria NATA (National Athletic Trainers' Association), em seu posicionamento sobre lesões por overuse, classifica a regra dos 10% e a recomendação de 1–2 dias de descanso por semana como SORT grau C — consenso de especialista, sem estudo forte por trás.",
    strength: "consenso",
    source: {
      name: "NATA Position Statement — Prevention of Pediatric Overuse Injuries",
      org: "National Athletic Trainers' Association",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3070508/",
      citable: true,
    },
  },
  {
    id: "acsm-fitt-vp-gradual-progression",
    topic: "volume_progression",
    claim:
      "A posição oficial do ACSM (FITT-VP, 2011) recomenda ≥150 min/semana de atividade moderada ou ≥75 min/semana vigorosa, e afirma explicitamente que progressão gradual de intensidade e volume pode reduzir os riscos do exercício.",
    strength: "forte",
    source: {
      name: "ACSM Position Stand 2011 — Medicine & Science in Sports & Exercise",
      org: "American College of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/21694556/",
      citable: true,
    },
  },

  // -------------------------------------------------------------- periodization
  {
    id: "80-20-polarized-training",
    topic: "periodization",
    claim:
      "A distribuição 80/20 (~80% do treino em intensidade baixa, ~20% em alta, pouco no meio) tem respaldo observacional em atletas de elite e confirmação em ensaio controlado comparando treino polarizado contra outros modelos de distribuição de intensidade.",
    strength: "moderada",
    source: {
      name: "Seiler; Stöggl & Sperlich — revisão sistemática",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11679080/",
      citable: true,
    },
  },
  {
    id: "long-run-cap-convention",
    topic: "periodization",
    claim:
      "O teto tradicional de ~3 horas / 32 km pro longão de maratona é convenção de treinador — vem de opinião de especialista, não de achado experimental controlado.",
    strength: "consenso",
    source: {
      name: "Discussão de treinadores sobre a origem da regra",
      url: "https://lauranorrisrunning.com/three-hour-long-run-marathon-training/",
      citable: true,
    },
  },
  {
    id: "usatf-periodization-definition",
    topic: "periodization",
    claim:
      "A USATF define periodização, em seu currículo de formação de treinadores, como planejar o treino para produzir alto desempenho em momentos específicos — o currículo detalhado não é público.",
    strength: "consenso",
    source: {
      name: "USATF Coaching Education, Level 1",
      org: "USA Track & Field",
      url: "https://www.usatf.org/programs/coaches/level-1",
      citable: false,
    },
  },

  // ---------------------------------------------------------------------- taper
  {
    id: "taper-2-weeks-exponential",
    topic: "taper",
    claim:
      "O taper mais bem evidenciado é de 2 semanas, com redução exponencial de 41–60% do volume, mantendo intensidade e frequência de treino.",
    strength: "forte",
    source: {
      name: "Bosquet et al. — meta-análise de 27 estudos",
      url: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0282838",
      citable: true,
    },
  },
  {
    id: "strict-taper-beats-relaxed-taper",
    topic: "taper",
    claim:
      "Em dados reais de treino de mais de 158 mil maratonistas recreativos, um taper \"disciplinado\" (queda de volume consistente, sem picos) teve desempenho melhor que um taper \"relaxado\" em qualquer duração testada; um taper disciplinado de 3 semanas rendeu economia mediana de ~2,6% no tempo final — mas 69% dos corredores usam a versão relaxada.",
    strength: "moderada",
    source: {
      name: "Smyth & Lawlor (2021) — Frontiers in Sports and Active Living",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8506252/",
      citable: true,
    },
    caveat:
      "Observacional (dados de treino do Strava), não ensaio controlado — mostra associação; corredores que já tapeiam de forma disciplinada também podem treinar melhor no geral.",
  },

  // --------------------------------------------------------------- overtraining
  {
    id: "ecss-acsm-overtraining-consensus",
    topic: "overtraining",
    claim:
      "O consenso conjunto ECSS/ACSM define um espectro de overreaching funcional → não-funcional → síndrome de overtraining (OTS); OTS é diagnóstico de exclusão (descarta anemia, tireoide, depressão) e o marcador-chave é queda de performance prolongada, não um biomarcador único.",
    strength: "forte",
    source: {
      name: "Meeusen et al. (2013) — European Journal of Sport Science",
      org: "European College of Sport Science / American College of Sports Medicine",
      url: "https://onlinelibrary.wiley.com/doi/10.1080/17461391.2012.730061",
      citable: true,
    },
  },
  {
    id: "hrv-guided-training",
    topic: "overtraining",
    claim:
      "Treino guiado por variabilidade de frequência cardíaca (HRV) melhora VO2max e reduz a proporção de \"não-respondedores\" comparado a um plano fixo, mas exige medição diária padronizada.",
    strength: "moderada",
    source: {
      name: "Meta-análise sobre treino guiado por HRV",
      url: "https://www.mdpi.com/2076-3417/10/23/8532",
      citable: true,
    },
  },
  {
    id: "resting-hr-spike-anecdotal",
    topic: "overtraining",
    claim:
      "\"FC de repouso subiu 5bpm, pule o treino\" é regra prática popular, sem limiar clinicamente validado por trás.",
    strength: "mito",
    source: { name: "Consenso ECSS/ACSM (ausência de limiar validado)", citable: true },
  },

  // -------------------------------------------------------------------- warmup
  {
    id: "dynamic-warmup-beats-static",
    topic: "warmup",
    claim:
      "Aquecimento dinâmico envolvendo grandes grupos musculares é superior a alongamento estático pra melhorar desempenho cardiorrespiratório/aeróbico, segundo a posição oficial do ACSM.",
    strength: "moderada",
    source: {
      name: "ACSM's Guidelines for Exercise Testing and Prescription, 11ª ed.",
      org: "American College of Sports Medicine",
      url: "https://acsm.org/education-resources/books/guidelines-exercise-testing-prescription/",
      citable: false,
    },
    caveat: "Posição oficial do ACSM; o texto do livro em si é conteúdo protegido, citar o princípio.",
  },
  {
    id: "ramp-protocol-not-us-sourced",
    topic: "warmup",
    claim:
      "O protocolo RAMP (Raise, Activate, Mobilise, Potentiate), bastante citado como estrutura de aquecimento, tem origem britânica (Ian Jeffreys) — não tem respaldo de fonte americana oficial, embora seja coerente com a posição do ACSM.",
    strength: "consenso",
    source: { name: "Ian Jeffreys (2007) — fora do escopo de fontes dos EUA", citable: true },
    caveat: "Sinalizado deliberadamente como não-americano a pedido do dono do produto, não descartado.",
  },

  // ----------------------------------------------------- pre-run static stretch
  {
    id: "static-stretch-pre-run-hurts-performance",
    topic: "static_stretch_pre",
    claim:
      "Alongamento estático antes de correr piora o desempenho agudo (-1,4% a -1,6% em meta-análises), com efeito deletério concentrado em séries de 60s ou mais por grupo muscular; o efeito sobre economia de corrida é pequeno.",
    strength: "forte",
    source: {
      name: "Scoping review sobre alongamento e economia de corrida",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7857312/",
      citable: true,
    },
    caveat:
      "Uma meta-análise de 2025 questiona o tamanho desse efeito sobre economia de corrida especificamente — força classificada como forte pro mecanismo agudo, moderada pro tamanho exato do efeito.",
  },
  {
    id: "static-stretch-2025-uncertainty",
    topic: "static_stretch_pre",
    claim:
      "Meta-análise mais recente conclui que a evidência atual não sustenta um efeito do alongamento sobre economia de corrida — o efeito popularmente assumido é maior do que o que os dados mostram.",
    strength: "moderada",
    source: { name: "Meta-análise (PubMed 40442558)", url: "https://pubmed.ncbi.nlm.nih.gov/40442558/", citable: true },
  },
  {
    id: "cdc-stretching-no-injury-evidence",
    topic: "static_stretch_pre",
    claim:
      "Revisão sistemática conduzida para o CDC (361 artigos avaliados, 6 elegíveis) concluiu que não há evidência suficiente pra endossar ou descontinuar alongamento de rotina antes ou depois do exercício como prevenção de lesão.",
    strength: "forte",
    source: {
      name: "Thacker, Gilchrist, Stroup, Kimsey — Medicine & Science in Sports & Exercise (2004)",
      org: "Centers for Disease Control and Prevention",
      url: "https://pubmed.ncbi.nlm.nih.gov/15076777/",
      citable: true,
    },
    caveat: "Resultado nulo: a conclusão da revisão é \"não há evidência\", não \"alongar previne lesão\".",
  },

  // ---------------------------------------------------------------- cool-down
  {
    id: "static-stretch-post-run-no-doms-reduction",
    topic: "static_stretch_post",
    claim:
      "Alongamento estático depois de correr não reduz de forma relevante a dor muscular tardia (DOMS): efeito de ~2% em 24–72h, sem significância estatística.",
    strength: "forte",
    source: {
      name: "Andersen — Journal of Athletic Training",
      org: "National Athletic Trainers' Association",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1250267/",
      citable: true,
    },
    caveat: "Resultado nulo, mesma fonte também usada pra \"alongar não reduz lesão\" (ver injury_prevention).",
  },
  {
    id: "post-stretch-rom-recovery-inconclusive",
    topic: "static_stretch_post",
    claim:
      "Não há evidência suficiente pra dizer se alongar depois de correr acelera a recuperação da amplitude de movimento: só 2 estudos mediram isso na revisão, dados descritos como \"escassos e heterogêneos\", confiança classificada como muito baixa.",
    strength: "moderada",
    source: {
      name: "Afonso et al. (2021) — Frontiers in Physiology",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8133317/",
      citable: true,
    },
    caveat:
      "Falta de evidência, não evidência de que não funciona — diferente do resultado nulo (efeito medido e ausente) da DOMS acima.",
  },
  {
    id: "active-cooldown-limited-impact",
    topic: "cooldown",
    claim:
      "Desaquecimento ativo (trote leve pós-treino) tem impacto limitado sobre recuperação psicobiológica, segundo o próprio ACSM — acelera remoção de lactato, mas lactato não é a causa da dor muscular tardia.",
    strength: "moderada",
    source: {
      name: "ACSM's Guidelines for Exercise Testing and Prescription, 11ª ed.",
      org: "American College of Sports Medicine",
      citable: false,
    },
  },
  {
    id: "cooldown-no-next-day-performance-effect",
    topic: "cooldown",
    claim:
      "Revisão da literatura conclui que desaquecimento ativo provavelmente não tem efeito relevante sobre o desempenho do dia seguinte, e geralmente não reduz dor muscular tardia — a maioria dos estudos mostra efeito trivial, mesmo com atletas costumando achar (efeito placebo) que ajuda mais do que descanso passivo.",
    strength: "moderada",
    source: {
      name: "Van Hooren & Peake (2018) — Sports Medicine",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5999142/",
      citable: true,
    },
    caveat:
      "Autores de Maastricht University (Holanda) e Queensland University of Technology (Austrália) — fora da varredura só-EUA pedida pro tema aquecimento/desaquecimento; incluído mesmo assim e sinalizado, não descartado, mesmo tratamento dado ao protocolo RAMP.",
  },

  // ------------------------------------------------------------- injury general
  {
    id: "static-stretch-no-injury-reduction-runners",
    topic: "injury_prevention",
    claim:
      "Alongamento estático não reduz risco de lesão em corredores: HR agrupado de 0,95 (IC 95% 0,78–1,16) em 2.630 recrutas militares — seria preciso ~141 pessoas alongando por 12 semanas pra evitar uma lesão.",
    strength: "forte",
    source: {
      name: "Andersen — Journal of Athletic Training",
      org: "National Athletic Trainers' Association",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1250267/",
      citable: true,
    },
    caveat: "Resultado nulo.",
  },
  {
    id: "previous-injury-strongest-risk-factor",
    topic: "injury_prevention",
    claim:
      "O fator de risco mais consistente pra uma nova lesão de corrida é já ter tido uma lesão antes — evidência forte reunida de estudos prospectivos numa revisão sistemática, apesar de os próprios estudos definirem \"lesão prévia\" de formas diferentes entre si.",
    strength: "forte",
    source: {
      name: "van der Worp et al. (2015) — PLOS ONE",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4338213/",
      citable: true,
    },
    caveat:
      "Os autores apontam inconsistência entre estudos em como \"lesão prévia\" é definida (janela de tempo, se foi relacionada à corrida) — o efeito é robusto, o tamanho exato varia por estudo.",
  },

  // -------------------------------------------------------------- hydration
  {
    id: "acsm-fluid-replacement",
    topic: "hydration",
    claim:
      "Repor ~1,5 litro de fluido por kg de massa corporal perdida, com sódio, nas ~6 horas seguintes ao treino quando a próxima sessão é em menos de 12h; evitar perda acima de 2% do peso corporal durante o exercício.",
    strength: "forte",
    source: {
      name: "ACSM Position Stand — Exercise and Fluid Replacement (2007)",
      org: "American College of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/17277604/",
      citable: true,
    },
  },
  {
    id: "drink-to-thirst-hyponatremia",
    topic: "hydration",
    claim:
      "O consenso internacional sobre hiponatremia associada ao exercício recomenda beber por sede, não seguir um plano fixo de mL/hora — perdas por suor e urina variam demais entre pessoas e condições pra uma meta fixa fazer sentido, e beber além da sede (não a falta de sódio) é o principal fator de risco pra hiponatremia.",
    strength: "forte",
    source: {
      name: "Hew-Butler et al. (2017) — 3ª Conferência Internacional de Consenso sobre EAH, Frontiers in Medicine",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5334560/",
      citable: true,
    },
    caveat:
      "Não contradiz a meta de reposição do ACSM acima — essa é sobre repor depois do treino; essa aqui é sobre quanto beber durante.",
  },

  // ---------------------------------------------------------- nutrition timing
  {
    id: "anabolic-window-overstated",
    topic: "nutrition_timing",
    claim:
      "A \"janela anabólica\" estrita de 30–45 minutos pós-treino é mais mito do que ciência sólida — a ingestão total de proteína ao longo do dia importa mais do que o timing exato da refeição pós-treino.",
    strength: "moderada",
    source: {
      name: "Aragon & Schoenfeld — Journal of the International Society of Sports Nutrition (2013)",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3577439/",
      citable: true,
    },
  },
  {
    id: "acsm-and-nutrition-athletic-performance",
    topic: "nutrition_timing",
    claim:
      "Posição conjunta sobre nutrição e desempenho atlético, com detalhes de tipo/quantidade/timing de nutrientes — referência canônica pra prescrição nutricional de atletas.",
    strength: "forte",
    source: {
      name: "Academy of Nutrition and Dietetics, ACSM — Nutrition and Athletic Performance (2016)",
      org: "American College of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/26891166/",
      citable: true,
    },
    caveat: "Coautoria inclui a Dietitians of Canada — a posição em si é conjunta, não exclusivamente americana.",
  },
];
