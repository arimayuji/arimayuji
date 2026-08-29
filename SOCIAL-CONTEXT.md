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

## Pilares de conteúdo (evita ficar perdido em storytelling/formato)

Preocupação real levantada em 2026-08-24: nem toda ideia precisa virar
vídeo/gravação de tela — isso é lento e trava o ritmo. Toda ideia nova
passa primeiro por essa categorização; se não encaixa em nenhum pilar,
não é conteúdo do Xanthus ainda. Formato de cada pilar é o mais leve que
resolve, não o mais impressionante.

1. **Produto** — feature real do app. Formato: gravação de tela + narração
   (ver "Formatos" abaixo).
2. **Autêntico** — você correndo, sua voz, sua história real (ex.: o bug
   caçado com `adb logcat`). Formato: vídeo real, sem geração de IA.
3. **Autoridade/ciência** — reagir a notícia real do nicho (recorde
   quebrado, estudo novo) cruzando com o que o Xanthus já sabe de
   verdade (`src/lib/evidence/facts.ts`, a mesma base citada em `/plano`
   e `/estudos`). Formato: **slide/carrossel estático**, não precisa de
   vídeo — é o pilar mais rápido de produzir e o que dá autoridade sem
   inventar conhecimento novo. Exemplo real usado como teste: Yomif
   Kejelcha quebrou o recorde mundial da meia maratona em 23/08/2026
   (Buenos Aires, 56:51) — ver rascunho de slide feito nesta sessão.
   **Descoberta de pauta**: World Athletics tem RSS oficial de notícias
   (`worldathletics.org/news`) — verificado. LetsRun.com **não** tem RSS
   oficial (confirmado por busca) — pra ele, usar um gerador de terceiros
   (ex. rss.app) ou só visitar manualmente. `feedspot.com` mantém um
   diretório curado de RSS de corrida/atletismo como ponto de partida pra
   achar mais fontes — nenhuma URL de feed específica de lá foi
   verificada ainda, checar antes de configurar automação em cima disso.
4. **Marca/mascote** — animação ilustrada da persona (ver seção acima).
   Formato: imagem Recraft → Vidu Q3. Único pilar que depende do
   pipeline de IA-vídeo mais caro/lento — não é o pilar de estreia.
5. **Comunidade/humor** — meme sobre dor real de corredor, repost de
   conquista de usuário (com permissão). Formato: slide/imagem, rápido,
   mantém a conta viva entre os pilares mais pesados.

## Onde produzir cada peça (decisão de fluxo, 2026-08-24)

Conteúdo estático (slide, carrossel, meme — pilares 3 e 5 acima) nasce
como um **artifact visual** (canvas de design), não como texto descrito
no chat — dá pra ver o resultado de verdade e ajustar direto ali em vez
de rodadas de ida-e-volta em texto. Roteiro/copy de vídeo continua sendo
escrito aqui (é texto mesmo, vira input pras ferramentas externas de
vídeo). Geração de vídeo em si sempre nas ferramentas externas do stack
abaixo, nunca dentro do chat.

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
3. **Animação de marca ilustrada** — imagem do Recraft → Vidu Q3
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

Recraft (imagem-chave) → **Vidu Q3** via fal.ai (animação, image-to-video
sempre) → ElevenLabs (voz, já em uso no app) → CapCut/Submagic (legenda)
→ revisão humana → publicação manual. Alternativa open-source pra
animação, sem depender de API paga por segundo: `Wan-Video/Wan2.2` +
`Wan-Video/Wan-Animate-2` rodando local/GPU alugada via ComfyUI (achado
da pesquisa de GitHub, 2026-08-24) — mesma técnica, sem custo por
chamada, ainda não testada.

**Vidu Q3 escolhido em 2026-08-27, por teste comparativo real** — não
por suposição. Pegamos o contorno real da marca (`horse-mark.tsx`,
preenchido em azul primário `#2f6fed`, sem nenhum outro elemento) e
geramos o mesmo clipe de 4s nos três candidatos via fal.ai: **Wan 2.7**
(`fal-ai/wan/v2.7/image-to-video`), **Vidu Q3**
(`fal-ai/vidu/q3/image-to-video`) e **Seedance 2.0 Fast**
(`bytedance/seedance-2.0/fast/image-to-video`). O dono do projeto
assistiu aos três lado a lado e escolheu o Vidu Q3 — manteve o contorno
plano e a cor sob movimento melhor que os outros dois. Seedance fica
descartado como pilar de animação de marca (confirma a suspeita
original: viés de puxar pro realista/suavizar o traço, documentada antes
do teste); Wan 2.7 continua como alternativa de reserva, não como
primeira escolha.

**Lição do processo de geração da imagem-chave** (vale registrar pra não
repetir o mesmo ciclo de tentativa e erro): pedir "cel-shaded" num prompt
de texto solto pro Recraft não é suficiente — ele já inventou cor
errada (amarelo/laranja/vermelho) e elementos extras (uma chama no
canto) mais de uma vez, mesmo com a instrução explícita "no orange, no
red" no prompt. O que funcionou de verdade: (1) partir sempre do
contorno real (`horse-mark.tsx`, nunca uma descrição de cavalo genérica)
rasterizado como referência de `imageToImage`, não um prompt de texto
puro; (2) quando uma variação gerada tinha um problema pontual e
isolado (cor errada numa borda, fundo errado), corrigir com edição de
pixel determinística (script Node + `sharp`, detectando a cor
específica por distância RGB e substituindo) em vez de gerar de novo —
mais rápido, garantido, sem risco de reintroduzir outro artefato
aleatório. Sombra de músculo anatômica (pedida e tentada nesta sessão)
**não** funcionou nem por prompt nem por blob de pixel genérico — exige
uma forma desenhada à mão seguindo o contorno real, ficou de fora da v1.

