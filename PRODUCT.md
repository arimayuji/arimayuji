# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Corredores recreativos e sérios no Brasil que já usaram apps como Strava, Nike Run Club ou Runkeeper e saíram insatisfeitos com dores específicas: preço que muda depois de já terem confiado no app, GPS que perde precisão ou para de gravar com a tela travada, dados presos sem exportação fácil, e suporte ausente. Um subconjunto secundário são treinadores que acompanham um ou vários alunos à distância.

## Product Purpose
App de corrida nativo (Android/iOS, mesmo código Next.js embutido via Capacitor) que resolve, com prova no próprio produto, as dores operacionais mais citadas contra a categoria: rastreamento por GPS que continua com a tela bloqueada, histórico e conquistas que funcionam sem exigir login, um plano de treino de verdade (motor determinístico com teto de segurança na progressão de volume, não um contador de km), e controle real dos próprios dados (exportação e exclusão de conta implementadas, não só prometidas). Sucesso é reter o corredor pela confiabilidade repetida (aparecer certo toda corrida), não por uma feature isolada.

## Positioning
"O app de corrida que não te trai depois que você já confiou nele" — nunca fica mais caro depois que o usuário já depende dele, nunca perde a corrida por travar em segundo plano, nunca prende os dados do corredor. Onde concorrentes vendem "o melhor GPS do mercado" sem prova, o Xanthus mostra o mecanismo real (rota desenhada ao vivo, comportamento documentado publicamente) em vez de alegar superioridade genérica.

## Operating Context
Usado majoritariamente durante uma corrida real ao ar livre, muitas vezes com o celular no braço/bolso e a tela bloqueada — qualquer interação em tela tem que sobreviver a esse contexto (toque grosso, sol forte, sem olhar a tela com atenção). Backend é Appwrite Cloud; boa parte das ações de rede passa por uma única Function consolidada (`client-actions`) por causa do teto de Functions do plano gratuito, não por escolha de arquitetura. A distribuição hoje é só apps nativos — sem PWA, sem instalação por navegador — com uma superfície web de desktop separada e menor (o painel do treinador, "Sala de Treino"), que nunca precisa de GPS/sensores.

## Capabilities and Constraints
Já implementado e em uso real: tracking por GPS com filtro Kalman, aviso por voz configurável, histórico com splits/PRs/conquistas, corrida compartilhada ao vivo (treinador, amigos, longão em grupo), plano de treino com progressão de volume determinística e sugestão por IA opcional (sempre com teto de segurança do motor, nunca IA sem controle), frequência cardíaca ao vivo via Bluetooth ou HealthKit/Health Connect, sincronização opcional de plano/perfil entre aparelhos, lugares pra correr avaliados pela comunidade, feed social só entre amigos aceitos (sem descoberta pública). Sem paywall em lugar nenhum do produto — restrição de negócio, não lacuna técnica. Login nunca é exigido para gravar ou ver o histórico de uma corrida; só entra para amigos/treinador/longão/sincronização, e mesmo assim o que compartilhar é escolha por corrida.

## Brand Commitments
Nome e mascote: Xanthus, referência ao cavalo imortal de Aquiles na Ilíada — a quem Hera deu a fala, e que avisa Aquiles chorando que ele vai morrer em batalha mas corre ao lado dele até o fim mesmo assim; a ideia-guia é "fala verdade difícil e não abandona". Marca visual: silhueta de cavalo rampante (heráldica), desenhada à mão/traçada, nunca fotorrealista nem gerada por IA em forma humana ou de exercício. Direção de arte obrigatória para qualquer imagem/vídeo novo: ilustração com contorno definido, estilo animado/cel-shaded. Conta pública: Instagram @xanthus.oficial. Tom de voz: nunca hype vazio ("você é incrível!!"), sempre humor autodepreciativo real e reconhecimento específico da dor do usuário — nunca "o melhor app do Brasil" genérico.

## Evidence on Hand
Base de fatos científicos curada à mão em `src/lib/evidence/facts.ts` (77 fatos, cada um com força e ressalva declaradas), usada para fundamentar o motor de treino e conteúdo educativo — nunca uma citação inventada. Nenhum testemunho de usuário, caso de sucesso ou benchmark de terceiro deve ser fabricado; o produto ainda não tem esse tipo de prova social real coletada.

## Product Principles
- Nunca prometer no marketing o que o produto não faz de verdade (ex.: nunca chamar o motor de plano determinístico de "IA" quando não é).
- Toda decisão de dado sensível (saúde, localização contínua, corrida ao vivo) é opt-in explícito e específico, nunca herdado de "já estar logado".
- Confiabilidade e recorrência valem mais que uma feature vistosa isolada — o mesmo raciocínio vale tanto pro produto (GPS confiável > GPS bonito) quanto pro conteúdo de marca.
- Nunca pedir mais permissão/dado do que a feature em questão realmente usa, e declarar isso com precisão nas lojas de app.
- Preço nunca muda depois que o usuário já depende do produto — sem paywall em hipótese alguma.
