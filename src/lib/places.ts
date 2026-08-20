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

/**
 * A named loop inside a place, traced as a real polyline so it can be drawn
 * on the same basemap the run/history screens already use — not a hand-drawn
 * approximation. `points` come from OpenStreetMap way data (Overpass API):
 * every named path/cycleway segment inside the venue's real boundary,
 * stitched end-to-end into one loop by matching shared endpoints. Where OSM's
 * own path segments left a small gap (a junction it never tagged as
 * continuous), the loop is closed with a short straight line rather than
 * inventing a plausible-looking curve — see the CIRCUITS comment on each
 * entry below for how close that gap actually was.
 */
export interface RunningCircuit {
  name: string;
  distanceMeters: number;
  points: { lat: number; lon: number }[];
}

export interface RunningPlace {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  description: string;
  /**
   * Illustrated cover for the place card/detail header — a hand-drawn,
   * cel-shaded scene of a real, recognizable feature of the place (Avenida
   * Paulista's MASP, Ibirapuera's marquise, CERET's running track), not a
   * generic park stock image. Optional for the same reason `circuits` is:
   * a place with no cover yet just renders without one, rather than a
   * placeholder standing in for art that was never actually made.
   */
  coverImage?: string;
  criteria: PlaceCriteria;
  bestTime: string;
  /** Null for a linear route (no natural loop) or when no reliable figure exists. */
  loopDistanceMeters: number | null;
  /** Real safety caveat worth surfacing prominently — omitted when there isn't one. */
  safetyFlag?: string;
  sources: string[];
  /**
   * Named circuits worth drawing on a real map (see `/lugares/[id]`'s circuit
   * map). Optional and per-place: only populated where a real, verifiable
   * path trace exists — a place with no `circuits` just doesn't show that
   * section, rather than a fabricated loop standing in for research that was
   * never actually done.
   */
  circuits?: RunningCircuit[];
}

/** Cities with real researched entries. Anything else shown in the filter is "em breve". */
export const CITIES_WITH_PLACES = ["São Paulo"] as const;