## Formato "brincadeira de palavras" (reels de texto, primeiro post real)

Pra um primeiro vídeo de Instagram/TikTok, o dono do projeto rejeitou tanto
gravação de tela (achou "tosco", exigiria edição pesada com voz de fundo)
quanto o pitch falado direto pra câmera — decidiu por um formato de **texto
que constrói uma frase e vira a mesa**, sem narração nem trilha, cards de
texto com timing (nativo no editor do Instagram/CapCut). Dois trocadilhos
em português já roteirizados, ambos batendo direto num diferencial real do
produto (nunca copy vaga):

- **"Trava a tela." → "O app trava junto." → "O nosso não."** — usa o
  duplo sentido de "trava" (tela bloqueada / app travando) pro diferencial
  de GPS que não para com a tela bloqueada.
- **"DESTRAVA"** (com "STRAVA" destacado em cor diferente dentro da
  palavra) **→ "sua corrida, seu treino e seu planejamento, tudo em um
  lugar só" → "e você não paga nada pra compartilhar sua corrida."** —
  citação direta da marca do concorrente (foge da regra "nunca comparação
  por marca" do resto deste arquivo — decisão consciente do dono do
  projeto, não descuido; registrar aqui pra não repetir sem perceber que é
  exceção).
- Outras variações na mesma família, não roteirizadas ainda: "PLANO"
  (todo plano no Brasil é pago — "o nosso é de treino, não de assinatura"),
  "sem pagar, sem parar", "corre atrás" (o app corre atrás de você, não do
  seu cartão).

**Regra técnica confirmada por teste real (2026-08-28): nunca pedir pra
IA de vídeo renderizar as palavras do trocadilho direto na tela** — texto
gerado por modelo de vídeo generativo sai deformado/errado quase sempre,
é o ponto mais fraco desses modelos hoje. O texto do trocadilho é sempre
overlay real adicionado na edição (CapCut/editor nativo), nunca parte do
prompt de vídeo. O que a IA gera é só o **fundo abstrato** por trás do
texto — nenhum personagem, nenhuma letra no prompt.

**Modelo escolhido pro fundo, por teste comparativo real**: não é o Vidu
Q3 usado pro cavalo (não tem personagem aqui, não precisa da força de
consistência dele) — testado `fal-ai/wan/v2.2-5b/text-to-video` (rápido,
~US$0,05/s) contra `fal-ai/wan/v2.2-a14b/text-to-video` (modelo maior,
mais caro). Primeira rodada de prompt ("slow, calm, continuous motion")
saiu praticamente estática nos dois — lição: evitar linguagem de
"calmo/lento" no prompt, pede movimento explícito tipo "tinta se
espalhando na água, formas crescendo/encolhendo continuamente". Segunda
rodada com prompt mais assertivo sobre movimento: dono do projeto
assistiu aos dois lado a lado e **preferiu o Wan 2.2 5B** (o mais barato
dos dois) — não precisou do modelo maior/mais caro pra esse uso.

**Primeiro post finalizado em 2026-08-29** (o vídeo em si, retomado de
scratch de uma sessão anterior que já tinha o fundo aprovado gerado):
concepto **"Trava a tela."** escolhido sobre o "DESTRAVA" — consultado o
agente `branding-alfredo` especificamente pra essa decisão (não só "qual
conteúdo é melhor", mas "qual é mais seguro pro *primeiro* post da conta,
sem histórico/confiança construída ainda") — vereditco: "Trava a tela"
porque a claim (GPS não pausa com tela travada) já passa no teste de "não
descreveria a Strava também", enquanto citar a marca da concorrente
("DESTRAVA") é uma aposta de sequenciamento melhor pra depois que a conta
já tiver mostrado que "mostra, não ataca". Vídeo final: 6.7s, 9:16,
mudo, 4 cards (Oswald Bold, contorno branco pra legibilidade sobre
qualquer trecho do fundo) — "Trava a tela." → "O app trava junto." →
"O nosso não." → "Xanthus. Não trava com você." — sobre o fundo Wan 2.2
5B já aprovado acima, overlay de texto real via ffmpeg (nunca renderizado
pelo modelo de vídeo). Entregue pro dono do projeto revisar antes de
postar manualmente (nunca automatizado, ver "O que nunca fazer" acima).

## Como manter isso vivo

Sempre que uma decisão nova de tom, formato, gancho que funcionou/não
funcionou, ou direção de arte for tomada, atualize este arquivo na hora —
mesma regra do `PROJECT-CONTEXT.md`. Métricas reais de uma peça publicada
(engajamento, retenção) valem mais que qualquer suposição deste arquivo;
quando divergirem, registrar o que aconteceu de verdade e ajustar.
