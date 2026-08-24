# Contexto de conteúdo/marca do Xanthus

> **Por que este arquivo existe:** o `PROJECT-CONTEXT.md` guarda o estado do
> *produto*; este guarda o estado da *voz* do produto. Sem isso, cada
> roteiro/legenda/post pedido numa sessão nova reinventa tom, referências e
> regras do zero — o mesmo problema de memória que motivou o
> `PROJECT-CONTEXT.md`, só que pra branding em vez de infra. Leia isto antes
> de escrever qualquer roteiro, gancho, legenda ou copy de post. Peça pro
> Claude atualizar este arquivo sempre que uma decisão nova de tom/formato/
> direção de arte for tomada — não deixe só na conversa.
>
> Pesquisa de base: artifact "Fábrica de Conteúdo" (2026-08-23, agente
> autônomo Opus 5) e pesquisa de repositórios GitHub (2026-08-24) — ambos
> citados abaixo onde relevante. Decisões de produto/posicionamento
> (não de conteúdo) continuam só no `PROJECT-CONTEXT.md`.

## Direção de arte (não-negociável)

Ilustração **desenhada à mão, com contorno definido, estilo animado/
cel-shaded** — nunca fotorrealista, nunca avatar sintético/humano gerado
por IA. Decidido em 2026-08-17, vale pra qualquer imagem/vídeo/prompt
novo. Motivo técnico, não só estético: biomecânica de corrida em movimento
rápido é o ponto mais frágil de todo modelo de vídeo por IA hoje (pernas/
pés distorcem) — ilustração cel-shaded é julgada contra uma convenção de
desenho, não contra física, então absorve esse artefato em vez de expor.

Regra de produção que decorre disso: **nunca texto-pra-vídeo com
personagem, sempre imagem-pra-vídeo**. Toda animação parte de uma imagem
estática do Recraft (ou do brand mark já existente); o modelo de vídeo só
move o que já foi desenhado, nunca inventa o quadro. Ver `PROJECT-CONTEXT.md`
→ "Ferramentas externas" pra detalhe da conta/API do Recraft.

## Persona: quem é o Xanthus quando fala

Esboço completo em `PROJECT-CONTEXT.md` → "Persona da mascote" (ainda não
fechado em definitivo — checar lá se evoluiu). Resumo pra uso direto em
roteiro:

- **Fala verdade mesmo quando dói** — feedback real sobre pace/treino, não
  hype vazio de "você é incrível" toda hora. Nunca positividade forçada.
- **Corre do lado, nunca de cima pra baixo** — não é um "coach" dando
  ordem, é o parceiro de treino sofrendo a ladeira junto.
- **Bom humor autodepreciativo**, não mascote sempre-animado-demais —
  "eu já corri isso mil vezes e ainda dói" é mais Xanthus que "vamos lá,
  você consegue!!".
- **Apego vem de confiabilidade/recorrência, não de ser fofo** — mesmo
  raciocínio de produto do app (GPS confiável > GPS bonito) aplicado a
  conteúdo (aparecer toda semana > uma peça viral isolada).
- Gancho de origem (usar com moderação, não em todo post): na mitologia
  grega, Xanthus é o cavalo imortal de Aquiles a quem Hera deu a fala — no
  momento mais duro da Ilíada é ele quem avisa Aquiles, chorando, que ele
  vai morrer, e corre ao lado dele até o fim mesmo assim. Um cavalo que
  fala verdade difícil e não abandona.

## Os diferenciais reais (nunca escrever copy genérica por cima disso)

Todo gancho/copy deve apontar pra uma dor específica e verificável, não
"o melhor app de corrida do Brasil". O que é real e comprovável hoje:

- **GPS não trava quando a tela bloqueia** — nativo (Android/iOS via
  Capacitor), não PWA; motivo direto da migração pra nativo.
- **Sem paywall, nunca** — o Xanthus nasceu da dor de preço que muda depois
  que você já confiou (Strava). Não é "grátis por enquanto", é a proposta.
- **Não exige login pra gravar corrida** — histórico, conquistas e tudo do
  tracking em si funcionam sem conta; login só entra pra amigos/treinador/
  longão, e mesmo assim a pessoa escolhe corrida por corrida o que
  compartilhar.
- **Plano de treino de verdade** — motor determinístico com progressão de
  volume segura (`src/lib/plan/`), não um contador de km. Runna (o
  concorrente citado como referência de ambição) tem IA aqui; o Xanthus
  não tem IA no motor principal, mas tem regra real com teto de segurança
  — não fingir que é IA quando não é.
- **Dado não fica preso** — export/exclusão de conta de verdade
  implementados, não só prometidos.
- **Em português, sem precisar adivinhar unidade/termo gringo.**

Não usar em copy: números inventados, "o melhor GPS do mercado" sem prova,
comparação direta com concorrente por marca (a não ser em tom de resenha/
review honesta, nunca ataque vazio).

## Os 5 arquétipos de gancho, já aplicados ao Xanthus

Framework validado na pesquisa (retenção "assistiu vs. passou reto" cai
pra baixo de 60% sem gancho nos primeiros 2s). Exemplos abaixo são ponto
de partida, não texto final — sempre customizar pro clipe real:

1. **Afirmação ousada** — "A maioria dos apps de corrida trava o GPS
   assim que a tela bloqueia. O seu não devia fazer isso."
2. **Gap de curiosidade** — "Tem uma coisa que nenhum app de corrida te
   conta sobre por que seu pace parece errado no meio do treino."
3. **Abertura de micro-história** — "Passei 8 builds seguidos com o
   celular plugado num Mac só pra achar um bug que fazia minha tela de
   corrida reiniciar sozinha." (história real, ver `PROJECT-CONTEXT.md` →
   "Bug crítico resolvido" — usar histórias reais do dev-log como esta em
   vez de inventar drama).
