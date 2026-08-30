import type { EvidenceFact } from "./types";

/**
 * Curated from four research passes: general training methodology (VDOT,
 * progression, periodization, overtraining); per the product owner's
 * request, a US-sources-only pass on warm-up/cool-down/prescription; a
 * follow-up pass deepening topics that had only a single citation (injury
 * risk factors, in-run hydration, cool-down, post-run stretch ROM, taper
 * discipline); and a fourth pass specifically on what physiotherapists and
 * running/sports institutions prescribe for warm-up/cool-down *structure*
 * (not just stretching efficacy verdicts) — this last pass also corrected
 * an earlier reading of the RAMP protocol (its author writes the NSCA's own
 * warm-up chapter; the original 2007 article prescribes no dosage at all)
 * and expanded `static-stretch-2025-uncertainty` with the numbers the first
 * pass under-reported. Nothing here is invented — every claim traces to a
 * source found during that research, each one fetched and read directly
 * (not recalled from memory) before being added. Add facts by extending
 * this array; there is no build step or embedding index to regenerate.
 *
 * `bullets` are a mechanical reformat of `claim`, not a rewrite — same
 * numbers, same wording, just broken out of paragraph form because a wall
 * of dense prose per card made the numbers themselves easy to skim past.
 * `claim` stays as the canonical full sentence.
 */
