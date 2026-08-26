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
];