4. **Choque visual** — a rota GPS desenhando ao vivo no mapa, ou o
   unboxing de emblema — interrupção de padrão via algo que o app já faz
   de verdade, não um efeito de edição.
5. **Pergunta direta** — "Você sabe por que seu GPS trava com a tela
   bloqueada? A resposta é meio embaraçosa pros apps que fazem isso."

## Regra de timing (toda peça de vídeo nasce dentro disso)

- **0–0,5s**: a primeira palavra falada já aconteceu. Sem intro, sem logo.
- **0–3s**: janela que decide se o algoritmo distribui o vídeo.
- **3–6s**: espectador precisa entender a promessa/payoff.
- Gancho funciona em três camadas ao mesmo tempo: interrupção visual +
  texto na tela (4–7 palavras, alto contraste, legível sem áudio) +
  abertura falada — **tem que funcionar sem som**, mesmo em plataforma
  mais assistida com áudio ligado.
- Uma ideia por vídeo. Gerar 10 variações de gancho por tema e escolher,
  não aceitar a primeira.

## Formatos, ranqueados por retorno esperado (da pesquisa "Fábrica de Conteúdo")

1. **Gravação de tela real do app** (rota ao vivo no mapa, unboxing de
   emblema, chip "Treino de hoje") + narração ElevenLabs pt-BR. Maior
   retorno, menor custo — mal conta como "conteúdo de IA".
2. **Corrida real sua, filmagem real, sua voz.** Menor penalidade de
   confiança sob o regime de autenticidade de 2026; resolve de graça o
   problema de biomecânica.
3. **Animação de marca ilustrada** — imagem do Recraft → Wan 2.7/Vidu Q3
   → clipe de 3–8s. Pra introduções, transições, o Xanthus mascote.
4. **Transferência de movimento** (Wan-Animate/Kling Motion Control) —
   sua filmagem real de corrida aplicada no personagem ilustrado. Teto de
   qualidade mais alto, mas setup mais caro/complexo — deixar pra depois
   dos formatos 1–2 estarem rodando.
5. **Nunca**: humano fotorrealista gerado por IA correndo. Errado pra
   marca, errado pra capacidade atual dos modelos, mais penalizado nas
   plataformas.

## O que nunca fazer

- Avatar sintético/fotorreal (HeyGen e similares) — contradiz a direção
  de arte e carrega penalidade de confiança real (engajamento cai 52%
  quando o público desconfia que é IA gerada).
- Gerar por IA a forma de exercício/técnica de corrida — sempre filmagem
  real; é onde o artefato de biomecânica mais aparece.
- CTA de download dentro de conteúdo de **audiência** (ex: o carrossel de
  onboarding) — peça de audiência precisa ser reconhecível/compartilhável,
  não converter sozinha. CTA duro é pra peça de **conversão** (landing,
  botão de download), nunca misturar os dois estágios.
- Automatizar publicação em alto volume via API — a Meta penaliza
  publicação templatizada/alto-volume, e isso vaza pros posts orgânicos
  também. Automatizar produção, manter publicação manual/semi-manual
  (2-3 Reels bem publicados por semana > 15 automáticos).
- Prometer algo que o produto não faz de verdade (ver achado da auditoria
  competitiva: "plano de treino por IA" seria mentira hoje — é motor
  determinístico, não IA; dizer isso é quebrar a própria ideia-guia de
  "não trair depois que confiou").

## Tom de voz e linguagem

- Trata o corredor como alguém que já foi mal tratado por outros apps
  (grátis-que-vira-pago, GPS que trava, dados que somem) — reconhecer essa
  dor com especificidade real, nunca com "o melhor app do Brasil"
  genérico.
- **"Ser mais interessante do que interesseiro"** — conteúdo que só pede
  pra baixar o app, sem entregar nada por si só, é o oposto do que
  constrói marca.
- Rejeitar copy vaga ou grandiosa sem prova concreta atrás. Precedente já
  corrigido nesta sessão: "prints reais do app" em vez de ilustração
  genérica, "traçado real gravado" em vez de "o melhor GPS do mercado".
- Pra decisão de posicionamento/ideia-guia (não só uma peça pontual),
  chamar o agente `branding-alfredo` — ele testa se uma ideia-guia
  proposta também descreveria o Strava (sinal de que não é ideia-guia de
  verdade) e se a peça é avaliada pelo critério certo do estágio de funil
  (audiência/demanda/conversão/retenção).

## Stack de produção (detalhe completo no artifact "Fábrica de Conteúdo")

Recraft (imagem-chave) → Wan 2.7 ou Vidu Q3 via fal.ai (animação,
image-to-video sempre) → ElevenLabs (voz, já em uso no app) → CapCut/
Submagic (legenda) → revisão humana → publicação manual. ~US$115-165/mês
no tier recomendado. Alternativa open-source pra animação, sem depender
de API paga por segundo: `Wan-Video/Wan2.2` + `Wan-Video/Wan-Animate-2`
rodando local/GPU alugada via ComfyUI (achado da pesquisa de GitHub,
2026-08-24) — mesma técnica, sem custo por chamada.

## Como manter isso vivo

Sempre que uma decisão nova de tom, formato, gancho que funcionou/não
funcionou, ou direção de arte for tomada, atualize este arquivo na hora —
mesma regra do `PROJECT-CONTEXT.md`. Métricas reais de uma peça publicada
(engajamento, retenção) valem mais que qualquer suposição deste arquivo;
quando divergirem, registrar o que aconteceu de verdade e ajustar.