export const RUNNING_PLACES: RunningPlace[] = [
  {
    id: "parque-ibirapuera",
    coverImage: "/lugares/parque-ibirapuera.webp",
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
    circuits: [
      // Volta do Lago: a paved ~2,7km cycleway/footway ring around the lake
      // (OSM tags: highway=cycleway, surface=asphalt, lit=yes, width=3) —
      // stitched from 4 way segments that close into an exact loop with zero
      // gap between the last and first point. The closest thing this list
      // has to ground truth.
      {
        name: "Volta do Lago",
        distanceMeters: 2680,
        points: [
          { lat: -23.585897, lon: -46.660654 }, { lat: -23.585775, lon: -46.660664 }, { lat: -23.585649, lon: -46.660645 }, { lat: -23.58548, lon: -46.660605 },
          { lat: -23.58518, lon: -46.660508 }, { lat: -23.585, lon: -46.66042 }, { lat: -23.584779, lon: -46.660237 }, { lat: -23.584735, lon: -46.660201 },
          { lat: -23.584628, lon: -46.660136 }, { lat: -23.584558, lon: -46.660102 }, { lat: -23.584501, lon: -46.660085 }, { lat: -23.584424, lon: -46.660078 },
          { lat: -23.584363, lon: -46.660079 }, { lat: -23.584284, lon: -46.660083 }, { lat: -23.584156, lon: -46.660099 }, { lat: -23.584041, lon: -46.66012 },
          { lat: -23.583947, lon: -46.660146 }, { lat: -23.583869, lon: -46.660171 }, { lat: -23.58377, lon: -46.660216 }, { lat: -23.583738, lon: -46.660236 },
          { lat: -23.583707, lon: -46.66026 }, { lat: -23.583636, lon: -46.660311 }, { lat: -23.58356, lon: -46.660397 }, { lat: -23.583458, lon: -46.660517 },
          { lat: -23.583369, lon: -46.660668 }, { lat: -23.58333, lon: -46.660778 }, { lat: -23.583291, lon: -46.660905 }, { lat: -23.583264, lon: -46.661007 },
          { lat: -23.583238, lon: -46.661135 }, { lat: -23.583236, lon: -46.661218 }, { lat: -23.583238, lon: -46.66129 }, { lat: -23.58324, lon: -46.661377 },
          { lat: -23.583244, lon: -46.661452 }, { lat: -23.583267, lon: -46.661652 }, { lat: -23.583291, lon: -46.661777 }, { lat: -23.58331, lon: -46.661843 },
          { lat: -23.58335, lon: -46.661938 }, { lat: -23.583404, lon: -46.662038 }, { lat: -23.583447, lon: -46.662098 }, { lat: -23.58354, lon: -46.662248 },
          { lat: -23.583595, lon: -46.662331 }, { lat: -23.583633, lon: -46.662391 }, { lat: -23.583669, lon: -46.662433 }, { lat: -23.583727, lon: -46.662472 },
          { lat: -23.584057, lon: -46.662605 }, { lat: -23.584223, lon: -46.662677 }, { lat: -23.584646, lon: -46.662794 }, { lat: -23.5849, lon: -46.662844 },
          { lat: -23.585563, lon: -46.662936 }, { lat: -23.586108, lon: -46.663005 }, { lat: -23.586463, lon: -46.663043 }, { lat: -23.58665, lon: -46.663085 },
          { lat: -23.586859, lon: -46.663121 }, { lat: -23.586892, lon: -46.663126 }, { lat: -23.587023, lon: -46.663137 }, { lat: -23.587169, lon: -46.663141 },
          { lat: -23.587326, lon: -46.663122 }, { lat: -23.587467, lon: -46.663096 }, { lat: -23.587635, lon: -46.66303 }, { lat: -23.587813, lon: -46.66295 },
          { lat: -23.587831, lon: -46.662943 }, { lat: -23.587933, lon: -46.662904 }, { lat: -23.588168, lon: -46.662807 }, { lat: -23.588198, lon: -46.6628 },
          { lat: -23.588397, lon: -46.662746 }, { lat: -23.588541, lon: -46.662744 }, { lat: -23.58868, lon: -46.662764 }, { lat: -23.588898, lon: -46.662815 },
          { lat: -23.589061, lon: -46.66282 }, { lat: -23.589244, lon: -46.662792 }, { lat: -23.589394, lon: -46.662769 }, { lat: -23.589553, lon: -46.662699 },
          { lat: -23.589782, lon: -46.662542 }, { lat: -23.589995, lon: -46.662376 }, { lat: -23.590195, lon: -46.662185 }, { lat: -23.590213, lon: -46.662158 },
          { lat: -23.590315, lon: -46.661955 }, { lat: -23.590428, lon: -46.661724 }, { lat: -23.5905, lon: -46.66156 }, { lat: -23.590579, lon: -46.661415 },
          { lat: -23.590665, lon: -46.661301 }, { lat: -23.590774, lon: -46.661211 }, { lat: -23.591044, lon: -46.660968 }, { lat: -23.591178, lon: -46.660874 },
          { lat: -23.591276, lon: -46.660801 }, { lat: -23.591515, lon: -46.660632 }, { lat: -23.591622, lon: -46.660544 }, { lat: -23.591641, lon: -46.660512 },
          { lat: -23.591651, lon: -46.660494 }, { lat: -23.591687, lon: -46.660411 }, { lat: -23.591698, lon: -46.660314 }, { lat: -23.591706, lon: -46.660114 },
          { lat: -23.591703, lon: -46.65993 }, { lat: -23.591667, lon: -46.659758 }, { lat: -23.591609, lon: -46.659596 }, { lat: -23.591569, lon: -46.659526 },
          { lat: -23.591545, lon: -46.659484 }, { lat: -23.59149, lon: -46.659428 }, { lat: -23.591231, lon: -46.659178 }, { lat: -23.591046, lon: -46.659002 },
          { lat: -23.591027, lon: -46.658984 }, { lat: -23.590815, lon: -46.658749 }, { lat: -23.590738, lon: -46.658658 }, { lat: -23.590588, lon: -46.65847 },
          { lat: -23.590479, lon: -46.6583 }, { lat: -23.590351, lon: -46.658004 }, { lat: -23.59032, lon: -46.657929 }, { lat: -23.590222, lon: -46.657655 },
          { lat: -23.590181, lon: -46.657552 }, { lat: -23.590159, lon: -46.657501 }, { lat: -23.589978, lon: -46.65716 }, { lat: -23.589761, lon: -46.656739 },
          { lat: -23.589748, lon: -46.656714 }, { lat: -23.589669, lon: -46.656605 }, { lat: -23.589584, lon: -46.65652 }, { lat: -23.589517, lon: -46.65645 },
          { lat: -23.589409, lon: -46.656391 }, { lat: -23.589326, lon: -46.656362 }, { lat: -23.589165, lon: -46.656328 }, { lat: -23.58895, lon: -46.656306 },
          { lat: -23.588877, lon: -46.656267 }, { lat: -23.588822, lon: -46.65624 }, { lat: -23.588714, lon: -46.656283 }, { lat: -23.588642, lon: -46.656338 },
          { lat: -23.588531, lon: -46.656414 }, { lat: -23.588425, lon: -46.656484 }, { lat: -23.588208, lon: -46.656654 }, { lat: -23.588087, lon: -46.65674 },
          { lat: -23.587976, lon: -46.656836 }, { lat: -23.587632, lon: -46.657157 }, { lat: -23.587532, lon: -46.657249 }, { lat: -23.587406, lon: -46.657371 },
          { lat: -23.587289, lon: -46.657511 }, { lat: -23.587144, lon: -46.657748 }, { lat: -23.587032, lon: -46.657924 }, { lat: -23.586922, lon: -46.658099 },
          { lat: -23.586818, lon: -46.65828 }, { lat: -23.586703, lon: -46.658512 }, { lat: -23.586644, lon: -46.658678 }, { lat: -23.586622, lon: -46.658864 },
          { lat: -23.586575, lon: -46.659167 }, { lat: -23.586558, lon: -46.659373 }, { lat: -23.586505, lon: -46.659849 }, { lat: -23.586471, lon: -46.660018 },
          { lat: -23.58644, lon: -46.66012 }, { lat: -23.586399, lon: -46.660214 }, { lat: -23.586289, lon: -46.660389 }, { lat: -23.586149, lon: -46.660532 },
          { lat: -23.586035, lon: -46.660603 }, { lat: -23.585897, lon: -46.660654 },
        ],
      },
      // Volta da Grade: the ~6km unpaved perimeter trail, tagged "Trilha
      // 6km"/"Trilha 6 km" across 21 separate OSM way fragments. Stitched
      // end-to-end, this closes to within 263m (out of ~5,1km traced) —
      // real OSM data doesn't tag every junction as continuous. That last
      // stretch is a straight line between the two open ends rather than a
      // guessed curve; the actual loop is very likely ~6km as the park
      // itself states, this trace just falls a bit short of it.
      {
        name: "Volta da Grade",
        distanceMeters: 5400,
        points: [
          { lat: -23.590352, lon: -46.65567 }, { lat: -23.590756, lon: -46.655643 }, { lat: -23.591089, lon: -46.655591 }, { lat: -23.591243, lon: -46.655655 },
          { lat: -23.59149, lon: -46.655585 }, { lat: -23.591652, lon: -46.655742 }, { lat: -23.591898, lon: -46.655882 }, { lat: -23.591892, lon: -46.656037 },
          { lat: -23.592022, lon: -46.656387 }, { lat: -23.592459, lon: -46.656565 }, { lat: -23.59267, lon: -46.657206 }, { lat: -23.593062, lon: -46.658423 },
          { lat: -23.593207, lon: -46.658815 }, { lat: -23.593344, lon: -46.659227 }, { lat: -23.593473, lon: -46.659696 }, { lat: -23.593547, lon: -46.660144 },
          { lat: -23.593644, lon: -46.660323 }, { lat: -23.59373, lon: -46.66045 }, { lat: -23.593899, lon: -46.661027 }, { lat: -23.593157, lon: -46.661426 },
          { lat: -23.593121, lon: -46.661524 }, { lat: -23.593324, lon: -46.662159 }, { lat: -23.593184, lon: -46.66223 }, { lat: -23.592093, lon: -46.661964 },
          { lat: -23.591777, lon: -46.661986 }, { lat: -23.59151, lon: -46.661937 }, { lat: -23.591313, lon: -46.66196 }, { lat: -23.591033, lon: -46.662881 },
          { lat: -23.590843, lon: -46.66316 }, { lat: -23.590794, lon: -46.6634 }, { lat: -23.59068, lon: -46.663503 }, { lat: -23.590516, lon: -46.663452 },
          { lat: -23.590329, lon: -46.663285 }, { lat: -23.590021, lon: -46.663456 }, { lat: -23.589993, lon: -46.663939 }, { lat: -23.589963, lon: -46.664085 },
          { lat: -23.589838, lon: -46.664191 }, { lat: -23.589625, lon: -46.66398 }, { lat: -23.589546, lon: -46.663953 }, { lat: -23.589496, lon: -46.664093 },
          { lat: -23.589364, lon: -46.664183 }, { lat: -23.589098, lon: -46.66397 }, { lat: -23.589045, lon: -46.663711 }, { lat: -23.588862, lon: -46.663605 },
          { lat: -23.588573, lon: -46.663843 }, { lat: -23.588466, lon: -46.663839 }, { lat: -23.588557, lon: -46.663403 }, { lat: -23.588536, lon: -46.663289 },
          { lat: -23.5884, lon: -46.663307 }, { lat: -23.588306, lon: -46.663496 }, { lat: -23.588375, lon: -46.663712 }, { lat: -23.588097, lon: -46.663778 },
          { lat: -23.587799, lon: -46.663902 }, { lat: -23.587542, lon: -46.663906 }, { lat: -23.587402, lon: -46.663812 }, { lat: -23.587296, lon: -46.663536 },
          { lat: -23.587225, lon: -46.663341 }, { lat: -23.586159, lon: -46.663176 }, { lat: -23.584563, lon: -46.662972 }, { lat: -23.584155, lon: -46.662858 },
          { lat: -23.583205, lon: -46.662769 }, { lat: -23.582273, lon: -46.662666 }, { lat: -23.582146, lon: -46.662717 }, { lat: -23.582245, lon: -46.663024 },
          { lat: -23.58223, lon: -46.663166 }, { lat: -23.58211, lon: -46.663092 }, { lat: -23.582037, lon: -46.663086 }, { lat: -23.58198, lon: -46.663184 },
          { lat: -23.581821, lon: -46.663172 }, { lat: -23.581682, lon: -46.663051 }, { lat: -23.581618, lon: -46.662951 }, { lat: -23.581462, lon: -46.662957 },
          { lat: -23.581288, lon: -46.662872 }, { lat: -23.581107, lon: -46.662884 }, { lat: -23.580971, lon: -46.662678 }, { lat: -23.580782, lon: -46.662502 },
          { lat: -23.580722, lon: -46.662308 }, { lat: -23.580743, lon: -46.662164 }, { lat: -23.580643, lon: -46.662119 }, { lat: -23.580671, lon: -46.662052 },
          { lat: -23.58071, lon: -46.661938 }, { lat: -23.580575, lon: -46.661729 }, { lat: -23.580372, lon: -46.661453 }, { lat: -23.580426, lon: -46.661252 },
          { lat: -23.580519, lon: -46.661202 }, { lat: -23.580565, lon: -46.6614 }, { lat: -23.580817, lon: -46.661917 }, { lat: -23.581585, lon: -46.662577 },
          { lat: -23.582293, lon: -46.662534 }, { lat: -23.582346, lon: -46.662376 }, { lat: -23.582896, lon: -46.662278 }, { lat: -23.583142, lon: -46.661968 },
          { lat: -23.583167, lon: -46.661654 }, { lat: -23.583005, lon: -46.661293 }, { lat: -23.582811, lon: -46.661043 }, { lat: -23.582753, lon: -46.660738 },
          { lat: -23.582632, lon: -46.660218 }, { lat: -23.58262, lon: -46.65988 }, { lat: -23.582722, lon: -46.659473 }, { lat: -23.582521, lon: -46.659179 },
          { lat: -23.582353, lon: -46.658911 }, { lat: -23.582503, lon: -46.658776 }, { lat: -23.582755, lon: -46.658653 }, { lat: -23.582882, lon: -46.658448 },
          { lat: -23.582929, lon: -46.658234 }, { lat: -23.582904, lon: -46.65806 }, { lat: -23.582812, lon: -46.657836 }, { lat: -23.58282, lon: -46.657756 },
          { lat: -23.582873, lon: -46.657723 }, { lat: -23.582998, lon: -46.657736 }, { lat: -23.583168, lon: -46.657817 }, { lat: -23.583288, lon: -46.657697 },
          { lat: -23.583426, lon: -46.657469 }, { lat: -23.583589, lon: -46.657029 }, { lat: -23.583813, lon: -46.656785 }, { lat: -23.584957, lon: -46.656077 },
          { lat: -23.585399, lon: -46.655885 }, { lat: -23.585737, lon: -46.655695 }, { lat: -23.585843, lon: -46.655591 }, { lat: -23.585995, lon: -46.655458 },
          { lat: -23.586331, lon: -46.655792 }, { lat: -23.586386, lon: -46.655731 }, { lat: -23.586409, lon: -46.655679 }, { lat: -23.586413, lon: -46.65563 },
          { lat: -23.586394, lon: -46.655555 }, { lat: -23.586369, lon: -46.655442 }, { lat: -23.586374, lon: -46.655342 }, { lat: -23.586404, lon: -46.655226 },
          { lat: -23.586541, lon: -46.654982 }, { lat: -23.587077, lon: -46.654133 }, { lat: -23.587254, lon: -46.65387 }, { lat: -23.587279, lon: -46.653585 },
          { lat: -23.587494, lon: -46.653269 }, { lat: -23.587747, lon: -46.653148 }, { lat: -23.588483, lon: -46.652886 }, { lat: -23.588714, lon: -46.652898 },
          { lat: -23.589599, lon: -46.653552 }, { lat: -23.58974, lon: -46.653528 }, { lat: -23.590051, lon: -46.653493 }, { lat: -23.590539, lon: -46.653209 },
          { lat: -23.590632, lon: -46.653107 },
        ],
      },
    ],
  },
  {
    id: "parque-villa-lobos",
    coverImage: "/lugares/parque-villa-lobos.webp",
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
    circuits: [
      // Anel principal: rastreado de 6 trechos reais do OpenStreetMap (Overpass
      // API) tagueados "Ciclovia Parque Villa-Lobos" — inclui o pequeno viaduto
      // cicloviário que conecta duas pontas do anel. Fecha em loop exato, sem
      // gap. 3.436m traçados contra os ~3,5km da descrição oficial — a
      // correspondência mais próxima desta lista.
      {
        name: "Anel principal",
        distanceMeters: 3436,
        points: [
          { lat: -23.5451016, lon: -46.7210741 }, { lat: -23.5449339, lon: -46.7208308 }, { lat: -23.5448675, lon: -46.7207798 }, { lat: -23.5449192, lon: -46.7206189 },
          { lat: -23.5454208, lon: -46.719487 }, { lat: -23.5456888, lon: -46.7190605 }, { lat: -23.5460219, lon: -46.7187545 }, { lat: -23.5460584, lon: -46.718725 },
          { lat: -23.5465087, lon: -46.7184757 }, { lat: -23.5468786, lon: -46.7182335 }, { lat: -23.5471669, lon: -46.7180386 }, { lat: -23.5474519, lon: -46.717939 },
          { lat: -23.5479549, lon: -46.7178266 }, { lat: -23.548029, lon: -46.7178096 }, { lat: -23.5482049, lon: -46.7177693 }, { lat: -23.5483286, lon: -46.7177913 },
          { lat: -23.5484833, lon: -46.7178919 }, { lat: -23.5486154, lon: -46.7181027 }, { lat: -23.5486539, lon: -46.7183506 }, { lat: -23.5486378, lon: -46.7184227 },
          { lat: -23.5484855, lon: -46.7185827 }, { lat: -23.5483173, lon: -46.718677 }, { lat: -23.5482583, lon: -46.7187869 }, { lat: -23.5482214, lon: -46.7188996 },
          { lat: -23.5482042, lon: -46.7190632 }, { lat: -23.5482042, lon: -46.7192027 }, { lat: -23.5482288, lon: -46.7193368 }, { lat: -23.5482805, lon: -46.7195138 },
          { lat: -23.5482903, lon: -46.7196184 }, { lat: -23.5482583, lon: -46.7198518 }, { lat: -23.5481993, lon: -46.7200985 }, { lat: -23.5480838, lon: -46.7203372 },
          { lat: -23.5480002, lon: -46.7204553 }, { lat: -23.5479584, lon: -46.7205652 }, { lat: -23.5479239, lon: -46.7206886 }, { lat: -23.5478619, lon: -46.7208347 },
          { lat: -23.5478574, lon: -46.7210224 }, { lat: -23.5478939, lon: -46.7212355 }, { lat: -23.5479746, lon: -46.7214236 }, { lat: -23.5481401, lon: -46.7216456 },
          { lat: -23.5482598, lon: -46.7217457 }, { lat: -23.5485707, lon: -46.7218818 }, { lat: -23.5489991, lon: -46.7222747 }, { lat: -23.5491871, lon: -46.7224516 },
          { lat: -23.5498859, lon: -46.7228396 }, { lat: -23.5502127, lon: -46.7230104 }, { lat: -23.550407, lon: -46.7231646 }, { lat: -23.5505004, lon: -46.7232436 },
          { lat: -23.5505755, lon: -46.7233518 }, { lat: -23.5506391, lon: -46.7234797 }, { lat: -23.5506705, lon: -46.7235809 }, { lat: -23.5506826, lon: -46.7237023 },
          { lat: -23.5506915, lon: -46.7238211 }, { lat: -23.550653, lon: -46.7241131 }, { lat: -23.5501304, lon: -46.7251964 }, { lat: -23.5495436, lon: -46.7263068 },
          { lat: -23.5494003, lon: -46.7265087 }, { lat: -23.5493161, lon: -46.7266112 }, { lat: -23.5492239, lon: -46.7266979 }, { lat: -23.5488136, lon: -46.7270134 },
          { lat: -23.548591, lon: -46.7274798 }, { lat: -23.5485723, lon: -46.7276813 }, { lat: -23.5485576, lon: -46.7277708 }, { lat: -23.5485177, lon: -46.7278735 },
          { lat: -23.5479826, lon: -46.7288027 }, { lat: -23.5478209, lon: -46.7290608 }, { lat: -23.5477529, lon: -46.7291608 }, { lat: -23.5476941, lon: -46.7292134 },
          { lat: -23.5475926, lon: -46.729283 }, { lat: -23.547466, lon: -46.7293386 }, { lat: -23.5473568, lon: -46.72937 }, { lat: -23.5472845, lon: -46.7293799 },
          { lat: -23.5471734, lon: -46.7293811 }, { lat: -23.5470958, lon: -46.7293752 }, { lat: -23.5469913, lon: -46.729355 }, { lat: -23.5469364, lon: -46.7293296 },
          { lat: -23.5469063, lon: -46.7293113 }, { lat: -23.5466487, lon: -46.7291453 }, { lat: -23.5464834, lon: -46.7290453 }, { lat: -23.546254, lon: -46.7288791 },
          { lat: -23.5460968, lon: -46.7287498 }, { lat: -23.545773, lon: -46.7284995 }, { lat: -23.5456065, lon: -46.7283721 }, { lat: -23.5455159, lon: -46.7283175 },
          { lat: -23.545435, lon: -46.7282813 }, { lat: -23.5452469, lon: -46.7282161 }, { lat: -23.5451322, lon: -46.7281977 }, { lat: -23.5449278, lon: -46.7281979 },
          { lat: -23.5448259, lon: -46.7282122 }, { lat: -23.5445969, lon: -46.7282443 }, { lat: -23.5444746, lon: -46.7282614 }, { lat: -23.5439359, lon: -46.7284411 },
          { lat: -23.5437716, lon: -46.7285 }, { lat: -23.5436005, lon: -46.7285613 }, { lat: -23.5435537, lon: -46.7285558 }, { lat: -23.5434946, lon: -46.728525 },
          { lat: -23.5434643, lon: -46.7284707 }, { lat: -23.5434161, lon: -46.7283844 }, { lat: -23.543403, lon: -46.7283276 }, { lat: -23.5433945, lon: -46.7282906 },
          { lat: -23.5433962, lon: -46.728168 }, { lat: -23.5433989, lon: -46.7279724 }, { lat: -23.5434128, lon: -46.7276974 }, { lat: -23.5434174, lon: -46.7275692 },
          { lat: -23.5434513, lon: -46.7274597 }, { lat: -23.5435195, lon: -46.7273374 }, { lat: -23.543538, lon: -46.7273103 }, { lat: -23.5437198, lon: -46.7271181 },
          { lat: -23.5438527, lon: -46.7269777 }, { lat: -23.5439707, lon: -46.7269402 }, { lat: -23.544074, lon: -46.7269777 }, { lat: -23.5441822, lon: -46.7269884 },
          { lat: -23.5442904, lon: -46.7269616 }, { lat: -23.5443299, lon: -46.726896 }, { lat: -23.5443887, lon: -46.7265745 }, { lat: -23.544401, lon: -46.7265075 },
          { lat: -23.5444047, lon: -46.7264268 }, { lat: -23.544436, lon: -46.7263168 }, { lat: -23.5444436, lon: -46.7262571 }, { lat: -23.5444249, lon: -46.7260924 },
          { lat: -23.5444011, lon: -46.7259437 }, { lat: -23.5443938, lon: -46.7258631 }, { lat: -23.5443905, lon: -46.7257719 }, { lat: -23.5443948, lon: -46.7250938 },
          { lat: -23.5443947, lon: -46.7250426 }, { lat: -23.5443932, lon: -46.7244403 }, { lat: -23.5443943, lon: -46.7244168 }, { lat: -23.5444126, lon: -46.7240253 },
          { lat: -23.5445159, lon: -46.7229739 }, { lat: -23.5445798, lon: -46.7224911 }, { lat: -23.5446782, lon: -46.7223945 }, { lat: -23.5448356, lon: -46.7223516 },
          { lat: -23.5449782, lon: -46.7223301 }, { lat: -23.5450421, lon: -46.7222926 }, { lat: -23.5451552, lon: -46.7220941 }, { lat: -23.5452536, lon: -46.721842 },
          { lat: -23.5452978, lon: -46.721681 }, { lat: -23.5452519, lon: -46.7215328 }, { lat: -23.545173, lon: -46.7213291 }, { lat: -23.5451016, lon: -46.7210741 },
        ],
      },
    ],
  },
  {
    id: "parque-do-povo",
    coverImage: "/lugares/parque-do-povo.webp",
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
    circuits: [
      // Pista do parque: rastreado de trechos reais do OpenStreetMap (Overpass
      // API) dentro do parque — fecha em loop exato, sem gap. Mais curto que a
      // estimativa de ~1,5km da própria prefeitura porque essa é só a pista
      // interna que o OSM tem mapeada; o restante do circuito citado inclui
      // caminhos ainda não traçados publicamente.
      {
        name: "Pista do parque",
        distanceMeters: 911,
        points: [
          { lat: -23.589737, lon: -46.688366 }, { lat: -23.589745, lon: -46.688282 }, { lat: -23.589786, lon: -46.688126 }, { lat: -23.589768, lon: -46.688096 },
          { lat: -23.589087, lon: -46.687878 }, { lat: -23.589047, lon: -46.688005 }, { lat: -23.588975, lon: -46.688227 }, { lat: -23.588918, lon: -46.688415 },
          { lat: -23.588883, lon: -46.68845 }, { lat: -23.58877, lon: -46.688449 }, { lat: -23.588602, lon: -46.688398 }, { lat: -23.588539, lon: -46.688364 },
          { lat: -23.588506, lon: -46.688319 }, { lat: -23.588493, lon: -46.688244 }, { lat: -23.588494, lon: -46.688176 }, { lat: -23.588467, lon: -46.688089 },
          { lat: -23.588418, lon: -46.68801 }, { lat: -23.588338, lon: -46.687946 }, { lat: -23.588354, lon: -46.687829 }, { lat: -23.588321, lon: -46.687833 },
          { lat: -23.58826, lon: -46.687823 }, { lat: -23.588221, lon: -46.687793 }, { lat: -23.588175, lon: -46.687776 }, { lat: -23.588116, lon: -46.687769 },
          { lat: -23.588064, lon: -46.687785 }, { lat: -23.588022, lon: -46.68779 }, { lat: -23.587971, lon: -46.687848 }, { lat: -23.587939, lon: -46.687875 },
          { lat: -23.587895, lon: -46.687892 }, { lat: -23.587851, lon: -46.687819 }, { lat: -23.587874, lon: -46.68793 }, { lat: -23.587849, lon: -46.687936 },
          { lat: -23.587807, lon: -46.687947 }, { lat: -23.587768, lon: -46.687968 }, { lat: -23.58772, lon: -46.688001 }, { lat: -23.58768, lon: -46.688042 },
          { lat: -23.587653, lon: -46.688081 }, { lat: -23.587619, lon: -46.688118 }, { lat: -23.587573, lon: -46.688153 }, { lat: -23.58752, lon: -46.688184 },
          { lat: -23.587546, lon: -46.68802 }, { lat: -23.587507, lon: -46.688222 }, { lat: -23.587483, lon: -46.688292 }, { lat: -23.587462, lon: -46.688332 },
          { lat: -23.587423, lon: -46.688401 }, { lat: -23.58741, lon: -46.688443 }, { lat: -23.587401, lon: -46.688494 }, { lat: -23.587396, lon: -46.688563 },
          { lat: -23.587375, lon: -46.688609 }, { lat: -23.587347, lon: -46.688702 }, { lat: -23.587304, lon: -46.688747 }, { lat: -23.587412, lon: -46.688738 },
          { lat: -23.587433, lon: -46.688757 }, { lat: -23.58747, lon: -46.688768 }, { lat: -23.587501, lon: -46.6888 }, { lat: -23.587523, lon: -46.688851 },
          { lat: -23.587531, lon: -46.688898 }, { lat: -23.587529, lon: -46.688938 }, { lat: -23.58755, lon: -46.688966 }, { lat: -23.587577, lon: -46.688983 },
          { lat: -23.587657, lon: -46.689017 }, { lat: -23.587696, lon: -46.689057 }, { lat: -23.587718, lon: -46.689098 }, { lat: -23.587723, lon: -46.689153 },
          { lat: -23.58781, lon: -46.689087 }, { lat: -23.587915, lon: -46.689081 }, { lat: -23.58796, lon: -46.6891 }, { lat: -23.588009, lon: -46.689149 },
          { lat: -23.588061, lon: -46.689196 }, { lat: -23.588112, lon: -46.689202 }, { lat: -23.588165, lon: -46.689187 }, { lat: -23.588214, lon: -46.689153 },
          { lat: -23.588255, lon: -46.689149 }, { lat: -23.588255, lon: -46.689149 }, { lat: -23.588284, lon: -46.689136 }, { lat: -23.588407, lon: -46.689087 },
          { lat: -23.588436, lon: -46.689051 }, { lat: -23.588457, lon: -46.689002 }, { lat: -23.588514, lon: -46.68894 }, { lat: -23.588551, lon: -46.688923 },
          { lat: -23.588621, lon: -46.688928 }, { lat: -23.58869, lon: -46.68894 }, { lat: -23.588718, lon: -46.688983 }, { lat: -23.588847, lon: -46.68878 },
          { lat: -23.588877, lon: -46.688651 }, { lat: -23.58896, lon: -46.688427 }, { lat: -23.58902, lon: -46.688254 }, { lat: -23.589053, lon: -46.688147 },
          { lat: -23.589067, lon: -46.688103 }, { lat: -23.589089, lon: -46.688023 }, { lat: -23.589023, lon: -46.68808 }, { lat: -23.589047, lon: -46.688005 },
          { lat: -23.589067, lon: -46.688103 }, { lat: -23.589232, lon: -46.688182 }, { lat: -23.589438, lon: -46.68826 }, { lat: -23.589737, lon: -46.688366 },
        ],
      },
    ],
  },
  {
    id: "avenida-paulista",
    coverImage: "/lugares/avenida-paulista.webp",
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
    circuits: [
      // Ciclovia central: um único trecho real do OpenStreetMap (Overpass API),
      // tagueado "Ciclovia da Avenida Paulista" — via inteira, sem stitching.
      // Linear (a avenida não fecha em loop), de perto da Praça Oswaldo Cruz
      // até perto da Praça Mal. Cordeiro de Farias. 2.591m traçados contra os
      // ~2,8km da descrição — o OSM não tem o trecho final mapeado como
      // ciclovia contínua nas duas pontas.
      {
        name: "Ciclovia central",
        distanceMeters: 2591,
        points: [
          { lat: -23.5713136, lon: -46.6442589 }, { lat: -23.5712487, lon: -46.6443283 }, { lat: -23.5710683, lon: -46.6445463 }, { lat: -23.5709762, lon: -46.6446643 },
          { lat: -23.5706113, lon: -46.6451399 }, { lat: -23.5697606, lon: -46.646256 }, { lat: -23.569583, lon: -46.6464841 }, { lat: -23.5691873, lon: -46.6470064 },
          { lat: -23.5689111, lon: -46.6473633 }, { lat: -23.5688359, lon: -46.6474658 }, { lat: -23.5686544, lon: -46.6477017 }, { lat: -23.5677531, lon: -46.6488827 },
          { lat: -23.5676507, lon: -46.6490193 }, { lat: -23.5676035, lon: -46.6490834 }, { lat: -23.5674557, lon: -46.6492603 }, { lat: -23.5663593, lon: -46.6505715 },
          { lat: -23.5661442, lon: -46.6508323 }, { lat: -23.5657742, lon: -46.6512747 }, { lat: -23.5651915, lon: -46.6519707 }, { lat: -23.5649343, lon: -46.6522838 },
          { lat: -23.5645585, lon: -46.6527333 }, { lat: -23.5640304, lon: -46.6533673 }, { lat: -23.5637032, lon: -46.6537606 }, { lat: -23.5635093, lon: -46.6539962 },
          { lat: -23.5627842, lon: -46.6548813 }, { lat: -23.5623374, lon: -46.6554312 }, { lat: -23.5620129, lon: -46.6558245 }, { lat: -23.5617675, lon: -46.6561146 },
          { lat: -23.5611704, lon: -46.6567868 }, { lat: -23.5608957, lon: -46.6570937 }, { lat: -23.5607106, lon: -46.6573008 }, { lat: -23.5602386, lon: -46.65782 },
          { lat: -23.5600549, lon: -46.6580207 }, { lat: -23.5596947, lon: -46.6584051 }, { lat: -23.5590966, lon: -46.6590864 }, { lat: -23.5583498, lon: -46.6599264 },
          { lat: -23.55812, lon: -46.6602017 }, { lat: -23.5578313, lon: -46.660536 }, { lat: -23.5573556, lon: -46.661097 }, { lat: -23.557242, lon: -46.6612782 },
          { lat: -23.5566728, lon: -46.6619417 }, { lat: -23.5566347, lon: -46.661984 }, { lat: -23.5565688, lon: -46.6620608 }, { lat: -23.5565393, lon: -46.662089 },
          { lat: -23.5565212, lon: -46.6621073 }, { lat: -23.5565005, lon: -46.6621387 }, { lat: -23.5560085, lon: -46.6626814 }, { lat: -23.5559716, lon: -46.6627106 },
          { lat: -23.5559406, lon: -46.6627111 }, { lat: -23.5559138, lon: -46.6627115 }, { lat: -23.5558708, lon: -46.6627121 }, { lat: -23.5558021, lon: -46.6627874 },
          { lat: -23.5557268, lon: -46.6628667 }, { lat: -23.5557107, lon: -46.6628857 }, { lat: -23.5556992, lon: -46.6628993 }, { lat: -23.5556674, lon: -46.6629365 },
          { lat: -23.5556262, lon: -46.6629848 },
        ],
      },
    ],
  },
  {
    id: "parque-agua-branca",
    coverImage: "/lugares/parque-agua-branca.webp",
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
    circuits: [
      // Circuito interno: rastreado de trechos reais do OpenStreetMap (Overpass
      // API) dentro do parque — fecha em loop exato, sem gap.
      {
        name: "Circuito interno",
        distanceMeters: 1100,
        points: [
          { lat: -23.527813, lon: -46.66735 }, { lat: -23.527793, lon: -46.667415 }, { lat: -23.527779, lon: -46.667462 }, { lat: -23.527582, lon: -46.668101 },
          { lat: -23.527522, lon: -46.668288 }, { lat: -23.52744, lon: -46.668549 }, { lat: -23.527136, lon: -46.669507 }, { lat: -23.526892, lon: -46.67026 },
          { lat: -23.52688, lon: -46.670298 }, { lat: -23.526885, lon: -46.670327 }, { lat: -23.526897, lon: -46.670347 }, { lat: -23.52778, lon: -46.670906 },
          { lat: -23.527794, lon: -46.670916 }, { lat: -23.527807, lon: -46.670919 }, { lat: -23.52782, lon: -46.670919 }, { lat: -23.527833, lon: -46.670915 },
          { lat: -23.527843, lon: -46.670906 }, { lat: -23.52785, lon: -46.670892 }, { lat: -23.5285, lon: -46.669709 }, { lat: -23.528769, lon: -46.669232 },
          { lat: -23.529324, lon: -46.668248 }, { lat: -23.529379, lon: -46.66815 }, { lat: -23.529529, lon: -46.667872 }, { lat: -23.529754, lon: -46.667456 },
          { lat: -23.529767, lon: -46.667431 }, { lat: -23.529828, lon: -46.667319 }, { lat: -23.529929, lon: -46.667132 }, { lat: -23.530275, lon: -46.666492 },
          { lat: -23.530317, lon: -46.666414 }, { lat: -23.53032, lon: -46.666387 }, { lat: -23.530307, lon: -46.666364 }, { lat: -23.530277, lon: -46.666344 },
          { lat: -23.530243, lon: -46.666321 }, { lat: -23.529687, lon: -46.665965 }, { lat: -23.529346, lon: -46.665751 }, { lat: -23.529293, lon: -46.665719 },
          { lat: -23.529252, lon: -46.665589 }, { lat: -23.529127, lon: -46.665625 }, { lat: -23.528997, lon: -46.665592 }, { lat: -23.528823, lon: -46.665591 },
          { lat: -23.52879, lon: -46.665593 }, { lat: -23.528623, lon: -46.665605 }, { lat: -23.528502, lon: -46.665614 }, { lat: -23.528416, lon: -46.665655 },
          { lat: -23.528353, lon: -46.66571 }, { lat: -23.52828, lon: -46.66585 }, { lat: -23.528237, lon: -46.665988 }, { lat: -23.528091, lon: -46.666458 },
          { lat: -23.528004, lon: -46.666737 }, { lat: -23.527993, lon: -46.666778 }, { lat: -23.527911, lon: -46.667035 }, { lat: -23.527867, lon: -46.667167 },
          { lat: -23.527842, lon: -46.667263 }, { lat: -23.527813, lon: -46.66735 },
        ],
      },
    ],
  },
  {
    id: "cidade-universitaria-usp",
    coverImage: "/lugares/cidade-universitaria-usp.webp",
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
    circuits: [
      // Margem da Raia: rastreado de um único trecho real do OpenStreetMap
      // (Overpass API), way tagueada "Pista da Raia". Esse way do OSM está
      // marcado como um loop fechado (primeiro nó = último nó), mas o "fecho"
      // de fato é um segmento reto de ~2.152m que salta direto de uma ponta a
      // outra da raia — não é geometria real de caminho, é um artefato de
      // quem mapeou. Por isso este circuito usa só a parte curva e real (19
      // pontos, 2.299m ao longo de uma margem da raia de 2.200m), como um
      // trajeto linear — não um loop completo. A outra margem não está
      // mapeada como caminho no OSM.
      {
        name: "Margem da Raia",
        distanceMeters: 2299,
        points: [
          { lat: -23.5596084, lon: -46.7135076 }, { lat: -23.5595033, lon: -46.7139477 }, { lat: -23.5587208, lon: -46.7156137 }, { lat: -23.5565218, lon: -46.7200135 },
          { lat: -23.5559642, lon: -46.7211735 }, { lat: -23.555466, lon: -46.7222099 }, { lat: -23.5554057, lon: -46.7224514 }, { lat: -23.5548844, lon: -46.7234736 },
          { lat: -23.5549333, lon: -46.7235184 }, { lat: -23.5548296, lon: -46.7237148 }, { lat: -23.5547787, lon: -46.7236901 }, { lat: -23.5540469, lon: -46.7251894 },
          { lat: -23.551717, lon: -46.7299189 }, { lat: -23.5509083, lon: -46.7315617 }, { lat: -23.5505553, lon: -46.7322787 }, { lat: -23.5504225, lon: -46.7323615 },
          { lat: -23.5502849, lon: -46.7323484 }, { lat: -23.5496158, lon: -46.7320505 }, { lat: -23.5495601, lon: -46.7319652 },
        ],
      },
    ],
  },
  {
    id: "marginal-pinheiros-bruno-covas",
    coverImage: "/lugares/marginal-pinheiros-bruno-covas.webp",
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
    circuits: [
      // Ciclovia Parque Bruno Covas: rastreado de 2 trechos reais do
      // OpenStreetMap (Overpass API), ambos tagueados "Ciclovia Parque Bruno
      // Covas" — encostam ponta a ponta sem gap. Linear (o parque é uma faixa
      // ao longo do rio, sem loop natural). 7.752m traçados contra os ~8,2km
      // da descrição.
      {
        name: "Ciclovia Parque Bruno Covas",
        distanceMeters: 7752,
        points: [
          { lat: -23.586961, lon: -46.6918923 }, { lat: -23.5871444, lon: -46.6919379 }, { lat: -23.5881208, lon: -46.6922874 }, { lat: -23.5890588, lon: -46.6925641 },
          { lat: -23.5896971, lon: -46.6928281 }, { lat: -23.5903537, lon: -46.6931119 }, { lat: -23.5915041, lon: -46.6934767 }, { lat: -23.5932041, lon: -46.6940923 },
          { lat: -23.5937035, lon: -46.694088 }, { lat: -23.5945212, lon: -46.6944064 }, { lat: -23.5945411, lon: -46.6944257 }, { lat: -23.5945564, lon: -46.6944474 },
          { lat: -23.5946088, lon: -46.694599 }, { lat: -23.5946478, lon: -46.6946671 }, { lat: -23.5954672, lon: -46.6950833 }, { lat: -23.5956332, lon: -46.6951627 },
          { lat: -23.5959204, lon: -46.6953001 }, { lat: -23.5964311, lon: -46.6955048 }, { lat: -23.5968573, lon: -46.6956788 }, { lat: -23.5972063, lon: -46.695749 },
          { lat: -23.5974865, lon: -46.6957153 }, { lat: -23.5977106, lon: -46.6956962 }, { lat: -23.5978774, lon: -46.6957391 }, { lat: -23.5980141, lon: -46.6958309 },
          { lat: -23.5981661, lon: -46.6959365 }, { lat: -23.598268, lon: -46.6959797 }, { lat: -23.5985639, lon: -46.6961027 }, { lat: -23.5987055, lon: -46.6961298 },
          { lat: -23.5988282, lon: -46.6961652 }, { lat: -23.5990899, lon: -46.6963021 }, { lat: -23.5992014, lon: -46.6963561 }, { lat: -23.599302, lon: -46.6963781 },
          { lat: -23.5994991, lon: -46.6964138 }, { lat: -23.5998712, lon: -46.6965483 }, { lat: -23.5999625, lon: -46.6965789 }, { lat: -23.6000286, lon: -46.6965935 },
          { lat: -23.600112, lon: -46.6966015 }, { lat: -23.6002605, lon: -46.6965881 }, { lat: -23.6003604, lon: -46.6965814 }, { lat: -23.600445, lon: -46.6965806 },
          { lat: -23.6005246, lon: -46.6965921 }, { lat: -23.6008995, lon: -46.6967375 }, { lat: -23.6017079, lon: -46.6970472 }, { lat: -23.6019569, lon: -46.6971801 },
          { lat: -23.6025087, lon: -46.6973321 }, { lat: -23.6026602, lon: -46.6973697 }, { lat: -23.6030476, lon: -46.6974946 }, { lat: -23.6045673, lon: -46.6980277 },
          { lat: -23.6067293, lon: -46.6987368 }, { lat: -23.6071006, lon: -46.6988662 }, { lat: -23.6087827, lon: -46.6992716 }, { lat: -23.6095173, lon: -46.6994187 },
          { lat: -23.6100514, lon: -46.6995256 }, { lat: -23.6103565, lon: -46.6995918 }, { lat: -23.6106222, lon: -46.6996434 }, { lat: -23.6106679, lon: -46.6996517 },
          { lat: -23.6108142, lon: -46.6996783 }, { lat: -23.611407, lon: -46.6998185 }, { lat: -23.6116813, lon: -46.6999914 }, { lat: -23.6120603, lon: -46.7000848 },
          { lat: -23.6123016, lon: -46.7001298 }, { lat: -23.6124333, lon: -46.7001564 }, { lat: -23.6124905, lon: -46.7001835 }, { lat: -23.6125592, lon: -46.7002171 },
          { lat: -23.6126302, lon: -46.7002395 }, { lat: -23.6132719, lon: -46.7003572 }, { lat: -23.6140656, lon: -46.7005071 }, { lat: -23.6144475, lon: -46.7005648 },
          { lat: -23.6147194, lon: -46.7005366 }, { lat: -23.6162543, lon: -46.7008906 }, { lat: -23.6165912, lon: -46.7009301 }, { lat: -23.6178282, lon: -46.7010091 },
          { lat: -23.6184252, lon: -46.701167 }, { lat: -23.6192371, lon: -46.7015089 }, { lat: -23.6194351, lon: -46.70162 }, { lat: -23.6200165, lon: -46.7019605 },
          { lat: -23.6204299, lon: -46.7021532 }, { lat: -23.6212582, lon: -46.702925 }, { lat: -23.6218268, lon: -46.703562 }, { lat: -23.6219708, lon: -46.7037437 },
          { lat: -23.6221655, lon: -46.703994 }, { lat: -23.6224098, lon: -46.7044563 }, { lat: -23.6226325, lon: -46.7049912 }, { lat: -23.6228156, lon: -46.7054734 },
          { lat: -23.6229929, lon: -46.7060833 }, { lat: -23.6237147, lon: -46.7083781 }, { lat: -23.6241054, lon: -46.7093806 }, { lat: -23.6247205, lon: -46.7105356 },
          { lat: -23.6253173, lon: -46.7113242 }, { lat: -23.6255797, lon: -46.7116709 }, { lat: -23.626665, lon: -46.7127865 }, { lat: -23.6279905, lon: -46.7140397 },
          { lat: -23.6282207, lon: -46.7142574 }, { lat: -23.6285558, lon: -46.714558 }, { lat: -23.6288082, lon: -46.7147923 }, { lat: -23.6296939, lon: -46.7155584 },
          { lat: -23.6312159, lon: -46.7169222 }, { lat: -23.6321791, lon: -46.7178126 }, { lat: -23.6326909, lon: -46.7182812 }, { lat: -23.6329244, lon: -46.7185561 },
          { lat: -23.6329467, lon: -46.7187105 }, { lat: -23.6329928, lon: -46.7187707 }, { lat: -23.6331017, lon: -46.7188666 }, { lat: -23.6333681, lon: -46.719012 },
          { lat: -23.6334641, lon: -46.7190403 }, { lat: -23.6336232, lon: -46.7192328 }, { lat: -23.6346799, lon: -46.7202173 }, { lat: -23.6370552, lon: -46.7224693 },
          { lat: -23.6390364, lon: -46.7242722 }, { lat: -23.6392931, lon: -46.7246363 }, { lat: -23.6393303, lon: -46.724687 }, { lat: -23.6394154, lon: -46.7247669 },
          { lat: -23.6398714, lon: -46.7250768 }, { lat: -23.6413784, lon: -46.7259456 }, { lat: -23.6414393, lon: -46.7260015 }, { lat: -23.6414726, lon: -46.726059 },
          { lat: -23.6415675, lon: -46.7263789 }, { lat: -23.6416303, lon: -46.7265574 }, { lat: -23.641674, lon: -46.7266251 }, { lat: -23.641744, lon: -46.726668 },
          { lat: -23.6420733, lon: -46.7268021 }, { lat: -23.6423781, lon: -46.7268772 }, { lat: -23.6431188, lon: -46.7269677 }, { lat: -23.643431, lon: -46.727013 },
          { lat: -23.64376, lon: -46.7270395 }, { lat: -23.6441826, lon: -46.727128 }, { lat: -23.6442502, lon: -46.7271267 }, { lat: -23.644292, lon: -46.7271052 },
          { lat: -23.644315, lon: -46.7270714 }, { lat: -23.6443267, lon: -46.7270128 }, { lat: -23.6443512, lon: -46.7268086 },
        ],
      },
    ],
  },
  {
    id: "parque-aclimacao",
    coverImage: "/lugares/parque-aclimacao.webp",
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
    circuits: [
      // Volta do lago: rastreado de trechos reais do OpenStreetMap (Overpass
      // API) dentro do parque — fecha a 142m de virar um loop completo (junção que o OSM não marcou como contínua; esse trecho final é uma linha reta, não uma curva chutada).
      {
        name: "Volta do lago",
        distanceMeters: 1130,
        points: [
          { lat: -23.572892, lon: -46.626781 }, { lat: -23.573031, lon: -46.626897 }, { lat: -23.573191, lon: -46.627023 }, { lat: -23.573387, lon: -46.627159 },
          { lat: -23.573634, lon: -46.627324 }, { lat: -23.573855, lon: -46.627471 }, { lat: -23.573823, lon: -46.627704 }, { lat: -23.57369, lon: -46.627938 },
          { lat: -23.573561, lon: -46.628181 }, { lat: -23.573485, lon: -46.628324 }, { lat: -23.573377, lon: -46.628524 }, { lat: -23.573153, lon: -46.628844 },
          { lat: -23.573338, lon: -46.628953 }, { lat: -23.573359, lon: -46.629149 }, { lat: -23.573383, lon: -46.629478 }, { lat: -23.573397, lon: -46.629694 },
          { lat: -23.573411, lon: -46.629887 }, { lat: -23.57344, lon: -46.630037 }, { lat: -23.573487, lon: -46.630176 }, { lat: -23.573533, lon: -46.630273 },
          { lat: -23.573581, lon: -46.630346 }, { lat: -23.573636, lon: -46.630414 }, { lat: -23.573696, lon: -46.630467 }, { lat: -23.573761, lon: -46.630505 },
          { lat: -23.573844, lon: -46.63053 }, { lat: -23.573919, lon: -46.630532 }, { lat: -23.574069, lon: -46.630529 }, { lat: -23.574154, lon: -46.630492 },
          { lat: -23.574222, lon: -46.630429 }, { lat: -23.574264, lon: -46.63035 }, { lat: -23.574557, lon: -46.629589 }, { lat: -23.574617, lon: -46.629507 },
          { lat: -23.574684, lon: -46.629452 }, { lat: -23.574776, lon: -46.629417 }, { lat: -23.574885, lon: -46.6294 }, { lat: -23.575772, lon: -46.629276 },
          { lat: -23.575864, lon: -46.62924 }, { lat: -23.575943, lon: -46.629182 }, { lat: -23.576022, lon: -46.62907 }, { lat: -23.576051, lon: -46.628941 },
          { lat: -23.576044, lon: -46.628816 }, { lat: -23.576004, lon: -46.628712 }, { lat: -23.575948, lon: -46.628619 }, { lat: -23.575869, lon: -46.628538 },
          { lat: -23.575711, lon: -46.628472 }, { lat: -23.574899, lon: -46.628194 }, { lat: -23.574787, lon: -46.628145 }, { lat: -23.574669, lon: -46.628056 },
          { lat: -23.574117, lon: -46.627642 }, { lat: -23.573938, lon: -46.627578 }, { lat: -23.573938, lon: -46.627578 },
        ],
      },
    ],
  },
  {
    id: "horto-florestal",
    coverImage: "/lugares/horto-florestal.webp",
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
    circuits: [
      // Volta do lago: rastreado de trechos reais do OpenStreetMap (Overpass
      // API) dentro do parque — fecha a 431m de virar um loop completo (junção que o OSM não marcou como contínua; esse trecho final é uma linha reta, não uma curva chutada).
      {
        name: "Volta do lago",
        distanceMeters: 2000,
        points: [
          { lat: -23.462818, lon: -46.639468 }, { lat: -23.46252, lon: -46.639544 }, { lat: -23.462158, lon: -46.639462 }, { lat: -23.461846, lon: -46.639558 },
          { lat: -23.461668, lon: -46.63956 }, { lat: -23.461536, lon: -46.639719 }, { lat: -23.461242, lon: -46.640073 }, { lat: -23.461258, lon: -46.640499 },
          { lat: -23.460995, lon: -46.640934 }, { lat: -23.461069, lon: -46.64113 }, { lat: -23.461487, lon: -46.641312 }, { lat: -23.461746, lon: -46.641617 },
          { lat: -23.461797, lon: -46.641718 }, { lat: -23.462026, lon: -46.642298 }, { lat: -23.462122, lon: -46.64273 }, { lat: -23.462011, lon: -46.642939 },
          { lat: -23.461811, lon: -46.642944 }, { lat: -23.461584, lon: -46.642789 }, { lat: -23.461457, lon: -46.642835 }, { lat: -23.461482, lon: -46.642986 },
          { lat: -23.461557, lon: -46.643162 }, { lat: -23.461855, lon: -46.64351 }, { lat: -23.462013, lon: -46.643944 }, { lat: -23.462124, lon: -46.644512 },
          { lat: -23.463187, lon: -46.6446 }, { lat: -23.463871, lon: -46.644739 }, { lat: -23.464143, lon: -46.644942 }, { lat: -23.464232, lon: -46.644792 },
          { lat: -23.464985, lon: -46.644853 }, { lat: -23.464747, lon: -46.643683 }, { lat: -23.464543, lon: -46.642947 }, { lat: -23.464517, lon: -46.642667 },
          { lat: -23.464446, lon: -46.642113 }, { lat: -23.464398, lon: -46.64166 }, { lat: -23.464559, lon: -46.641098 }, { lat: -23.464645, lon: -46.640516 },
          { lat: -23.464797, lon: -46.640183 }, { lat: -23.465195, lon: -46.639804 }, { lat: -23.465521, lon: -46.639588 }, { lat: -23.465693, lon: -46.639379 },
          { lat: -23.465233, lon: -46.638875 }, { lat: -23.46452, lon: -46.638512 }, { lat: -23.464452, lon: -46.63838 }, { lat: -23.464535, lon: -46.638198 },
          { lat: -23.464828, lon: -46.638011 }, { lat: -23.464925, lon: -46.638015 }, { lat: -23.46507, lon: -46.637875 }, { lat: -23.465308, lon: -46.638083 },
          { lat: -23.465707, lon: -46.638396 }, { lat: -23.466228, lon: -46.63868 }, { lat: -23.46637, lon: -46.639608 }, { lat: -23.466426, lon: -46.639986 },
          { lat: -23.466479, lon: -46.640178 }, { lat: -23.466562, lon: -46.640158 }, { lat: -23.466644, lon: -46.640139 },
        ],
      },
    ],
  },
  {
    id: "ceret-tatuape",
    coverImage: "/lugares/ceret-tatuape.webp",
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
    circuits: [
      // Circuito de caminhada: rastreado de trechos reais do OpenStreetMap (Overpass
      // API) dentro do parque — fecha a 113m de virar um loop completo (junção que o OSM não marcou como contínua; esse trecho final é uma linha reta, não uma curva chutada).
      {
        name: "Circuito de caminhada",
        distanceMeters: 1600,
        points: [
          { lat: -23.561151, lon: -46.555481 }, { lat: -23.561166, lon: -46.555411 }, { lat: -23.56099, lon: -46.555114 }, { lat: -23.560761, lon: -46.554722 },
          { lat: -23.560608, lon: -46.55445 }, { lat: -23.560272, lon: -46.554104 }, { lat: -23.560154, lon: -46.554201 }, { lat: -23.560019, lon: -46.554273 },
          { lat: -23.559998, lon: -46.554299 }, { lat: -23.559931, lon: -46.554244 }, { lat: -23.559838, lon: -46.55423 }, { lat: -23.559735, lon: -46.554249 },
          { lat: -23.559025, lon: -46.554506 }, { lat: -23.558712, lon: -46.554619 }, { lat: -23.558397, lon: -46.554733 }, { lat: -23.558101, lon: -46.55484 },
          { lat: -23.557716, lon: -46.554979 }, { lat: -23.55768, lon: -46.555029 }, { lat: -23.557652, lon: -46.555069 }, { lat: -23.557622, lon: -46.555198 },
          { lat: -23.557598, lon: -46.555402 }, { lat: -23.557606, lon: -46.555558 }, { lat: -23.557613, lon: -46.555717 }, { lat: -23.557638, lon: -46.555852 },
          { lat: -23.557673, lon: -46.55599 }, { lat: -23.557712, lon: -46.5561 }, { lat: -23.557777, lon: -46.556262 }, { lat: -23.557841, lon: -46.55638 },
          { lat: -23.557941, lon: -46.556506 }, { lat: -23.558083, lon: -46.556662 }, { lat: -23.558221, lon: -46.556773 }, { lat: -23.558349, lon: -46.556863 },
          { lat: -23.55845, lon: -46.556926 }, { lat: -23.558589, lon: -46.556966 }, { lat: -23.558744, lon: -46.557004 }, { lat: -23.558827, lon: -46.55702 },
          { lat: -23.55892, lon: -46.557038 }, { lat: -23.559005, lon: -46.557051 }, { lat: -23.55905, lon: -46.55708 }, { lat: -23.559058, lon: -46.557085 },
          { lat: -23.559342, lon: -46.556998 }, { lat: -23.559387, lon: -46.556982 }, { lat: -23.559936, lon: -46.556789 }, { lat: -23.560226, lon: -46.556686 },
          { lat: -23.560759, lon: -46.556498 },
        ],
      },
    ],
  },
  {
    id: "parque-do-carmo",
    name: "Parque do Carmo – Olavo Egydio Setúbal",
    city: "São Paulo",
    neighborhood: "Itaquera · Zona Leste",
    description:
      "O maior parque da Zona Leste, com lago, planetário, museu ambiental e uma pista que contorna praticamente toda a extensão do lugar — terra batida em parte, asfalto em outra. Aberto das 5h30 às 20h. Passa por reforma de R$83 milhões iniciada em 2025, com monitoramento Smart Sampa.",
    criteria: {
      seguranca: {
        score: 2,
        note: "Avaliações de visitantes descrevem o parque como bonito mas com relatos de assalto e pouca segurança nos trechos mais afastados. A reforma em curso desde 2025 inclui GCM em pontos estratégicos e câmeras do programa Smart Sampa, mas o efeito real ainda não está consolidado — nota reflete o histórico documentado, não a promessa da reforma.",
      },
      percurso: {
        score: 4,
        note: "Pista que circunda quase toda a extensão do parque, ~4km, alternando terra batida e asfalto — um dos poucos trajetos longos da Zona Leste. A volta menor em torno do lago (a que este arquivo consegue rastrear com precisão) é mais curta, ~1,5km.",
      },
      estrutura: {
        score: 3,
        note: "Estacionamento gratuito, planetário, museu ambiental, quiosques, playgrounds. Reforma em andamento (iniciada em 2025) inclui melhorias de estrutura — parte do parque pode estar em obras.",
      },
      iluminacao: {
        score: 2,
        note: "Fecha às 20h — sem corrida noturna de verdade. A reforma em curso promete melhorias de iluminação, ainda não confirmadas concluídas.",
      },
      fluxo: {
        score: 4,
        note: "Parque muito grande para a Zona Leste — mesmo em fins de semana de movimento, o espaço amplo evita a sensação de aglomeração dos parques menores.",
      },
    },
    bestTime: "Manhã de dia útil, logo após a abertura às 5h30 — evite trechos isolados e o fim de tarde",
    loopDistanceMeters: 4000,
    safetyFlag:
      "Relatos de assalto em avaliações de visitantes, sobretudo em trechos afastados do miolo do parque. Prefira ir em grupo e evitar áreas isoladas.",
    sources: [
      "https://prefeitura.sp.gov.br/web/meio_ambiente/w/parques/regiao_leste/5734",
      "https://desenvolveitaquera.com.br/2025/06/20/reforma-do-parque-do-carmo/",
      "https://cidadedesaopaulo.com/lugares-para-treinar-corrida-em-sao-paulo-prepare-se-para-as-maratonas/",
    ],
    circuits: [
      // Volta do Lago: rastreado de um único trecho real do OpenStreetMap
      // (Overpass API) — já vem como way fechada no próprio OSM (primeiro nó
      // = último nó), sem precisar de stitching nem linha de fechamento.
      // 1.545m — é a volta menor em torno do lago, não o perímetro completo
      // de ~4km citado na descrição (esse perímetro maior não está mapeado
      // como um caminho contínuo único no OSM).
      {
        name: "Volta do Lago",
        distanceMeters: 1545,
        points: [
          { lat: -23.5738169, lon: -46.4680987 }, { lat: -23.5719682, lon: -46.4684493 }, { lat: -23.5714685, lon: -46.4680663 }, { lat: -23.5712687, lon: -46.4678852 },
          { lat: -23.5711145, lon: -46.4675663 }, { lat: -23.5710634, lon: -46.4670936 }, { lat: -23.571073, lon: -46.4669563 }, { lat: -23.5711085, lon: -46.466863 },
          { lat: -23.5711877, lon: -46.4667361 }, { lat: -23.57125, lon: -46.466672 }, { lat: -23.5714278, lon: -46.4665293 }, { lat: -23.571531, lon: -46.4664897 },
          { lat: -23.5716785, lon: -46.4664441 }, { lat: -23.5719612, lon: -46.4664012 }, { lat: -23.5722758, lon: -46.4663685 }, { lat: -23.5725104, lon: -46.4663211 },
          { lat: -23.5728014, lon: -46.4661804 }, { lat: -23.5729757, lon: -46.466035 }, { lat: -23.5731859, lon: -46.4658225 }, { lat: -23.5733858, lon: -46.4654869 },
          { lat: -23.573555, lon: -46.4651346 }, { lat: -23.5736114, lon: -46.4646536 }, { lat: -23.5736831, lon: -46.4641502 }, { lat: -23.5737241, lon: -46.4637364 },
          { lat: -23.5738728, lon: -46.4636469 }, { lat: -23.5740471, lon: -46.463714 }, { lat: -23.5741613, lon: -46.4637626 }, { lat: -23.5741617, lon: -46.4639604 },
          { lat: -23.5741547, lon: -46.4641558 }, { lat: -23.5741752, lon: -46.4646871 }, { lat: -23.5742111, lon: -46.4650115 }, { lat: -23.5743444, lon: -46.4654366 },
          { lat: -23.5746009, lon: -46.4658703 }, { lat: -23.5751978, lon: -46.4661079 }, { lat: -23.5753586, lon: -46.4664075 }, { lat: -23.5753892, lon: -46.4664963 },
          { lat: -23.5753812, lon: -46.4665852 }, { lat: -23.5751851, lon: -46.4667174 }, { lat: -23.5750262, lon: -46.4668516 }, { lat: -23.5748519, lon: -46.4670026 },
          { lat: -23.5746315, lon: -46.4671368 }, { lat: -23.5743752, lon: -46.4673102 }, { lat: -23.5741957, lon: -46.4675619 }, { lat: -23.5740061, lon: -46.46778 },
          { lat: -23.5739343, lon: -46.4678695 }, { lat: -23.5738439, lon: -46.4679948 }, { lat: -23.5738169, lon: -46.4680987 },
        ],
      },
    ],
  },
  {
    id: "parque-trianon",
    name: "Parque Trianon (Tenente Siqueira Campos)",
    city: "São Paulo",
    neighborhood: "Cerqueira César · Centro-Oeste, dentro da própria Avenida Paulista",
    description:
      "Fragmento de Mata Atlântica centenária no meio da Avenida Paulista, projetado por Burle Marx. Pequeno (36.614 m²) e sem pista oficial marcada, mas guias locais descrevem uma volta de cooper de cerca de 1,5km pelos caminhos internos — ideal para uma pausa rápida no meio de um treino na Paulista. Fecha às 18h, sem corrida noturna.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Posto da Polícia Militar na entrada pela Avenida Paulista, além de guarda-parques — mas a região do entorno (proximidades do MASP) concentra 42,3% dos roubos e furtos registrados na Paulista em raio de até 350m, segundo levantamento de 2022.",
      },
      percurso: {
        score: 2,
        note: "Sem pista oficial marcada — os caminhos internos são estreitos e sinuosos, típicos de um bosque, não de um circuito desenhado para corrida. Guias locais estimam cerca de 1,5km de caminhos somados, mas essa é uma estimativa informal, não uma medição oficial.",
      },
      estrutura: {
        score: 2,
        note: "Aparelhos de ginástica, sanitários, rampa de acesso. Sem bebedouro nem chuveiro confirmados.",
      },
      iluminacao: {
        score: 1,
        note: "Fecha às 18h — sem corrida noturna, ponto final.",
      },
      fluxo: {
        score: 3,
        note: "Parque pequeno, então mesmo um movimento moderado pode parecer cheio nos caminhos mais estreitos. Aos domingos, o entorno na Paulista fica tomado pelo Ruas Abertas.",
      },
    },
    bestTime: "Dia de semana, logo na abertura às 6h — antes do calor e do movimento da Paulista",
    loopDistanceMeters: 1500,
    sources: [
      "https://prefeitura.sp.gov.br/web/meio_ambiente/w/parques/regiao_centrooeste/5773",
      "https://viajarcorrendo.com.br/2025/04/parques-da-avenida-paulista.html",
      "https://www.terra.com.br/noticias/brasil/cidades/roubos-e-furtos-na-avenida-paulista-qual-e-o-ponto-mais-perigoso,f9f8a51a12e5ca9d92f86be012955a37mytn8a7r.html",
    ],
  },
  {
    id: "parque-burle-marx",
    name: "Parque Burle Marx",
    city: "São Paulo",
    neighborhood: "Vila Andrade / Morumbi · Zona Sul",
    description:
      "Antiga Chácara Tangará, quase virou complexo comercial antes de virar parque ecológico em 1995. Tem pista de cooper e caminhada além de trilhas de mata — mas fontes divergem sobre a distância exata (de 750m a um conjunto de trilhas de 350m/850m/1.050m, dependendo da fonte). Fica a poucos metros de Paraisópolis, e a região registrou um tiroteio em jan/2025.",
    criteria: {
      seguranca: {
        score: 2,
        note: "Tiroteio registrado em jan/2025 na Av. Dona Helena Pereira de Moraes, ao lado do parque, entre um adolescente armado e um policial penal à paisana. Moradores da Vila Andrade relatam aumento de roubos, com dado da SSP de +30% de criminalidade no 89º DP (Portal do Morumbi).",
      },
      percurso: {
        score: 3,
        note: "Pista de cooper e caminhada confirmada oficialmente, mais trilha de mata — mas a extensão exata diverge entre fontes (750m segundo alguns guias, ou um conjunto de 3 trilhas de 350/850/1.050m segundo a Wikipédia). Por isso a distância deste lugar fica como não confirmada.",
      },
      estrutura: {
        score: 4,
        note: "Aparelhos de ginástica, playground, lanchonete, pergolados, sanitários acessíveis, estacionamento, orquidário e nascentes — um dos parques mais completos desta lista fora dos grandes clássicos.",
      },
      iluminacao: {
        score: 2,
        note: "Funciona das 7h às 19h — sem corrida noturna, mas o horário diurno é mais generoso que muitos parques menores.",
      },
      fluxo: {
        score: 3,
        note: "Uso majoritariamente contemplativo — bicicleta, skate e jogos de bola são proibidos dentro do parque, o que mantém o fluxo mais previsível que em parques voltados a esporte.",
      },
    },
    bestTime: "Manhã, logo após a abertura às 7h — evite o fim de tarde/noite dado o histórico de ocorrências no entorno",
    loopDistanceMeters: null,
    safetyFlag:
      "Tiroteio registrado em jan/2025 na avenida de acesso ao parque; moradores da Vila Andrade relatam aumento de roubos na região. Evite horários de menor movimento.",
    sources: [
      "https://prefeitura.sp.gov.br/web/meio_ambiente/w/parques/regiao_sul/5733",
      "https://pt.wikipedia.org/wiki/Parque_Burle_Marx",
      "https://www.terra.com.br/noticias/brasil/cidades/troca-de-tiros-assusta-moradores-perto-do-parque-burle-marx,5e5a019f8f4e1296c57fc3f43c64670ahlxow0rd.html",
      "https://www.gazetasp.com.br/cotidiano/moradores-da-vila-andrade-relatam-aumento-de-crimes-e-baixo-policiamen/1088909/",
    ],
    circuits: [
      // Pista de cooper (trecho rastreado): 2 trechos reais do OpenStreetMap
      // (Overpass API, ambos surface=ground/trilha de terra) encostados ponta
      // a ponta sem gap, formando um quase-loop que fecha a 81m de distância
      // entre a última e a primeira coordenada — essa junção final é uma
      // linha reta documentada aqui, não uma curva chutada. 1.265m no total.
      // Não dá pra confirmar se esse é exatamente o trecho de 750m ou uma das
      // trilhas de 350/850/1.050m citadas por fontes diferentes — é real e
      // rastreado, mas o nome oficial do trecho é incerto.
      {
        name: "Pista de cooper (trecho rastreado)",
        distanceMeters: 1265,
        points: [
          { lat: -23.6314239, lon: -46.7209169 }, { lat: -23.6313634, lon: -46.7208689 }, { lat: -23.6313436, lon: -46.7207641 }, { lat: -23.631337, lon: -46.7206521 },
          { lat: -23.6313039, lon: -46.72054 }, { lat: -23.631231, lon: -46.7204714 }, { lat: -23.6311549, lon: -46.7205003 }, { lat: -23.6310787, lon: -46.7206159 },
          { lat: -23.6310556, lon: -46.7208508 }, { lat: -23.6310423, lon: -46.7209737 }, { lat: -23.6310251, lon: -46.7210773 }, { lat: -23.6309761, lon: -46.7211182 },
          { lat: -23.6309496, lon: -46.7210965 }, { lat: -23.6309364, lon: -46.720999 }, { lat: -23.6309364, lon: -46.7208147 }, { lat: -23.6309596, lon: -46.7204605 },
          { lat: -23.6309728, lon: -46.7203124 }, { lat: -23.6309662, lon: -46.7202257 }, { lat: -23.6309, lon: -46.7201751 }, { lat: -23.6307576, lon: -46.7202762 },
          { lat: -23.6306748, lon: -46.7204605 }, { lat: -23.630655, lon: -46.720681 }, { lat: -23.6306815, lon: -46.7210062 }, { lat: -23.6307179, lon: -46.7211507 },
          { lat: -23.6307278, lon: -46.7213675 }, { lat: -23.6307311, lon: -46.7216205 }, { lat: -23.6306351, lon: -46.7219457 }, { lat: -23.6304861, lon: -46.7222203 },
          { lat: -23.6302643, lon: -46.7226034 }, { lat: -23.6301942, lon: -46.7228 }, { lat: -23.6301618, lon: -46.7227751 }, { lat: -23.6301238, lon: -46.7227688 },
          { lat: -23.6300756, lon: -46.722831 }, { lat: -23.6300789, lon: -46.7229611 }, { lat: -23.630165, lon: -46.7231852 }, { lat: -23.6302511, lon: -46.7233514 },
          { lat: -23.6303637, lon: -46.7233803 }, { lat: -23.6305516, lon: -46.7233832 }, { lat: -23.6308602, lon: -46.7233695 }, { lat: -23.6310622, lon: -46.723355 },
          { lat: -23.6312012, lon: -46.7233152 }, { lat: -23.6313568, lon: -46.72329 }, { lat: -23.6315422, lon: -46.7233116 }, { lat: -23.6316813, lon: -46.7234128 },
          { lat: -23.6318037, lon: -46.7235863 }, { lat: -23.6318389, lon: -46.7236073 }, { lat: -23.6318799, lon: -46.7236079 }, { lat: -23.6318951, lon: -46.7235723 },
          { lat: -23.6318964, lon: -46.723514 }, { lat: -23.6318799, lon: -46.7233984 }, { lat: -23.631774, lon: -46.7232141 }, { lat: -23.6316515, lon: -46.7230515 },
          { lat: -23.6315058, lon: -46.7229864 }, { lat: -23.6313521, lon: -46.7228954 }, { lat: -23.6312894, lon: -46.7228249 }, { lat: -23.6311979, lon: -46.7227949 },
          { lat: -23.6310992, lon: -46.7227626 }, { lat: -23.6310479, lon: -46.722692 }, { lat: -23.6310721, lon: -46.7226359 }, { lat: -23.6311278, lon: -46.7225903 },
          { lat: -23.6311658, lon: -46.7225509 }, { lat: -23.6311449, lon: -46.7225198 }, { lat: -23.6310897, lon: -46.7225094 }, { lat: -23.631065, lon: -46.7224907 },
          { lat: -23.631084, lon: -46.7224534 }, { lat: -23.6311185, lon: -46.7224119 }, { lat: -23.6312012, lon: -46.7222998 }, { lat: -23.6312509, lon: -46.7221481 },
          { lat: -23.6312972, lon: -46.7220216 }, { lat: -23.6313634, lon: -46.7219276 }, { lat: -23.6314462, lon: -46.7219096 }, { lat: -23.6315753, lon: -46.7218662 },
          { lat: -23.6316779, lon: -46.7218481 }, { lat: -23.6318313, lon: -46.7217804 }, { lat: -23.6318216, lon: -46.7215492 }, { lat: -23.6318735, lon: -46.7213699 },
          { lat: -23.6319974, lon: -46.7211654 }, { lat: -23.6321444, lon: -46.7210238 }, { lat: -23.6314239, lon: -46.7209169 },
        ],
      },
    ],
  },
  {
    id: "parque-da-juventude",
    name: "Parque da Juventude Dom Paulo Evaristo Arns",
    city: "São Paulo",
    neighborhood: "Santana · Zona Norte, no antigo terreno do Complexo Penitenciário do Carandiru",
    description:
      "Construído no lugar do extinto Carandiru, com 240 mil m² divididos em área verde, área central e área esportiva. A área esportiva tem pista de corrida de terra batida e funciona até mais tarde que a maioria dos parques da lista — uma das poucas opções de corrida noturna em dia útil na Zona Norte.",
    criteria: {
      seguranca: {
        score: 3,
        note: "Guardas espalhados pelo parque, boa impressão geral de segurança segundo relatos de visitantes — mas há relato pontual de arrombamento de carro no estacionamento. Sem dado sistemático de ocorrências contra pedestres/corredores.",
      },
      percurso: {
        score: 3,
        note: "Pista de terra batida dedicada à corrida na área esportiva, mais ciclofaixa — mas não encontrei a quilometragem oficial da pista em nenhuma fonte confiável.",
      },
      estrutura: {
        score: 4,
        note: "Aparelhos de ginástica, playground, bicicletário, quadras, lanchonetes, bebedouros, sanitários, ambulatório e estacionamento — um dos parques mais completos da Zona Norte.",
      },
      iluminacao: {
        score: 4,
        note: "Área esportiva funciona até 22h em dias úteis e sábado (até 20h/22h aos domingos, conforme a fonte) — janela noturna real, incomum nesta lista fora do Ibirapuera e do CERET.",
      },
      fluxo: {
        score: 3,
        note: "Parque grande e dividido em áreas distintas, o que ajuda a distribuir o movimento — mas a área esportiva concentra quem treina, podendo ficar cheia no fim de tarde.",
      },
    },
    bestTime: "Fim de tarde/início de noite em dia útil, quando a área esportiva ainda está aberta e o calor já passou",
    loopDistanceMeters: null,
    sources: [
      "https://www.saopaulo.sp.gov.br/conhecasp/parques-e-reservas-naturais/parque-da-juventude/",
      "https://www.areasverdesdascidades.com.br/2016/04/parque-da-juventude-em-sao-paulo.html",
      "https://guiadeareasprotegidas.sp.gov.br/ap/parque-da-juventude-dom-paulo-evaristo-arns-pjuv/",
    ],
  },
];

export function getPlace(id: string): RunningPlace | undefined {
  return RUNNING_PLACES.find((place) => place.id === id);
}

export function getPlacesByCity(city: string): RunningPlace[] {
  return RUNNING_PLACES.filter((place) => place.city === city);
}