export const EVIDENCE_FACTS: EvidenceFact[] = [
  // ---------------------------------------------------------------- pace zones
  {
    id: "vdot-pace-zones",
    topic: "pace_zones",
    claim:
      "Um tempo de prova recente pode ser convertido em zonas de pace de treino (fácil, limiar, intervalado, repetição) pela fórmula VDOT de Daniels & Gilbert — um modelo empírico, não uma medição direta de VO2max.",
    bullets: [
      "Prova recente → zonas de pace (fácil, limiar, intervalado, repetição)",
      "Fórmula VDOT (Daniels & Gilbert)",
      "Modelo empírico, não mede VO2max direto",
    ],
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
    id: "fixed-intensity-anchors-unreliable-lactate-threshold",
    topic: "pace_zones",
    claim:
      "Comparando seis formas de estimar o limiar de lactato a partir de porcentagens fixas (%FCmáx, %VO2max, %velocidade de pico, %reserva de FC, %reserva de VO2, PSE) em 165 corredores recreativos com teste incremental em esteira e lactato sanguíneo real, as âncoras baseadas em velocidade foram as mais precisas (erro médio de 0,6–0,8 km/h no primeiro limiar, 0,4–0,8 km/h no segundo), mas nenhuma porcentagem fixa colocou todos os corredores no mesmo domínio metabólico — sobretudo perto do limiar anaeróbico.",
    bullets: [
      "**165 corredores recreativos**, teste incremental em esteira com lactato sanguíneo real",
      "Zonas por **velocidade**: erro de **0,6–0,8 km/h** — a âncora mais precisa das 6 testadas",
      "**Nenhuma** porcentagem fixa (FCmáx, VO2max, PSE) manteve todo mundo no mesmo domínio metabólico",
    ],
    strength: "moderada",
    source: {
      name: "Nuuttila et al. (2025) — European Journal of Applied Physiology",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12354492/",
      citable: true,
    },
    caveat:
      "Estudo transversal com teste laboratorial e lactato sanguíneo, não corrida de rua livre. Usar velocidade/tempo de prova máxima estimados em vez de medidos piorou bastante a precisão (até 1,0 km/h e 8,4 bpm de erro) — relevante porque o app estima essas zonas a partir de uma prova recente (vdot-pace-zones), nunca mede diretamente.",
  },
  {
    id: "vdot-underestimates-vo2max-caution",
    topic: "pace_zones",
    claim:
      "Uma validação direta da calculadora VDOT de Jack Daniels contra teste laboratorial (VO2max medido, pace no VO2max e pace de limiar de lactato) em atletas universitários (n=11) e corredores recreativos (n=9) usando 5 km indoor como prova de entrada encontrou que o VDOT subestima o VO2max real nos dois grupos, de forma mais pronunciada nos recreativos — os autores recomendam cautela ao interpretar os paces de treino recomendados como medida exata de capacidade fisiológica.",
    bullets: [
      "**n=11** universitários + **n=9** recreativos, prova de 5km indoor vs teste de laboratório",
      "VDOT **subestima** o VO2max real nos dois grupos",
      "Subestimativa **mais pronunciada** em corredores recreativos que em atletas treinados",
    ],
    strength: "moderada",
    source: {
      name: "Scudamore, Barry & Coons (2018) — Journal of Strength and Conditioning Research 32(4):1137–1143",
      url: "https://pubmed.ncbi.nlm.nih.gov/28426511/",
      citable: true,
    },
    caveat:
      "Amostra pequena (n=11/n=9); magnitude exata em ml/kg/min não confirmada por trás de paywall — a direção do achado (VDOT subestima, mais em recreativos) veio confirmada por múltiplas fontes secundárias. Nuancia diretamente vdot-pace-zones (já classificado como 'modelo empírico, não medição direta').",
  },
  {
    id: "riegel-race-prediction",
    topic: "race_time_prediction",
    claim:
      "A fórmula de Riegel (T2 = T1 · (D2/D1)^1.06) estima o tempo equivalente em outra distância a partir de uma prova recente; o expoente é ajuste empírico que varia com o nível do atleta (~1.04 em elite, ~1.10–1.12 em baixa quilometragem) e degrada acima da maratona.",
    bullets: [
      "T2 = T1 × (D2/D1)^**1.06**",
      "Expoente varia: **~1,04** em elite, **~1,10–1,12** em baixa quilometragem",
      "Degrada acima da maratona",
    ],
    strength: "moderada",
    source: {
      name: "Riegel, P.S. (1977) — análise de precisão",
      url: "https://www.runpacelab.com/guides/riegel-formula-accuracy/",
      citable: true,
    },
  },
  {
    id: "vickers-vertosick-riegel-marathon-underestimate",
    topic: "race_time_prediction",
    claim:
      "Num estudo com 2.303 corredores recreativos (survey da Slate.com, validação cruzada 2:1), a fórmula de Riegel subestimou sistematicamente o tempo de maratona — pelo menos 10 minutos mais rápido que o real pra metade dos corredores — enquanto um modelo que usa o tempo de 1–2 provas anteriores mais o volume semanal de treino teve erro quadrático médio bem menor (228/208 contra 381 da fórmula de Riegel).",
    bullets: [
      "Riegel: tempo de maratona **≥10 min mais rápido** que o real, pra metade dos corredores",
      "Erro quadrático médio: Riegel **381**, modelo c/ 1 prova anterior **228**, com 2 provas **208**",
      "Volume semanal de treino é preditor consistente em todas as distâncias",
    ],
    strength: "moderada",
    source: {
      name: "Vickers & Vertosick (2016) — An empirical study of race times in recreational endurance runners",
      org: "BMC Sports Science, Medicine and Rehabilitation",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/",
      citable: true,
    },
    caveat:
      "Dados autorrelatados via pesquisa on-line, não medição controlada em laboratório — mas amostra grande (2.303) com validação cruzada. Quantifica e reforça a advertência já registrada em riegel-race-prediction sobre o expoente de Riegel degradar acima da maratona.",
  },

  // ---------------------------------------------------------- volume progression
  {
    id: "ten-percent-rule-rct-null",
    topic: "volume_progression",
    claim:
      "A regra dos 10% (aumentar o volume semanal em no máximo 10%) não teve efeito comprovado sobre lesão: um ensaio controlado randomizado comparou progressão de 10%/semana contra um plano bem mais agressivo (~24%/semana) e a taxa de lesão foi estatisticamente igual (20,8% vs 20,3%).",
    bullets: [
      "**10%/semana** vs **~24%/semana**: mesmo ensaio controlado",
      "Taxa de lesão praticamente igual — **20,8%** vs **20,3%**",
      "Regra dos **10%** não reduziu lesão sozinha",
    ],
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
    bullets: [
      "Salto de volume **>30% em 2 semanas** aumenta bastante o risco de lesão",
      "Entre **10% e 30%**: sem diferença do grupo abaixo de **10%**",
    ],
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
    bullets: ["Aumentar volume ou aumentar intensidade: mesmo risco de lesão"],
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
    bullets: [
      "ACWR perde poder preditivo como variável contínua",
      "Sem base pra usar como regra de segurança",
    ],
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
    bullets: [
      "Regra dos **10%** é opinião de especialista, não estudo forte",
      "**1–2 dias** de descanso/semana tem a mesma origem — convenção",
      "A própria entidade que recomenda isso admite que não é prova científica",
    ],
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
    bullets: [
      "**≥150 min/semana** moderada, ou **≥75 min/semana** vigorosa",
      "Progressão gradual reduz o risco do exercício",
    ],
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
    bullets: [
      "**~80%** do treino em intensidade baixa, **~20%** em alta",
      "Respaldo observacional em elite + ensaio controlado",
    ],
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
    bullets: [
      "**~3 horas / 32 km** — teto tradicional do longão",
      "Convenção de treinador, não achado experimental",
    ],
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
    bullets: [
      "USATF: periodização = planejar pico de desempenho em momentos específicos",
      "Currículo detalhado não é público",
    ],
    strength: "consenso",
    source: {
      name: "USATF Coaching Education, Level 1",
      org: "USA Track & Field",
      url: "https://www.usatf.org/programs/coaches/level-1",
      citable: false,
    },
  },
  {
    id: "block-periodization-small-edge-vo2max-wmax",
    topic: "periodization",
    claim:
      "A primeira revisão sistemática com meta-análise sobre periodização em blocos (BP) versus periodização tradicional (TRAD) em atletas de endurance treinados a bem treinados encontrou efeito pequeno, porém favorável, da BP sobre VO2max e potência máxima (Wmax) — mas os próprios autores alertam que os estudos incluídos são em geral pequenos e de qualidade metodológica baixa.",
    bullets: [
      "Periodização em **blocos**: efeito **pequeno, mas favorável** sobre VO2max e Wmax vs tradicional",
      "Primeira meta-análise sobre o tema em atletas de endurance",
      "Qualidade metodológica dos estudos incluídos: geralmente **baixa**",
    ],
    strength: "moderada",
    source: {
      name: "Mølmen, Øfsteng & Rønnestad (2019) — Block periodization of endurance training: a systematic review and meta-analysis",
      org: "Open Access Journal of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/31802956/",
      citable: true,
    },
    caveat: "Efeito pequeno e amostra de estudos de baixa qualidade — tratar como sinal preliminar, não como recomendação forte de trocar o modelo de periodização.",
  },
  {
    id: "periodization-models-tradition-not-evidence",
    topic: "periodization",
    claim:
      "Um artigo crítico de revisão argumenta que os modelos formais de periodização (linear, ondulatória, em blocos) compartilham pressupostos herdados de tradições de treinamento que não têm mais justificativa científica sólida, apesar de continuarem profundamente embutidos na prática — não há evidência forte o bastante pra declarar um modelo único superior aos outros de forma geral.",
    bullets: [
      "Modelos de periodização (linear, ondulatória, blocos) vêm de tradição, não de teste direto",
      "Pressupostos antigos continuam embutidos mesmo sem justificativa científica atual",
      "Não há evidência forte o bastante pra eleger um modelo único como superior",
    ],
    strength: "consenso",
    source: {
      name: "Kiely, J. (2012) — Periodization Paradigms in the 21st Century: Evidence-Led or Tradition-Driven?",
      org: "International Journal of Sports Physiology and Performance",
      url: "https://pubmed.ncbi.nlm.nih.gov/22356774/",
      citable: true,
    },
    caveat:
      "Artigo de opinião/revisão crítica, não estudo empírico novo — não afirma que periodizar não funciona, questiona a base de evidência dos pressupostos específicos dos modelos. Mesmo espírito de long-run-cap-convention: convenção de treinador, não achado experimental.",
  },
  {
    id: "undulatory-load-pattern-beats-linear-recreational-runners",
    topic: "periodization",
    claim:
      "Num ensaio controlado randomizado com 88 corredores recreativos (8 semanas, 2 mesociclos de 4 semanas com redução de carga tipo taper ao final de cada um), o padrão de carga ondulatório teve o maior ganho de VO2max (+22,15%, d=1,14) e melhor recuperação (razão testosterona livre/cortisol +26,9%) comparado ao padrão linear sem ondulação, que piorou a recuperação (creatina quinase +23,4%, LDH +35,2%, testosterona/cortisol −26,5%).",
    bullets: [
      "**88 corredores recreativos**, RCT, 8 semanas, taper a cada 4 semanas",
      "Padrão **ondulatório**: VO2max **+22,15%** (maior ganho); testosterona/cortisol **+26,9%**",
      "Padrão **linear** sem ondulação: pior recuperação — CK **+23,4%**, LDH **+35,2%**, testosterona/cortisol **−26,5%**",
    ],
    strength: "forte",
    source: {
      name: "Costa et al. (2019) — A Randomized Controlled Trial Investigating the Effects of Undulatory, Staggered, and Linear Load Manipulations",
      org: "Sports Medicine - Open",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6646634/",
      citable: true,
    },
    caveat:
      "Corredores recreativos, não elite; intensidade prescrita por %VO2max, que os próprios autores reconhecem variar 2–19% entre indivíduos na mesma intensidade relativa (ver fixed-intensity-anchors-unreliable-lactate-threshold). O taper aqui é de 1 semana ao final de cada mesociclo de 4 semanas, mais curto que os 2–3 semanas do taper pré-prova já documentado.",
  },

  // ---------------------------------------------------------------------- taper
  {
    id: "taper-2-weeks-exponential",
    topic: "taper",
    claim:
      "O taper mais bem evidenciado é de 2 semanas, com redução exponencial de 41–60% do volume, mantendo intensidade e frequência de treino.",
    bullets: [
      "Taper de **2 semanas** — o mais bem evidenciado",
      "Redução de **41–60%** do volume, exponencial",
      "Mantém intensidade e frequência",
    ],
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
    bullets: [
      "**158 mil+** maratonistas recreativos analisados",
      "Taper disciplinado de **3 semanas**: **−2,6%** no tempo final (mediana)",
      "**69%** dos corredores usa a versão relaxada mesmo assim",
    ],
    strength: "moderada",
    source: {
      name: "Smyth & Lawlor (2021) — Frontiers in Sports and Active Living",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8506252/",
      citable: true,
    },
    caveat:
      "Observacional (dados de treino do Strava), não ensaio controlado — mostra associação; corredores que já tapeiam de forma disciplinada também podem treinar melhor no geral.",
  },
  {
    id: "acute-fatigue-not-overreaching-before-taper",
    topic: "taper",
    claim:
      "Em triatletas treinados submetidos a 3 semanas de sobrecarga seguidas de 4 semanas de taper, o subgrupo que ficou apenas agudamente fatigado (sem queda de desempenho) teve maior supercompensação de desempenho no pico do taper do que o subgrupo que cruzou para overreaching funcional (queda de desempenho com fadiga percebida alta) e do que o grupo controle sem sobrecarga — sugerindo que o objetivo antes do taper é chegar fatigado, não overtreinado.",
    bullets: [
      "**33 triatletas**: 3 semanas de sobrecarga + 4 semanas de taper",
      "Fadiga aguda **sem** cruzar pra overreaching → **maior** supercompensação pós-taper",
      "Cruzar pra overreaching funcional → ganho **menor**, nem melhor que treino normal",
    ],
    strength: "moderada",
    source: {
      name: "Aubry, Hausswirth, Louis, Coutts & Le Meur (2014) — Medicine & Science in Sports & Exercise",
      url: "https://pubmed.ncbi.nlm.nih.gov/25134000/",
      citable: true,
    },
    caveat:
      "Magnitude exata em % de cada grupo não confirmada por trás de paywall (só a direção qualitativa, corroborada por múltiplas fontes independentes) — evitado citar número não verificado. Amostra masculina, ciclismo como teste de performance, não corrida.",
  },

  // --------------------------------------------------------------- overtraining
  {
    id: "ecss-acsm-overtraining-consensus",
    topic: "overtraining",
    claim:
      "O consenso conjunto ECSS/ACSM define um espectro de overreaching funcional → não-funcional → síndrome de overtraining (OTS); OTS é diagnóstico de exclusão (descarta anemia, tireoide, depressão) e o marcador-chave é queda de performance prolongada, não um biomarcador único.",
    bullets: [
      "Espectro: overreaching funcional → não-funcional → overtraining (OTS)",
      "OTS é diagnóstico de exclusão (descarta anemia, tireoide, depressão)",
      "Marcador-chave: queda de performance prolongada, não um biomarcador",
    ],
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
    bullets: [
      "Treino guiado por HRV melhora VO2max",
      "Reduz a proporção de \"não-respondedores\"",
      "Exige medição diária padronizada",
    ],
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
    bullets: ["\"FC de repouso **+5bpm**, pule o treino\" — sem limiar clinicamente validado"],
    strength: "mito",
    source: { name: "Consenso ECSS/ACSM (ausência de limiar validado)", citable: true },
  },
  {
    id: "foster-monotony-strain-illness",
    topic: "overtraining",
    claim:
      "Em 25 atletas experientes monitorados com carga de treino (RPE de sessão × duração), monotonia (carga média/desvio-padrão) e strain (carga × monotonia), uma proporção alta de doenças/lesões leves foi explicada quando o atleta individual ultrapassava um limiar próprio de strain — treino monótono (pouca variação dia a dia), mesmo sem aumento de volume, se associou a mais adoecimento banal e sintomas de overreaching.",
    bullets: [
      "**25 atletas**: carga, monotonia (média/desvio-padrão) e strain (carga × monotonia) monitorados",
      "Ultrapassar o limiar individual de **strain** explica boa parte das doenças/lesões leves",
      "Treino **monótono** (sem variação), mesmo sem mais volume, aumenta o risco",
    ],
    strength: "moderada",
    source: {
      name: "Foster, C. (1998) — Monitoring training in athletes with reference to overtraining syndrome",
      org: "Medicine & Science in Sports & Exercise",
      url: "https://pubmed.ncbi.nlm.nih.gov/9662690/",
      citable: true,
    },
    caveat:
      "Estudo observacional único (n=25), não meta-análise — mas é a origem do método monotonia/strain hoje usado amplamente em monitoramento de carga; complementa hrv-guided-training mostrando que variação de carga dia a dia, não só progressão semanal, importa.",
  },
  {
    id: "nfor-vs-ots-recovery-duration-threshold",
    topic: "overtraining",
    claim:
      "A distinção prática entre overreaching não-funcional (NFOR) e síndrome de overtraining (OTS) — o próximo nível depois do overreaching funcional — é o tempo de recuperação necessário: performance voltando ao normal em menos de 14–21 dias de descanso indica NFOR; levar mais que isso (semanas a meses) indica OTS. A prevalência de NFOR ao longo da vida é estimada em ~60% entre corredores de fundo de elite e ~33% entre corredoras não-elite.",
    bullets: [
      "**&lt;14–21 dias** de descanso pra recuperar performance = NFOR; mais que isso = OTS",
      "Prevalência de NFOR na vida: **~60%** em corredores de elite, **~33%** em não-elite",
      "Critérios de diagnóstico continuam arbitrários — a própria fonte reconhece isso",
    ],
    strength: "consenso",
    source: {
      name: "Kreher & Schwartz (2012) — Overtraining Syndrome: A Practical Guide",
      org: "Sports Health",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3435910/",
      citable: true,
    },
    caveat:
      "O número de prevalência (60%/33%) vem de um único estudo antigo citado dentro dessa revisão prática (Morgan et al. 1987), não de meta-análise — mas o limiar de 14–21 dias é a distinção prática mais citada na literatura clínica e complementa ecss-acsm-overtraining-consensus, que descreve o espectro sem dar esse marcador de tempo.",
  },

  // -------------------------------------------------------------------- warmup
  {
    id: "dynamic-warmup-beats-static",
    topic: "warmup",
    claim:
      "Aquecimento dinâmico envolvendo grandes grupos musculares é superior a alongamento estático pra melhorar desempenho cardiorrespiratório/aeróbico, segundo a posição oficial do ACSM.",
    bullets: [
      "Aquecimento dinâmico > alongamento estático pra desempenho aeróbico",
      "Posição oficial do ACSM",
    ],
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
    id: "ramp-is-taxonomy-not-dosage",
    topic: "warmup",
    claim:
      "O artigo original do RAMP (Jeffreys, 2007) é uma taxonomia de fases, não um protocolo dosado: define três fases (Raise; Activate and Mobilise; Potentiate — as quatro letras cobrem três blocos), não prescreve duração por fase, lista de exercícios nem número de repetições, e o único número do texto inteiro é \"a maioria dos aquecimentos dura de 10 a 30 minutos\".",
    bullets: [
      "RAMP = **3 fases** (Raise / Activate+Mobilise / Potentiate), não 4",
      "Sem duração por fase, sem lista de exercícios, sem dosagem",
      "Único número no artigo: aquecimento dura **10–30 min**",
    ],
    strength: "consenso",
    source: {
      name: "Jeffreys, I. (2007) — Warm up revisited: the RAMP method, Professional Strength and Conditioning n.6, 15–19",
      org: "UK Strength and Conditioning Association",
      url: "https://www.scottishathletics.org.uk/wp-content/uploads/2014/04/Warm-up-revisted-.pdf",
      citable: true,
    },
    caveat:
      "Corrige uma leitura anterior nossa de que o RAMP \"não tem respaldo de fonte americana\": o autor é NSCA Coach Practitioner, foi eleito NSCA High School Professional of the Year (2006), e assina o capítulo de aquecimento do livro-texto oficial da NSCA — que é a fonte que a própria NSCA cita na sua recomendação de aquecimento. RAMP não é \"sem fonte americana\", é a fonte que a NSCA usa. O que falta no artigo original é dosagem, não legitimidade — as durações por fase que circulam como \"o protocolo RAMP\" (ex.: 5min/5min/10min) foram acrescentadas por estudos e blogs posteriores, não pelo autor.",
  },
  {
    id: "nsca-warmup-5-10-plus-8-12",
    topic: "warmup",
    claim:
      "A prescrição de aquecimento mais concreta publicada por uma entidade americana (NSCA) é: 5–10 min iniciais de movimento geral pra subir a temperatura central (caminhada, trote, círculos e balanços de braço), seguidos de 8–12 min de aquecimento específico do esporte, progredindo de movimento de uma articulação só pra movimento de corpo inteiro e de baixa pra alta intensidade — sob a restrição explícita de preparar o atleta, não exauri-lo.",
    bullets: [
      "**5–10 min** de movimento geral (trote, caminhada, braços)",
      "**8–12 min** de aquecimento específico do esporte",
      "Progressão: uma articulação → corpo inteiro; preparar, não exaurir",
    ],
    strength: "consenso",
    source: {
      name: "Triano & Pellegrini — Dynamic Warm-Ups for the Land-Based Athlete, NSCA Coach 5.1",
      org: "National Strength and Conditioning Association",
      url: "https://www.nsca.com/contentassets/11647622285541019ee8ed532743cce5/coach-5.1.4-dynamic-warm-ups-for-the-land-based-athlete.pdf",
      citable: true,
    },
    caveat:
      "Artigo de prática na revista NSCA Coach, não position stand da NSCA — os números vêm da revisão de literatura dos autores (que citam o capítulo de aquecimento do próprio Jeffreys no livro-texto da NSCA), não de ensaio controlado.",
  },
  {
    id: "iaaf-warmup-inverse-to-distance",
    topic: "warmup",
    claim:
      "A revista técnica da World Athletics publica como princípio que quanto mais longa e menos intensa a atividade, mais curto o aquecimento necessário: um velocista precisa de cerca de 1 hora de aquecimento pra um esforço de 10–20 segundos, enquanto um maratonista de 4 horas tem necessidade diferente da de um maratonista de 2:08.",
    bullets: [
      "Quanto mais longa e menos intensa a prova, **mais curto** o aquecimento",
      "Velocista: **~1h** de aquecimento pra **10–20s** de esforço",
      "Maratonista de **4h** ≠ maratonista de **2:08**",
    ],
    strength: "consenso",
    source: {
      name: "Lee, J. (2014) — Warm-up Essentials, New Studies in Athletics 29:1, 7–11",
      org: "IAAF / World Athletics",
      url: "https://worldathletics.org/download/downloadnsa?filename=77d72573-46b5-43ad-8291-3f4f4f3026ce.pdf&urlslug=warm-up-essentials",
      citable: true,
    },
    caveat:
      "Artigo de opinião (\"Viewpoint\") assinado por um treinador e publicado pela federação — convenção de treinador chancelada por órgão oficial, não achado experimental. O mesmo artigo registra Rudisha quebrando o recorde mundial dos 800m depois de 45 min só de trote: sem drills, sem mobilidade, sem alongamento.",
  },
  {
    id: "high-intensity-warmup-5k",
    topic: "warmup",
    claim:
      "Num crossover com 13 fundistas treinados (VO2max 62,7 ml/kg/min), um aquecimento de alta intensidade (500m a 70% + 3×250m a 100%, 2 min de pausa passiva, 8–10 min no total) rendeu 5000m 6,4 segundos mais rápido (0,5%) que o mesmo aquecimento feito todo a 70% — p=0,03, com 10 dos 13 corredores melhorando.",
    bullets: [
      "**500m a 70% + 3×250m a 100%**, **8–10 min** no total",
      "5000m **6,4s** mais rápido (**0,5%**)",
      "**10 de 13** corredores melhoraram",
    ],
    strength: "moderada",
    source: {
      name: "Alves et al. (2023) — Journal of Sports Science & Medicine 22(2)",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10245000/",
      citable: true,
    },
    caveat:
      "n=13, só homens. Havia 18 min de transição entre aquecimento e prova (10 min de pausa + 5 min de drills + 3 min de pausa) — o benefício depende desse intervalo de recuperação, não só da intensidade. Contraria a convenção de \"pegar leve no aquecimento antes de prova longa\".",
  },
  {
    id: "warmup-dose-has-ceiling",
    topic: "warmup",
    claim:
      "Aquecimento tem teto: o aquecimento tradicional do ciclismo de velocidade (~50 min, subindo de 60% a 95% da FC máxima, com 4 sprints) causou fadiga mensurável, e trocá-lo por um mais curto (15 min de 60% a 70% da FC máxima, com 1 sprint só) rendeu 6,2% mais potência de pico e 5% mais trabalho total.",
    bullets: [
      "Aquecimento longo (**~50 min**, até **95%** da FC máx) causa fadiga",
      "Versão curta (**15 min**, até **70%** da FC máx): **+6,2%** de potência de pico",
      "**+5%** de trabalho total",
    ],
    strength: "moderada",
    source: {
      name: "Tomaras & MacIntosh (2011) — Journal of Applied Physiology 111(1)",
      url: "https://pubmed.ncbi.nlm.nih.gov/21551012/",
      citable: true,
    },
    caveat:
      "Ciclismo de pista, esforço de sprint — não é corrida de fundo. Serve como limite superior (existe aquecimento demais), não como dose pro corredor. Junto com o achado dos 5000m acima, mostra que a dose ótima é intermediária e depende do evento — não \"quanto mais, melhor\".",
  },
  {
    id: "plyometric-warmup-running-economy",
    topic: "warmup",
    claim:
      "Um aquecimento pliométrico melhorou a economia de corrida em relação a um aquecimento controle em 6,2% a 7 km/h, 9,1% a 8 km/h, 4,5% a 9 km/h e 4,4% a 10 km/h, tendo aumento de rigidez de perna como mecanismo proposto.",
    bullets: [
      "Economia de corrida: **+6,2%** a 7km/h, **+9,1%** a 8km/h",
      "**+4,5%** a 9km/h, **+4,4%** a 10km/h",
      "Mecanismo proposto: aumento de **rigidez de perna**",
    ],
    strength: "moderada",
    source: {
      name: "Wei et al. (2020) — Frontiers in Physiology 11:197",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7080849/",
      citable: true,
    },
    caveat:
      "n=12 estudantes universitários (3 homens, 9 mulheres) treinando menos de 5h/semana — não são corredores treinados. Efeitos dessa magnitude sobre economia de corrida são grandes demais pra tomar como definitivos sem replicação, e uma meta-análise de 2025 não achou efeito agudo de nenhum tipo de alongamento sobre economia de corrida (ver static_stretch_pre).",
  },
  {
    id: "warmup-injury-evidence-inconclusive",
    topic: "warmup",
    claim:
      "Revisão sistemática de ensaios controlados sobre aquecimento e lesão encontrou 5 estudos de boa qualidade, dos quais 3 mostraram redução significativa de risco de lesão — mas a conclusão dos autores é que a evidência é insuficiente pra endossar ou descontinuar o aquecimento de rotina, com o peso da evidência apenas \"favorável\" à redução de risco.",
    bullets: [
      "**5 ensaios** de boa qualidade; **3 de 5** mostraram redução de lesão",
      "Conclusão: evidência **insuficiente** pra endossar ou descontinuar",
      "Peso da evidência \"favorável\", não conclusivo",
    ],
    strength: "forte",
    source: {
      name: "Fradkin, Gabbe & Cameron (2006) — Journal of Science and Medicine in Sport 9(3)",
      url: "https://pubmed.ncbi.nlm.nih.gov/16679062/",
      citable: true,
    },
    caveat:
      "Mesmo padrão do achado do CDC sobre alongamento abaixo: \"não há evidência suficiente\" ≠ \"não funciona\". Nenhum dos 5 ensaios é em corredores de rua.",
  },
  {
    id: "fifa11-warmup-works-in-football-only",
    topic: "warmup",
    claim:
      "O único aquecimento estruturado com evidência de ensaio randomizado por cluster pra prevenção de lesão é o FIFA 11+ (8 min de corrida + 10 min de força e equilíbrio + 2 min de corrida, ~20 min): em 1.892 jogadoras de 13–17 anos, o desfecho primário de \"lesões relevantes\" deu rate ratio 0,71 (IC 95% 0,49–1,03) — mas o programa é de futebol e nunca foi validado em corredores de rua.",
    bullets: [
      "Estrutura: **8 min** corrida + **10 min** força/equilíbrio + **2 min** corrida (~**20 min**)",
      "**1.892 jogadoras**: cortou lesões relevantes em ~**30%**, mas o resultado não é estatisticamente confiável",
      "Nunca validado em corredores de rua",
    ],
    strength: "forte",
    source: {
      name: "Soligard et al. (2008) — BMJ 337:a2469, ensaio randomizado por cluster",
      url: "https://pubmed.ncbi.nlm.nih.gov/19066253/",
      citable: true,
    },
    caveat:
      "O IC do desfecho primário cruza 1. A transferência pra corrida é inferência: os mecanismos creditados (controle neuromuscular em corte e aterrissagem, estabilidade de tronco e quadril) são do futebol; corrida de rua não tem corte nem aterrissagem unilateral em velocidade.",
  },
  {
    id: "warmup-strength-block-costs-performance",
    topic: "warmup",
    claim:
      "Colocar o bloco de força de um programa preventivo dentro do aquecimento custa desempenho agudo: num crossover com 15 jogadoras juniores, fazer o FIFA 11+ com a parte de força deixou o sprint de 20m mais lento (3,62s vs 3,58s, p=0,028) e o de 30m também (5,01s vs 4,96s, p=0,039) — os próprios autores recomendam fazer a parte de força depois do treino ou em sessão separada.",
    bullets: [
      "20m: **3,62s** com o bloco de força vs **3,58s** sem",
      "30m: **5,01s** com força vs **4,96s** sem",
      "Recomendação dos autores: força **depois** do treino, não no aquecimento",
    ],
    strength: "moderada",
    source: {
      name: "Støvland et al. (2023) — BMJ Open Sport & Exercise Medicine 9(4):e001634",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10626785/",
      citable: true,
    },
    caveat:
      "n=15, jogadoras de futebol de ~15,7 anos, não corredores; mede desempenho agudo, não lesão. Não diz que a parte de força é inútil — diz que ela não pertence ao aquecimento.",
  },

  // ----------------------------------------------------- pre-run static stretch
  {
    id: "static-stretch-pre-run-hurts-performance",
    topic: "static_stretch_pre",
    claim:
      "Alongamento estático antes de correr piora o desempenho agudo (-1,4% a -1,6% em meta-análises), com efeito deletério concentrado em séries de 60s ou mais por grupo muscular; o efeito sobre economia de corrida é pequeno.",
    bullets: [
      "Alongar antes de correr: **-1,4% a -1,6%** no desempenho agudo",
      "Efeito concentrado em séries **≥60s** por grupo muscular",
    ],
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
      "Meta-análise mais recente (15 estudos agudos, 181 participantes) não encontrou efeito nem do alongamento estático nem do dinâmico sobre economia de corrida: SMD geral de 0,25 (IC 95% -0,16 a 0,66; p=0,21), estático 0,33 (-0,25 a 0,92; p=0,21), dinâmico 0,21 (-0,27 a 0,69; p=0,34) — o efeito popularmente assumido, em qualquer direção, é maior do que o que os dados mostram.",
    bullets: [
      "**15 estudos**, **181 participantes**: sem efeito de nenhum tipo de alongamento",
      "Nem estático nem dinâmico mudou a economia de corrida de forma mensurável",
      "O efeito que todo mundo assume existir, pra qualquer lado, é maior do que os dados mostram",
    ],
    strength: "moderada",
    source: {
      name: "Warneke, Zechner, Siegel, Jochum & Brunssen (2025) — Sports Medicine - Open 11:61",
      url: "https://pubmed.ncbi.nlm.nih.gov/40442558/",
      citable: true,
    },
    caveat:
      "Qualidade metodológica média dos estudos incluídos: 4,88/10, e nenhum estudo mediu rigidez músculo-tendínea apesar de ser o mecanismo proposto. Resultado nulo em ambas as direções — não usar pra afirmar que alongar antes prejudica NEM que ajuda a economia de corrida especificamente; o efeito agudo sobre desempenho (força, potência) é outro achado, coberto pelo fato acima.",
  },
  {
    id: "nsca-90s-threshold-disagrees-with-60s",
    topic: "static_stretch_pre",
    claim:
      "A NSCA situa o limiar do alongamento estático prejudicial em 90 segundos por músculo (abaixo disso pode ser aceitável em esportes que exigem grande amplitude) e atribui a queda de 7–8% na contração voluntária máxima, durando até 2 horas, ao alongamento intenso e prolongado — um limiar mais permissivo que o de ~60s usado na literatura de economia de corrida.",
    bullets: [
      "NSCA: estático **<90s** por músculo pode ser aceitável",
      "Queda de **7–8%** na contração voluntária máxima, durando até **2 horas**",
      "Literatura de corrida usa limiar mais restritivo: **~60s** por grupo muscular",
    ],
    strength: "consenso",
    source: {
      name: "Triano & Pellegrini — Dynamic Warm-Ups for the Land-Based Athlete, NSCA Coach 5.1",
      org: "National Strength and Conditioning Association",
      url: "https://www.nsca.com/contentassets/11647622285541019ee8ed532743cce5/coach-5.1.4-dynamic-warm-ups-for-the-land-based-athlete.pdf",
      citable: true,
    },
    caveat:
      "Os dois limiares discordam (90s da NSCA, ~60s da revisão de economia de corrida) — não escolher um como certo. A leitura segura é manter séries curtas e evitar alongamento estático prolongado antes de sessão de qualidade.",
  },
  {
    id: "cdc-stretching-no-injury-evidence",
    topic: "static_stretch_pre",
    claim:
      "Revisão sistemática conduzida para o CDC (361 artigos avaliados, 6 elegíveis) concluiu que não há evidência suficiente pra endossar ou descontinuar alongamento de rotina antes ou depois do exercício como prevenção de lesão.",
    bullets: [
      "**361 artigos** avaliados, **6 elegíveis**",
      "Evidência insuficiente pra endossar ou descartar alongamento",
    ],
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
    bullets: [
      "Alongar depois de correr não reduz DOMS de forma relevante",
      "Efeito de **~2%** em **24–72h**, sem significância estatística",
    ],
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
    bullets: [
      "Só **2 estudos** mediram recuperação de amplitude de movimento",
      "Dados \"escassos e heterogêneos\" — confiança muito baixa",
    ],
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
    id: "acsm-flexibility-60s-is-not-a-cooldown",
    topic: "static_stretch_post",
    claim:
      "A prescrição oficial de flexibilidade do ACSM é 60 segundos totais por grupo músculo-tendíneo maior, em pelo menos 2 dias por semana — e ela aparece no position stand como componente independente da aptidão física, não como parte do desaquecimento de uma sessão de corrida: o position stand não prescreve alongamento pós-treino.",
    bullets: [
      "**60s totais** por grupo músculo-tendíneo, **≥2 dias/semana**",
      "É componente separado de aptidão física, não parte do desaquecimento",
    ],
    strength: "forte",
    source: {
      name: "ACSM Position Stand 2011 (Garber et al.) — Medicine & Science in Sports & Exercise",
      org: "American College of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/21694556/",
      citable: true,
    },
    caveat:
      "A dosagem popular \"10–30s por repetição, 2–4 repetições\" vem do livro de guidelines do ACSM, não deste position stand — o resumo oficial só especifica o total de 60s. Mesma fonte já usada em acsm-fitt-vp-gradual-progression.",
  },
  {
    id: "stretching-delphi-consensus-2025",
    topic: "static_stretch_post",
    claim:
      "O primeiro consenso Delphi internacional sobre alongamento (20 especialistas, limiar de 80% de concordância, 8 tópicos, construído sobre revisões sistemáticas) fechou que alongamento agudo e crônico melhora amplitude de movimento e reduz rigidez muscular, e que NÃO serve como estratégia abrangente de prevenção de lesão, não melhora postura, não contribui de forma relevante pra hipertrofia e não acelera de forma aguda a recuperação pós-exercício.",
    bullets: [
      "**20 especialistas**, concordância mínima de **80%**, **8 tópicos**",
      "A favor: melhora **amplitude de movimento**, reduz **rigidez muscular**",
      "Contra: não previne lesão de forma abrangente, não acelera recuperação",
    ],
    strength: "consenso",
    source: {
      name: "Warneke et al. (2025) — Journal of Sport and Health Science 14:101067",
      url: "https://pubmed.ncbi.nlm.nih.gov/40513717/",
      citable: true,
    },
    caveat:
      "É consenso de especialistas por método Delphi, não um experimento novo — mas construído sobre revisões sistemáticas, então pesa mais que convenção de treinador isolada. Confirma de forma independente static-stretch-post-run-no-doms-reduction e static-stretch-no-injury-reduction-runners.",
  },
  {
    id: "post-session-is-where-static-stretch-belongs",
    topic: "static_stretch_post",
    claim:
      "A justificativa defensável pra alongar depois de correr não é recuperação nem prevenção de lesão, e sim ganho de amplitude de movimento a longo prazo: a NSCA orienta programar o alongamento estático no pós-sessão porque é onde ele produz mudança mais permanente de flexibilidade sem custar desempenho.",
    bullets: [
      "Motivo real do alongamento pós-corrida: amplitude a **longo prazo**",
      "Não é recuperação nem prevenção de lesão",
      "Pós-sessão é onde ele não custa desempenho",
    ],
    strength: "consenso",
    source: {
      name: "Triano & Pellegrini — Dynamic Warm-Ups for the Land-Based Athlete, NSCA Coach 5.1",
      org: "National Strength and Conditioning Association",
      url: "https://www.nsca.com/contentassets/11647622285541019ee8ed532743cce5/coach-5.1.4-dynamic-warm-ups-for-the-land-based-athlete.pdf",
      citable: true,
    },
    caveat:
      "Nenhum ensaio comparou diretamente \"alongar logo depois de correr\" contra \"alongar em outro momento do dia\" pro ganho de amplitude — a recomendação de horário é conveniência prática, não achado experimental.",
  },
  {
    id: "acsm-session-structure-5-10-min",
    topic: "cooldown",
    claim:
      "A estrutura de sessão prescrita pelo ACSM é aquecimento de pelo menos 5–10 min de atividade cardiorrespiratória leve a moderada, condicionamento de 20–60 min, e desaquecimento de pelo menos 5–10 min na mesma faixa leve a moderada — e a justificativa dada pro desaquecimento é o retorno gradual da frequência cardíaca e da pressão arterial, não redução de dor muscular.",
    bullets: [
      "Aquecimento **≥5–10 min** leve a moderado",
      "Condicionamento **20–60 min**; desaquecimento **≥5–10 min**",
      "Razão do desaquecimento: **FC e pressão arterial** voltarem gradualmente",
    ],
    strength: "moderada",
    source: {
      name: "ACSM's Guidelines for Exercise Testing and Prescription, 11ª ed.",
      org: "American College of Sports Medicine",
      citable: false,
    },
    caveat:
      "Posição oficial baseada em raciocínio fisiológico, não em desfecho medido em ensaio — coerente com active-cooldown-limited-impact e cooldown-no-next-day-performance-effect: o desaquecimento é prescrito pelo controle cardiovascular agudo, não porque acelere recuperação.",
  },
  {
    id: "active-cooldown-limited-impact",
    topic: "cooldown",
    claim:
      "Desaquecimento ativo (trote leve pós-treino) tem impacto limitado sobre recuperação psicobiológica, segundo o próprio ACSM — acelera remoção de lactato, mas lactato não é a causa da dor muscular tardia.",
    bullets: [
      "Trote leve pós-treino acelera remoção de lactato",
      "Lactato não é a causa da dor muscular tardia",
      "Impacto limitado na recuperação, segundo o ACSM",
    ],
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
    bullets: [
      "Sem efeito relevante no desempenho do dia seguinte",
      "Geralmente não reduz dor muscular tardia",
      "Efeito placebo: atletas acham que ajuda mesmo sem ajudar",
    ],
    strength: "moderada",
    source: {
      name: "Van Hooren & Peake (2018) — Sports Medicine",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5999142/",
      citable: true,
    },
    caveat:
      "Autores de Maastricht University (Holanda) e Queensland University of Technology (Austrália) — fora da varredura só-EUA pedida pro tema aquecimento/desaquecimento; incluído mesmo assim e sinalizado, não descartado, mesmo tratamento dado ao protocolo RAMP.",
  },
  {
    id: "cooldown-upper-bound-and-real-effects",
    topic: "cooldown",
    claim:
      "A mesma revisão que concluiu que desaquecimento ativo não melhora desempenho nem reduz dor muscular dá os únicos parâmetros defensáveis: intensidade metabólica baixa a moderada e duração abaixo de ~30 min, pra não atrapalhar a ressíntese de glicogênio; e lista os três efeitos que sobrevivem — remoção mais rápida de lactato (relevância prática questionada pelos próprios autores), recuperação mais rápida dos sistemas cardiovascular e respiratório, e prevenção parcial da depressão imunológica pós-exercício.",
    bullets: [
      "Intensidade **baixa a moderada**, duração **< ~30 min**",
      "Acima de ~30 min, atrapalha a **ressíntese de glicogênio**",
      "Só sobrevivem: lactato, recuperação cardiorrespiratória, depressão imune parcial",
    ],
    strength: "moderada",
    source: {
      name: "Van Hooren & Peake (2018) — Sports Medicine",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5999142/",
      citable: true,
    },
    caveat:
      "Mesma fonte de cooldown-no-next-day-performance-effect. Os autores não prescrevem duração mínima nem modo (trote vs caminhada vs bicicleta) — só o teto. Qualquer valor mínimo que o plano use é convenção, não achado.",
  },
  {
    id: "cooldown-prevents-exercise-associated-collapse",
    topic: "cooldown",
    claim:
      "A razão fisiológica mais concreta pra não parar de forma abrupta depois de correr forte é o colapso associado ao exercício (EAC): parar remove o efeito de \"segundo coração\" da bomba muscular esquelética, e a combinação de acúmulo venoso nos membros inferiores com bradicardia atlética e barorreflexo cardíaco prejudicado gera hipotensão postural transitória — o tratamento padrão do EAC é justamente deambulação assistida, que restaura a bomba muscular.",
    bullets: [
      "Parar de repente remove a bomba muscular (\"segundo coração\")",
      "Acúmulo venoso + bradicardia + barorreflexo prejudicado = hipotensão postural",
      "Tratamento padrão: **deambulação assistida** — o mesmo que o desaquecimento faz",
    ],
    strength: "moderada",
    source: {
      name: "Exercise-Associated Collapse — StatPearls, NCBI Bookshelf",
      url: "https://www.ncbi.nlm.nih.gov/books/NBK576425/",
      citable: true,
    },
    caveat:
      "Raciocínio mecanístico e prática clínica de atendimento em prova, não ensaio: a fonte descreve o tratamento do EAC, não testa \"continuar caminhando após a linha de chegada\" como prevenção. Incidência de referência (meia-maratona de Gotemburgo): 1,19 a 2,21 por 1.000 participantes precisaram de atendimento além de líquido oral e caminhada assistida.",
  },
  {
    id: "foam-rolling-effect-is-mostly-perceived-soreness",
    topic: "cooldown",
    claim:
      "Foam rolling (liberação miofascial) antes ou depois de correr tem efeito real, mas pequeno: numa meta-análise de 21 estudos (454 participantes), o uso antes do exercício rendeu ganhos triviais em sprint (+0,7%), quase nulos em salto, e pequenos em força (+1,8%) e flexibilidade (+4,0%); o uso depois do exercício teve seu maior efeito — e o maior de todo o estudo — na redução da dor muscular percebida (+6,0%), não no desempenho.",
    bullets: [
      "**21 estudos, 454 participantes**: efeitos de foam rolling são, no geral, pequenos e parcialmente desprezíveis",
      "Antes de correr: sprint **+0,7%**, salto quase nulo, força **+1,8%**, flexibilidade **+4,0%**",
      "Depois de correr: maior efeito é sobre **dor muscular percebida** (+6,0%) — não sobre desempenho",
    ],
    strength: "moderada",
    source: {
      name: "Wiewelhove, Döweling, Schneider et al. (2019) — Frontiers in Physiology 10:376, meta-análise",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6465761/",
      citable: true,
    },
    caveat:
      "Não é mito que atrapalha — não há efeito negativo — mas a crença popular de que foam rolling \"acelera a recuperação muscular de verdade\" tem base fraca: o único desfecho com efeito de tamanho relevante é a sensação de dor, não uma medida objetiva de performance/recuperação.",
  },

  // ------------------------------------------------------------- injury general
  {
    id: "static-stretch-no-injury-reduction-runners",
    topic: "injury_prevention",
    claim:
      "Alongamento estático não reduz risco de lesão em corredores: HR agrupado de 0,95 (IC 95% 0,78–1,16) em 2.630 recrutas militares — seria preciso ~141 pessoas alongando por 12 semanas pra evitar uma lesão.",
    bullets: [
      "Estudo com **2.630 recrutas** militares não achou redução real no risco de lesão",
      "**~141 pessoas** alongando por **12 semanas** pra evitar **1 lesão** — ineficiente",
    ],
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
    bullets: [
      "Lesão prévia = fator de risco mais consistente pra uma nova lesão",
      "Evidência forte, de estudos prospectivos numa revisão sistemática",
    ],
    strength: "forte",
    source: {
      name: "van der Worp et al. (2015) — PLOS ONE",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4338213/",
      citable: true,
    },
    caveat:
      "Os autores apontam inconsistência entre estudos em como \"lesão prévia\" é definida (janela de tempo, se foi relacionada à corrida) — o efeito é robusto, o tamanho exato varia por estudo.",
  },
  {
    id: "lauersen-strength-beats-stretching",
    topic: "injury_prevention",
    claim:
      "Meta-análise de 25 ensaios randomizados (26.610 participantes, 3.464 lesões) comparando estratégias preventivas: alongamento RR 0,963 (IC 95% 0,846–1,095, sem efeito), treino de força RR 0,315 (0,207–0,480), treino proprioceptivo RR 0,550 (0,347–0,869) e programas multicomponente RR 0,655 (0,520–0,826); lesões por overuse caíram quase à metade (RR 0,527, IC 0,373–0,746).",
    bullets: [
      "**25 ensaios**, 26.610 participantes, 3.464 lesões",
      "Fortalecimento muscular: cortou o risco de lesão em quase **70%** — a estratégia mais eficaz",
      "Alongamento não reduziu o risco de lesão de forma perceptível",
    ],
    strength: "forte",
    source: {
      name: "Lauersen, Bertelsen & Andersen (2014) — British Journal of Sports Medicine",
      url: "https://www.ncbi.nlm.nih.gov/books/NBK169555/",
      citable: true,
    },
    caveat:
      "Amostra dominada por esportes coletivos, não por corredores de rua — e o efeito NÃO se reproduz quando a pergunta é restrita a corredores (ver runner-specific-prevention-null). Não usar esse número de redução de risco como se fosse específico de corrida.",
  },
  {
    id: "runner-specific-prevention-null",
    topic: "injury_prevention",
    claim:
      "Quando a mesma pergunta é feita só com corredores de endurance, o efeito desaparece: meta-análise de 9 ensaios com 1.904 corredores não achou redução significativa nem de risco (p=0,110) nem de taxa de lesão (p=0,329) — só o subgrupo de 3 estudos supervisionados mostrou efeito (log RR −0,77; p<0,001), com aderência ≥88% contra 47–93% nos não supervisionados.",
    bullets: [
      "**9 ensaios, 1.904 corredores**: nenhum efeito real de prevenção detectado, no geral",
      "Só os **3 estudos supervisionados** funcionaram de verdade",
      "Adesão foi o diferencial: **≥88%** supervisionado vs 47–93% sem supervisão",
    ],
    strength: "forte",
    source: {
      name: "Wu, Brooke-Wavell, Fong, Paquette & Blagrove (2024) — Sports Medicine 54(5), 1249–1267",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11127851/",
      citable: true,
    },
    caveat:
      "Resultado nulo no agregado. A leitura honesta do subgrupo é que o que separa funcionar de não funcionar é aderência, não o conteúdo do exercício — má notícia pra um app que só prescreve e não supervisiona. Análise post hoc de 3 estudos: gera hipótese, não confirma.",
  },
  {
    id: "achilles-cpg-prescribes-load-not-warmup",
    topic: "injury_prevention",
    claim:
      "A diretriz de prática clínica da APTA/Academy of Orthopaedic Physical Therapy pra tendinopatia de porção média do Aquiles (revisão 2024) prescreve carga, não aquecimento: \"exercício de carga do tendão, com cargas tão altas quanto toleradas\" é recomendação grau A (evidência forte) como primeira linha, a dose (≥3x por semana) é grau E, alongamento é apenas grau C e só quando há restrição de dorsiflexão de tornozelo — e o termo \"warm-up\" não aparece nenhuma vez no documento.",
    bullets: [
      "Recomendação mais forte: carregar o tendão, com carga tão alta quanto o corredor aguentar",
      "Fazer isso **≥3x por semana**; alongar é recomendação bem mais fraca, só em caso específico",
      "**Zero** menções a aquecimento no documento inteiro",
    ],
    strength: "forte",
    source: {
      name: "Chimenti et al. (2024) — Midportion Achilles Tendinopathy Revision 2024, JOSPT 54(12)",
      org: "Academy of Orthopaedic Physical Therapy, American Physical Therapy Association",
      url: "https://www.jospt.org/doi/10.2519/jospt.2024.0302",
      citable: true,
    },
    caveat:
      "A ausência de recomendação sobre aquecimento é leitura do documento (busca textual no PDF completo), não uma afirmação da diretriz — ela simplesmente não trata do tema. Não conclua que aquecimento é inútil pro Aquiles; conclua que não existe diretriz de fisioterapia que posicione trabalho preventivo de Aquiles dentro do aquecimento.",
  },
  {
    id: "gait-retraining-step-rate-biomechanics-not-performance",
    topic: "injury_prevention",
    claim:
      "Aumentar a cadência (step rate) durante a corrida reduz a taxa de carga vertical de impacto de forma consistente, mas a evidência de que isso realmente previne lesão ainda é escassa: uma revisão sistemática com meta-análise de 19 ensaios (673 participantes) encontrou certeza moderada pra mudança biomecânica (cadência sobe, taxa de carga cai), nenhum efeito sobre desempenho de corrida, e evidência insuficiente pra tirar conclusão sobre dor — só 2 dos 19 ensaios mediram incidência de lesão em 1 ano, e os dois mostraram redução.",
    bullets: [
      "**19 ensaios, 673 participantes**: cadência sobe, taxa de carga de impacto cai — certeza **moderada**",
      "Sem efeito sobre desempenho de corrida",
      "Só **2 ensaios** mediram lesão em 1 ano de fato (ambos com redução) — evidência de lesão ainda insuficiente",
    ],
    strength: "moderada",
    source: {
      name: "Doyle, Doyle, Bonacci & Fuller (2022) — Journal of Orthopaedic & Sports Physical Therapy 52(4), 192–206",
      url: "https://pubmed.ncbi.nlm.nih.gov/35128941/",
      citable: true,
    },
    caveat:
      "A crença popular de \"aumentar a cadência em 5–10% previne lesão\" é mais forte do que os dados atuais sustentam: o efeito biomecânico é real e consistente, mas o elo com menos lesão de fato vem de só 2 ensaios (incluindo Chan et al. 2018, AJSM: 62% menos lesão em corredores novatos após reeducação de marcha supervisionada de 2 semanas com feedback visual) — promissor, não confirmado.",
  },
  {
    id: "footstrike-pattern-not-consistent-injury-predictor",
    topic: "injury_prevention",
    claim:
      "A crença de que um padrão de pisada (antepé vs. retropé) é \"mais seguro\" que o outro não tem direção clara na evidência: uma revisão sistemática de 12 estudos prospectivos (3.773 participantes) sobre função dinâmica do pé como fator de risco de lesão encontrou evidência apenas \"muito limitada\", de qualidade baixa a moderada, e nenhuma evidência de que a função do pé prediga síndrome do trato iliotibial ou fratura por estresse.",
    bullets: [
      "**12 estudos prospectivos, 3.773 participantes** sobre função do pé/pisada como risco de lesão",
      "Qualidade **baixa a moderada** (só 1 dos 12 estudos atingiu qualidade moderada)",
      "Evidência \"muito limitada\" — nenhuma evidência pra ITBS ou fratura por estresse",
    ],
    strength: "mito",
    source: {
      name: "Neal, Barton, Gallie, O'Halloran & Morrissey (2014) — BMC Musculoskeletal Disorders, revisão sistemática",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4296532/",
      citable: true,
    },
    caveat:
      "Trocar de padrão de pisada é, na prática, uma reeducação de marcha completa — redistribui a carga pra outro tecido (retropé concentra mais impacto no joelho; antepé transfere carga pro tornozelo/panturrilha, mais associado a Aquiles e fascite plantar em revisões biomecânicas). Não é uma correção neutra — é uma troca de risco, não uma eliminação dele.",
  },
  {
    id: "hip-core-strength-rct-reduces-overuse-injury-novice-runners",
    topic: "injury_prevention",
    claim:
      "Um ensaio controlado randomizado de três braços (Run RCT, 325 corredores novatos, mais de 70% mulheres) encontrou que um programa de quadril e core supervisionado por fisioterapeuta (agachamento, avanço, prancha, exercício de Copenhagen; 2 sessões supervisionadas + 1–2 em casa por semana, 24 semanas) reduziu lesões por overuse em corredores novatos comparado a um grupo controle de alongamento estático: HR 0,66 (IC 95% 0,45–0,97).",
    bullets: [
      "**325 corredores novatos**, 24 semanas: grupo quadril+core teve **34% menos risco** de lesão por overuse (HR 0,66, IC 0,45–0,97)",
      "Programa: agachamento, avanço, prancha, exercício de Copenhagen — 2 sessões supervisionadas + 1–2 em casa/semana",
      "Grupo tornozelo/pé (equilíbrio, elevação de calcanhar) não teve o mesmo benefício",
    ],
    strength: "forte",
    source: {
      name: "Leppänen et al. (2024) — Run RCT",
      org: "British Journal of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/38724071/",
      citable: true,
    },
    caveat:
      "Contrasta com o achado agregado mais antigo já neste arquivo (runner-specific-prevention-null, Wu et al. 2024) de que prevenção específica pra corredor, no geral, não mostrava efeito real. Este RCT é maior, mais recente e supervisionado — reforça a hipótese de que supervisão/adesão, não o conteúdo do exercício, é o que faz a diferença. Sem benefício pra lesão aguda (HR 2,08, IC 0,64–6,75, não significativo) — só pra lesão por overuse.",
  },
  {
    id: "nordic-hamstring-51-percent-reappraised-inconclusive",
    topic: "injury_prevention",
    claim:
      "O exercício nórdico de isquiotibiais (Nordic hamstring curl) é popularmente citado como reduzindo lesão de isquiotibiais em ~51%, mas uma reanálise metodológica da mesma literatura mostrou que esse número vem de meta-análises com problemas de método (viés de publicação, alta heterogeneidade) — ao corrigir o método, o efeito preventivo passa a ser classificado como inconclusivo, com recomendação apenas condicional e majoritariamente restrita ao futebol.",
    bullets: [
      "Número popular: **~51%** menos lesão de isquiotibiais com o exercício nórdico",
      "Reanálise com método corrigido: efeito **inconclusivo**, alto risco de viés nos RCTs originais",
      "Evidência concentrada em futebol — pouca base fora desse esporte",
    ],
    strength: "mito",
    source: {
      name: "Impellizzeri, McCall et al. (2021) — Journal of Clinical Epidemiology, reanálise metodológica",
      url: "https://pubmed.ncbi.nlm.nih.gov/34520846/",
      citable: true,
    },
    caveat:
      "Não significa que o exercício nórdico não funcione — significa que a certeza estatística por trás do número \"51%\" é mais frágil do que amplamente divulgado. Quase toda a evidência é de futebol/esportes coletivos, não de corrida de fundo, onde lesão de isquiotibial por estiramento é mais rara — aplicabilidade direta a corredores de rua é uma extrapolação, não um achado direto.",
  },

  // ------------------------------------------------------ injury rehab / return to run
  {
    id: "eccentric-not-superior-to-hsr-achilles",
    topic: "injury_rehab",
    claim:
      "O protocolo excêntrico de Alfredson (heel-drop) tem eficácia real pra tendinopatia de Aquiles, mas não é superior a outros protocolos de carga: um ensaio controlado randomizado comparando excêntrico contra treino de resistência lenta e pesada (HSR) encontrou resultados igualmente bons e duradouros nos dois grupos em 12 semanas e em 1 ano, e uma revisão sistemática com meta-análise de 12 ensaios (543 participantes) não achou diferença significativa em dor e função entre diferentes protocolos de carga do tendão.",
    bullets: [
      "Excêntrico (Alfredson) vs. resistência lenta e pesada (HSR): resultado **igualmente bom** em 12 semanas e em 1 ano",
      "Revisão de **12 ensaios, 543 participantes**: nenhum protocolo de carga se mostrou superior a outro",
      "A diretriz clínica de 2024 já citada neste arquivo (achilles-cpg-prescribes-load-not-warmup) também não elege o excêntrico como método preferencial",
    ],
    strength: "moderada",
    source: {
      name: "Maetz, Dubé, Tougas, Prudhomme, Dubois & Roy (2023) — Orthopaedic Journal of Sports Medicine, revisão sistemática e meta-análise de 12 RCTs",
      url: "https://journals.sagepub.com/doi/10.1177/23259671231171178",
      citable: true,
    },
    caveat:
      "Evidência de qualidade consistentemente baixa (10 de 12 estudos com 'algumas preocupações' de viés) e só 2 RCTs compararam protocolos diretamente entre si. O RCT de Beyer et al. (2015, AJSM, n=58) que embasa a comparação excêntrico-vs-HSR é um estudo só. Não conclua que o excêntrico é inútil — conclua que não é o único caminho válido, contrariando a ideia popular de que 'Alfredson é o padrão-ouro'.",
  },
  {
    id: "eccentric-worst-ranked-patellar-tendinopathy",
    topic: "injury_rehab",
    claim:
      "Para tendinopatia patelar, o exercício excêntrico (o clássico agachamento no declive) é popularmente tratado como \"o\" protocolo de referência, mas uma revisão sistemática com meta-análise em rede (7 ensaios, 337 participantes) classificou o treino excêntrico isolado como a intervenção menos eficaz pra melhorar o escore VISA-P, com isométrico combinado a resistência lenta/moderada e resistência lenta e pesada (HSR) tendo desempenho melhor.",
    bullets: [
      "**7 ensaios, 337 participantes**: excêntrico, isométrico e resistência lenta/pesada comparados entre si",
      "Excêntrico isolado: pior colocado pra melhora do escore VISA-P (probabilidade de ser o melhor: **1%**)",
      "Isométrico + resistência lenta/moderada teve o melhor resultado geral; resistência lenta e pesada (HSR) foi melhor pra função no longo prazo",
    ],
    strength: "moderada",
    source: {
      name: "Li, Sun, Fang et al. (2024) — Heliyon (Elsevier), revisão sistemática e meta-análise em rede",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11570476/",
      citable: true,
    },
    caveat:
      "Meta-análise em rede de 7 estudos pequenos, publicada em periódico de fator de impacto menor (Heliyon, não JOSPT/BJSM) — o sinal é real mas a base é mais estreita que o resto deste arquivo. Contradiz diretamente a crença de que 'excêntrico é o padrão-ouro' pra tendinopatia patelar.",
  },
  {
    id: "stress-fracture-return-to-run-pain-response-rule",
    topic: "injury_rehab",
    claim:
      "A reintrodução da corrida depois de uma fratura por estresse tibial/metatarsal segue uma regra de dor, não um calendário fixo: o retorno só começa depois de 5 dias seguidos sem dor nas atividades do dia a dia, e cada etapa da progressão só avança se não houver sintoma durante, depois, ou no dia seguinte ao esforço — sintoma em qualquer um desses momentos indica carga excessiva sobre o osso ainda remodelando.",
    bullets: [
      "Início do retorno: **5 dias seguidos** sem dor nas atividades diárias",
      "Regra de progressão: sem sintoma durante, depois, **ou no dia seguinte** — se doer, a carga foi excessiva",
      "Protocolo clássico de referência citado na literatura: University of Delaware Return-to-Running Program (corrida graduada até 30 min contínuos sem dor)",
    ],
    strength: "consenso",
    source: {
      name: "Warden, Edwards & Willy (2021) — Optimal Load for Managing Low-Risk Tibial and Metatarsal Bone Stress Injuries in Runners",
      org: "Journal of Orthopaedic & Sports Physical Therapy 51(6)",
      url: "https://www.jospt.org/doi/10.2519/jospt.2021.9982",
      citable: true,
    },
    caveat:
      "É um comentário clínico de raciocínio, não um ensaio controlado testando essa regra contra outra — a lógica é fisiológica (dor como sinal de sobrecarga do osso), amplamente adotada na prática de fisioterapia esportiva, mas não é uma prescrição validada por RCT.",
  },
  {
    id: "plantar-fascia-specific-stretch-beats-achilles-stretch",
    topic: "injury_rehab",
    claim:
      "Pra fasciíte plantar, um alongamento específico da fáscia plantar (sentado, puxando os dedos em direção à canela até sentir tensão na fáscia, 10 repetições de 10s, 3x/dia, feito antes dos primeiros passos do dia) teve resultado melhor que alongamento do tendão de Aquiles no mesmo ensaio controlado: maior redução de dor, maior melhora de função e maior satisfação do paciente em 8 semanas, com 82 pacientes completando o estudo.",
    bullets: [
      "Alongamento específico da fáscia plantar (sentado, puxar os dedos) vs. alongamento do Aquiles",
      "**82 pacientes**, 8 semanas: fáscia plantar teve **mais** redução de dor e melhora de função",
      "Protocolo: **10 repetições de 10s, 3x/dia**, antes dos primeiros passos do dia",
    ],
    strength: "moderada",
    source: {
      name: "DiGiovanni, Nawoczenski, Lintal et al. (2003) — Journal of Bone and Joint Surgery",
      url: "https://pubmed.ncbi.nlm.nih.gov/16882901/",
      citable: true,
    },
    caveat:
      "Um único RCT (com seguimento de 2 anos publicado depois) — mas a diretriz clínica APTA/JOSPT de fasciíte plantar (revisão 2023) incorporou esse achado como recomendação de alongamento específico de tecido. É um alongamento prescrito como tratamento de uma lesão já existente, feito de manhã ao acordar — não se encaixa em 'pré-corrida' nem 'pós-corrida' de rotina, por isso fica em reabilitação, não nos tópicos de alongamento de treino.",
  },
  {
    id: "hamstring-cpg-progressive-agility-weak-evidence-grade",
    topic: "injury_rehab",
    claim:
      "A diretriz clínica da APTA/JOSPT pra lesão de isquiotibiais (2022) recomenda progressão de agilidade e estabilização de tronco — somada a um programa de alongamento/fortalecimento e a uma progressão de corrida com aceleração e desaceleração, aumentando velocidade e distância gradualmente — pra reduzir a taxa de nova lesão, mas essa recomendação específica carrega o grau de evidência mais baixo da escala da própria diretriz, não o mais alto.",
    bullets: [
      "Progressão de agilidade + estabilização de tronco + corrida com aceleração/desaceleração gradual",
      "Objetivo: reduzir a **taxa de nova lesão** (reincidência é o problema real dos isquiotibiais)",
      "Grau de evidência: o mais baixo da escala da diretriz — recomendação, não achado experimental forte",
    ],
    strength: "consenso",
    source: {
      name: "Academy of Orthopaedic Physical Therapy / American Academy of Sports Physical Therapy, APTA (2022) — Hamstring Strain Injury in Athletes: CPG",
      org: "Journal of Orthopaedic & Sports Physical Therapy 52(3)",
      url: "https://www.jospt.org/doi/10.2519/jospt.2022.0301",
      citable: true,
    },
    caveat:
      "Mais da metade das lesões recorrentes de isquiotibiais acontecem no primeiro mês depois do retorno ao esporte — a própria literatura da área reconhece que não há consenso sobre quais critérios objetivos definem 'pronto pra voltar', a decisão ainda é largamente clínica/subjetiva, não um teste único e validado.",
  },
  {
    id: "hip-abductor-strengthening-itbs-runners",
    topic: "injury_rehab",
    claim:
      "Pra síndrome do trato iliotibial (ITBS) em corredores, fortalecimento de abdutores de quadril é a intervenção conservadora com mais respaldo: uma revisão sistemática de 13 estudos (201 participantes) achou redução de dor de 27% a 100% e melhora funcional de 10% a 57% em programas de 2 a 8 semanas, com resultado ainda melhor quando combinado com terapia manual ou ondas de choque (redução média de dor de 71%, vs. 61% isolado).",
    bullets: [
      "**13 estudos, 201 participantes**: fortalecimento de abdutor de quadril reduz dor **27–100%**",
      "Melhora funcional de **10–57%** em programas de **2 a 8 semanas**",
      "Combinado com terapia manual/ondas de choque: redução média de dor de **71%** (vs. 61% isolado)",
    ],
    strength: "moderada",
    source: {
      name: "Revisão sistemática sobre tratamento conservador de ITBS em corredores (2024)",
      org: "Frontiers in Sports and Active Living",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11377285/",
      citable: true,
    },
    caveat:
      "Qualidade metodológica média 66% (NIH Quality Assessment Tool), heterogeneidade grande demais pra meta-análise formal (13 estudos, maioria estudos de caso, só 5 RCTs) — o sinal é consistente mas a base é qualitativamente fraca. Os próprios autores dizem que reeducação de marcha pra ITBS ainda carece de estudos de boa qualidade.",
  },
  {
    id: "dry-needling-sports-helps-pain-not-performance",
    topic: "injury_rehab",
    claim:
      "Agulhamento seco (dry needling) em atletas tem evidência consistente pra alívio de dor no curto prazo, mas não pra melhora de desempenho: uma revisão sistemática com mapa de lacunas de evidência (24 estudos, 580 atletas, 13 esportes) encontrou efeito mais positivo sobre dor do que sobre desempenho atlético, com qualidade metodológica inconsistente — só 18% dos estudos cegaram participante e terapeuta.",
    bullets: [
      "**24 estudos, 580 atletas**, 13 esportes: efeito mais positivo sobre **dor** do que sobre desempenho",
      "Só **18%** dos estudos cegaram participante e terapeuta — risco de viés alto",
      "Evidência não sustenta ganho de desempenho atlético, mesmo quando ajuda a dor",
    ],
    strength: "moderada",
    source: {
      name: "Revisão sistemática com evidence gap map — Dry Needling in Sports and Sport Recovery (2024)",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12011942/",
      citable: true,
    },
    caveat:
      "Boa parte dos estudos tem viés alto (cegamento raro) e faltam dados de dosagem/efeitos adversos. Não é mito — há sinal real de alívio de dor de curto prazo — mas está longe de consenso forte, e a crença de que dry needling melhora desempenho especificamente não se sustenta.",
  },
  {
    id: "manual-therapy-alone-no-added-benefit-pfp",
    topic: "injury_rehab",
    claim:
      "Pra dor patelofemoral (uma das causas mais comuns de dor de joelho em corredor), a diretriz clínica da APTA/JOSPT (2019) recomenda explicitamente contra usar mobilização/manipulação articular como tratamento isolado, e afirma que somar outras terapias — incluindo agulhamento seco e acupuntura — ao exercício não melhora o resultado além do exercício sozinho.",
    bullets: [
      "Mobilização/manipulação articular **isolada**: não recomendada",
      "Somar agulhamento seco ou acupuntura ao exercício: **sem ganho** além do exercício sozinho",
      "Fortalecimento de quadril/joelho continua sendo a intervenção com mais peso de evidência",
    ],
    strength: "forte",
    source: {
      name: "Academy of Orthopaedic Physical Therapy, APTA (2019) — Patellofemoral Pain: Clinical Practice Guidelines",
      org: "Journal of Orthopaedic & Sports Physical Therapy 49(9)",
      url: "https://www.jospt.org/doi/10.2519/jospt.2019.0302",
      citable: true,
    },
    caveat:
      "É uma recomendação negativa (contra um tratamento) — o tipo de achado mais honesto que uma diretriz pode dar. Mas dor patelofemoral não é a única causa de dor de joelho em corredor, e a diretriz é específica pra PFP, não generalizável a toda lesão de joelho.",
  },

  // -------------------------------------------------------------- hydration
  {
    id: "acsm-fluid-replacement",
    topic: "hydration",
    claim:
      "Repor ~1,5 litro de fluido por kg de massa corporal perdida, com sódio, nas ~6 horas seguintes ao treino quando a próxima sessão é em menos de 12h; evitar perda acima de 2% do peso corporal durante o exercício.",
    bullets: [
      "**~1,5L** de fluido por kg de peso perdido, com sódio",
      "Nas **~6h** seguintes ao treino, se a próxima sessão é em **<12h**",
      "Evitar perda **>2%** do peso corporal durante o exercício",
    ],
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
    bullets: [
      "Beber por sede, não por plano fixo de mL/hora",
      "Beber além da sede é o principal risco de hiponatremia",
    ],
    strength: "forte",
    source: {
      name: "Hew-Butler et al. (2017) — 3ª Conferência Internacional de Consenso sobre EAH, Frontiers in Medicine",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5334560/",
      citable: true,
    },
    caveat:
      "Não contradiz a meta de reposição do ACSM acima — essa é sobre repor depois do treino; essa aqui é sobre quanto beber durante.",
  },
  {
    id: "dehydration-2-percent-time-trial-null",
    topic: "hydration",
    claim:
      "Numa meta-análise de 5 estudos de ciclismo contra o relógio (ritmo autorregulado, 13 estimativas, 39 sujeitos), perder em média 2,2% do peso corporal por desidratação durante o exercício não prejudicou o desempenho de forma estatisticamente significativa (efeito de +0,06% ± 2,72%, p=0,94) comparado a manter-se hidratado — e beber abaixo do que a sede pedia prejudicou mais o desempenho (−5,2%) do que beber acima dela.",
    bullets: [
      "**~2,2%** de perda de peso corporal: sem prejuízo estatístico numa prova contra o relógio",
      "Efeito medido: **+0,06% ± 2,72%** (p=0,94) — nulo",
      "Beber **abaixo** da sede prejudicou mais (**−5,2%**) que beber acima dela",
    ],
    strength: "moderada",
    source: {
      name: "Goulet, E.D.B. (2011) — Effect of exercise-induced dehydration on time-trial exercise performance: a meta-analysis",
      org: "British Journal of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/21454440/",
      citable: true,
    },
    caveat:
      "Amostra pequena (39 sujeitos, 5 estudos), só ciclismo em calor moderado, não corrida — e só cobre exercício autorregulado (prova contra o relógio), não protocolos de intensidade fixa até a exaustão, onde a desidratação tende a prejudicar mais. Nuancia acsm-fluid-replacement: o teto de 2% é uma meta prudente de reposição, não uma linha rígida que sempre reduz o desempenho numa prova real.",
  },
  {
    id: "sweat-sodium-individual-variability-marathoners",
    topic: "hydration",
    claim:
      "A concentração de sódio no suor varia enormemente entre corredores: em 157 maratonistas, variou de 7,0 a 95,5 mmol/L (média 42,9), com cerca de 20% classificados como \"suadores salgados\" (>60 mmol/L) — a concentração não se correlacionou com taxa de suor, idade, características corporais nem variáveis de treino, só fracamente com o ritmo de corrida e o sexo.",
    bullets: [
      "**157 maratonistas**: sódio no suor de **7,0 a 95,5 mmol/L** — variação enorme",
      "**~20%** são \"suadores salgados\" (**>60 mmol/L**), precisam de reposição diferente",
      "Não correlaciona com taxa de suor, idade, corpo ou treino — só fraco com ritmo/sexo",
    ],
    strength: "moderada",
    source: {
      name: "Lara et al. (2016) — Interindividual variability in sweat electrolyte concentration in marathoners",
      org: "Journal of the International Society of Sports Nutrition",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4966593/",
      citable: true,
    },
  },

  // ---------------------------------------------------------- nutrition timing
  {
    id: "anabolic-window-overstated",
    topic: "nutrition_timing",
    claim:
      "A \"janela anabólica\" estrita de 30–45 minutos pós-treino é mais mito do que ciência sólida — a ingestão total de proteína ao longo do dia importa mais do que o timing exato da refeição pós-treino.",
    bullets: [
      "\"Janela anabólica\" de **30–45min** pós-treino — mais mito que ciência",
      "Proteína total do dia importa mais que o timing exato",
    ],
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
    bullets: [
      "Posição conjunta sobre tipo, quantidade e timing de nutrientes",
      "Referência canônica pra prescrição nutricional de atletas",
    ],
    strength: "forte",
    source: {
      name: "Academy of Nutrition and Dietetics, ACSM — Nutrition and Athletic Performance (2016)",
      org: "American College of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/26891166/",
      citable: true,
    },
    caveat: "Coautoria inclui a Dietitians of Canada — a posição em si é conjunta, não exclusivamente americana.",
  },
  {
    id: "acsm-carb-intake-during-exercise",
    topic: "nutrition_timing",
    claim:
      "Pra exercício contínuo acima de 60–90 minutos, a mesma posição conjunta ACSM/Academy of Nutrition and Dietetics recomenda 30–60g de carboidrato por hora, subindo a até ~90g/hora (múltiplas fontes de carboidrato) em esforços de ultra-endurance acima de 2h30 — a necessidade escala com o tempo de esforço, não com o pace.",
    bullets: [
      "30–60g de carboidrato/hora acima de 60–90min contínuos",
      "Até ~90g/hora (múltiplas fontes) em esforços acima de 2h30",
      "Necessidade escala com tempo de esforço, não com pace",
    ],
    strength: "forte",
    source: {
      name: "Academy of Nutrition and Dietetics, ACSM — Nutrition and Athletic Performance (2016)",
      org: "American College of Sports Medicine",
      url: "https://pubmed.ncbi.nlm.nih.gov/26891166/",
      citable: true,
    },
    caveat:
      "Mesma fonte de acsm-and-nutrition-athletic-performance — aqui só o número específico de carboidrato durante o esforço, extraído da mesma posição conjunta.",
  },
  {
    id: "carb-loading-1-day-protocol",
    topic: "nutrition_timing",
    claim:
      "Oito corredores de endurance treinados que comeram 10g/kg/dia de carboidrato de alto índice glicêmico, permanecendo fisicamente inativos, atingiram supercompensação de glicogênio muscular já em 1 dia (95→180 mmol/kg de peso úmido) — mais 2 dias seguidos da mesma dieta não aumentaram o glicogênio além disso, contrariando a convenção de que são necessários 3 dias de carb-loading.",
    bullets: [
      "**10g/kg/dia** de carboidrato de alto índice glicêmico, atletas inativos",
      "Glicogênio salta de **95 para 180 mmol/kg** já em **1 dia**",
      "Mais **2 dias** extras de dieta rica em carbo não aumentam além disso",
    ],
    strength: "moderada",
    source: {
      name: "Bussau, Fairchild, Rao, Steele & Fournier (2002) — Carbohydrate loading in human muscle: an improved 1 day protocol",
      org: "European Journal of Applied Physiology",
      url: "https://pubmed.ncbi.nlm.nih.gov/12111292/",
      citable: true,
    },
    caveat: "n=8, todos homens treinados — amostra pequena, mas medição direta por biópsia muscular, não estimativa indireta.",
  },
  {
    id: "issn-caffeine-dose-timing-endurance",
    topic: "nutrition_timing",
    claim:
      "O position stand da ISSN sobre cafeína e desempenho recomenda 3–6 mg/kg de peso corporal (efeito ergogênico já possível a partir de ~2 mg/kg; doses acima de 9 mg/kg trazem mais efeito colateral sem benefício extra), tomados cerca de 60 minutos antes do exercício — nessa dose, cafeína melhora consistentemente o desempenho de endurance (corrida e ciclismo) em 2–4% em dezenas de estudos.",
    bullets: [
      "**3–6 mg/kg** de peso corporal — dose recomendada (efeito já a partir de **~2 mg/kg**)",
      "Tomar **~60 min** antes do exercício",
      "Melhora de desempenho de endurance: **2–4%**, em dezenas de estudos",
    ],
    strength: "forte",
    source: {
      name: "Guest et al. (2021) — International Society of Sports Nutrition position stand: caffeine and exercise performance",
      org: "International Society of Sports Nutrition",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7777221/",
      citable: true,
    },
    caveat: "Acima de 9mg/kg os efeitos colaterais (ansiedade, taquicardia, insônia) sobem sem ganho extra de desempenho — dose alta não é dose melhor.",
  },
  {
    id: "post-exercise-carb-timing-window-washes-out",
    topic: "nutrition_timing",
    claim:
      "Ingerir carboidrato imediatamente após o exercício acelera a taxa de ressíntese de glicogênio nas primeiras 2 horas (7,7 vs 2,5 µmol/g/h com 2h de atraso), mas atrasar a primeira refeição em até 2h não muda a quantidade de glicogênio muscular medida em 8h ou 24h pós-exercício, desde que carboidrato suficiente seja ingerido ao longo da janela de recuperação — o mesmo padrão já registrado pra proteína (anabolic-window-overstated), agora pro carboidrato.",
    bullets: [
      "Carboidrato imediato: **7,7 µmol/g/h** de ressíntese vs **2,5 µmol/g/h** com atraso de 2h — só nas primeiras 2h",
      "Atrasar a 1ª refeição em até 2h **não muda** o glicogênio total às 8h/24h",
      "Vale só se carboidrato suficiente for ingerido depois — não é licença pra comer pouco",
    ],
    strength: "moderada",
    source: {
      name: "Ivy, Katz, Cutler, Sherman & Coyle (1988) — Journal of Applied Physiology 64(4):1480–1485",
      url: "https://journals.physiology.org/doi/abs/10.1152/jappl.1988.64.4.1480",
      citable: true,
    },
    caveat:
      "Dois ensaios cruzados pequenos com ciclistas (n=12 aqui; corroborado por Parkin et al. 1997, MSSE 29(2):220–224, n=6, que não achou diferença no glicogênio total às 8h/24h atrasando a 1ª refeição em 2h) — não corredores, e mede glicogênio direto por biópsia. Mesma lógica de anabolic-window-overstated, mas pro carboidrato em vez da proteína.",
  },
];
