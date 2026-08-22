# Contexto do projeto Xanthus (Pegasus Run)

> **Por que este arquivo existe:** em 2026-08-17 uma sessão do Claude Code
> perdeu o histórico de conversa no meio do trabalho (um update do app
> resetou o contexto no notebook, mas não no celular — ver o que restou
> disso na sessão "Xanthus"). Nada do código se perdeu, mas o *contexto de
> produto* que só existia no chat, sim. Este arquivo é importado direto no
> `CLAUDE.md` (`@PROJECT-CONTEXT.md`), então ele é recarregado do zero em
> **toda** sessão nova, independente do histórico de chat sobreviver ou
> não. É a fonte de verdade que não depende de memória de conversa.
>
> **Mantenha isso atualizado.** Quando decisões de produto/infra
> importantes forem tomadas fora do código (contas, prazos, parcerias,
> prioridade), peça pro Claude atualizar este arquivo na mesma sessão —
> não deixe só na conversa.

## O produto, em uma frase

App de corrida (concorrente do Strava/Nike Run Club/Runkeeper) construído
em cima das dores mais reclamadas do segmento: preço que muda depois, GPS
em que ninguém confia, dados presos, suporte ausente. Nasceu PWA pura; a
ida pra nativo foi motivada por um problema real e não resolvível em PWA
pura (GPS perde precisão ou para de vez com a tela travada) e, em
2026-08-21, o PWA foi **desligado por completo** — sem manifest, sem
service worker, sem instalação pelo navegador. Hoje é **só** apps nativos
(Android e iOS via Capacitor); o mesmo código-fonte Next.js continua
servindo os dois (o app inteiro embarcado na WebView do Capacitor), mas
`xanthus.app.br` virou landing page pura de marketing/download — nunca
mais serve o app rodando de verdade no navegador.

Nome de código no repo: `xanthus` / "Pegasus Run" (aparece nas duas formas
no histórico de tasks — mesmo projeto).

## Onde cada coisa mora

| Camada | Onde |
|---|---|
| Landing page (marketing/download, sem PWA) | Cloudflare Workers — domínio próprio `xanthus.app.br` já no ar como Custom Domain (2026-08-17), `xanthus.yujiarima.workers.dev` continua respondendo em paralelo (é o subdomínio padrão do Worker, nunca desliga) |
| Backend | Appwrite Cloud (auth, banco: `runs`, `live_runs`, `friendships`, `coach_relationships`, `place_ratings`, `run_comments`) |
| Download Android (APK) | `https://xanthus.app.br/download` — página de instruções (não mais o link cru do `.apk`), publicada automático a cada push em `main` |
| App nativo Android | `android/` (Capacitor), CI em `.github/workflows/android-build.yml` |
| App nativo iOS | `ios/` (Capacitor), CI em `.github/workflows/ios-build.yml` |
| Repositório | `arimayuji/xanthus` no GitHub — **não** `arimayuji/arimayuji` (repo separado, `main` vazia, sem relação com o projeto; ver "Bug crítico resolvido" abaixo) |

## Bug crítico resolvido: "Iniciar corrida" não fazia nada (nativo)

**Sintoma (relatado 2026-08-21):** no app Android nativo, tocar em "Iniciar
corrida" → tutorial de dicas → tutorial termina → volta pra mesma tela de
"Preparar corrida", nunca chega na tela de corrida ao vivo.

**Diagnóstico:** ~8 builds seguidos com `console.trace`/log persistido em
`localStorage` (`src/lib/tracking/diagLog.ts`, já removido) + captura via
`adb logcat` com o aparelho (Galaxy) plugado num Mac via USB. O log mostrou
que `useRunTracker.start()` roda limpo e chama `setState(status: "warming")`
— mas ~28ms depois `status` já está de volta em `"idle"`, e a tela de
"Preparar corrida" inteira monta do zero de novo (o efeito "drena o log do
mount anterior", que só roda uma vez por mount, disparou duas vezes em 2ms).

**Causa raiz:** `src/app/(app)/app-shell.tsx` renderizava `{children}` (a
página inteira) em duas árvores JSX estruturalmente diferentes,
alternando por um `if (immersive) {...} else {...}` — um `<div>` a mais,
mais `InstallPrompt`/header/nav como irmãos, num branch e não no outro.
`/run` chama `useImmersiveMode(status === "warming" || ...)`, que vira
`true` no instante exato em que `start()` roda. Como o React reconcilia
por *formato da árvore*, não pela identidade do elemento `children`, essa
troca de branch desmontava a subárvore inteira e montava uma nova do
zero — resetando `useRunTracker` (um hook local à página) de volta pro
estado inicial `"idle"`. Não era GPS, não era o plugin nativo, não era
Service Worker (já descartado antes) — era puramente um bug de
reconciliação do React no shell.

**Fix:** `AppShell` agora mantém `{children}` numa única posição fixa da
árvore (o mesmo `<div>` sempre), só trocando `className`/`style` e os
irmãos (header/nav/InstallPrompt) conforme `immersive` — nunca a
estrutura ao redor de `children`. A página nunca mais desmonta nesse
toggle. Fix + limpeza de toda a instrumentação de diagnóstico
(`console.trace`, `logDiag`, `global-error-alert.tsx`, `diagLog.ts`) no
commit `fe776a9`, branch `claude/strava-competitor-feedback-cyvop8`.

**Pegadinha de infra descoberta nessa mesma sessão:** o repo
`arimayuji/arimayuji` (pra onde os pushes deste Claude Code on the web
iam por padrão) tem a `main` vazia — 41 commits de "Update README.md",
nada do projeto de verdade. **O repo real é `arimayuji/xanthus`** —
tabela "Onde cada coisa mora" acima já corrigida pra refletir isso; era
`arimayuji/arimayuji` antes por engano. Toda branch/push relacionado ao
projeto precisa ir pro `xanthus`, não pro `arimayuji/arimayuji`.

## Status das contas de desenvolvedor (na data deste documento)

- **Apple Developer Program**: **configurada e ativa** (paga, US$99/ano).
  É essa conta que assina os builds de TestFlight e viabiliza Sign in with
  Apple. Os secrets (`APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
  `APP_STORE_CONNECT_API_KEY_P8`) já estão configurados no repo — o CI builda
  e sobe automaticamente pro TestFlight a cada push em `main`.
  **Limite diário de upload (visto em 2026-08-20)**: a Apple aplica um teto
  diário de quantos builds um app pode subir pro App Store Connect. Numa
  sessão com muitos pushes seguidos (cada push = 1 tentativa de upload), o
  job `testflight` do CI bateu nesse teto — `archive`/`export` completam
  normalmente, só o `altool --upload-app` final falha com
  `Upload limit reached... (90382)`. Não é bug de código nem do workflow;
  a própria mensagem da Apple diz que reseta em ~1 dia. Enquanto isso, todo
  push novo vai continuar mostrando esse job vermelho no Actions — Android e
  o deploy web (Cloudflare) não são afetados, seguem normais.
- **Google Play Developer**: conta **verificada e aprovada em 2026-08-21**.
  **Primeiro upload manual feito em 2026-08-21** — ficha do app "Xanthus"
  (`com.xanthus.app`) criada no Play Console, `.aab` publicado na faixa
  **Teste interno**. O secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` já foi
  configurado no repo (2026-08-21) — mas o primeiro push automático em
  `main` com o secret configurado **falhou** no step de publicação com:
  `"Google Play Android Developer API has not been used in project
  448192688045 before or it is disabled."` Não é bug de código nem do
  workflow — a API `androidpublisher.googleapis.com` precisa ser
  habilitada manualmente nesse projeto do Google Cloud antes de qualquer
  chamada funcionar: https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview?project=448192688045
  → "Ativar" → esperar alguns minutos propagar → tentar de novo. Enquanto
  isso não for feito, todo push em `main` mostra esse job vermelho
  (Android/web não são afetados, só a publicação automática no Play).
  Distribuição Android pro público geral continua por APK direto
  (sideload, link acima) até isso avançar pra teste fechado/produção.
  **Bug real achado nessa primeira tentativa de upload**: `gradlew
  bundleRelease` builda com sucesso e sem nenhum warning, mas o `.aab`
  saía **sem nenhuma assinatura jar embutida** mesmo com
  `signingConfigs.release` corretamente configurado (confirmado: o mesmo
  signingConfig assina o `.apk` perfeitamente via `assembleRelease`, e o
  keystore/alias decodificados no CI são válidos — `keytool -list`
  confirmou 1 entry PKCS12 sob o alias `xanthus`). Play Console rejeitava
  com `"todos os pacotes enviados precisam ser assinados"`. Duas causas
  raiz diferentes, corrigidas em sequência:
  1. `export FOO=bar` num step do `android-build.yml` só dura o processo
     de shell daquele step — não propaga pro step seguinte (só
     `$GITHUB_ENV` propaga). O `gradlew bundleRelease` (step separado do
     `assembleRelease`) rodava sem as env vars da keystore, caindo no
     branch "sem assinatura" que o `build.gradle` já trata sem erro.
  2. Mesmo depois de corrigir isso — e confirmado via log do CI que as
     env vars chegavam certinho no processo do `bundleRelease` — a task
     `signReleaseBundle` da Android Gradle Plugin (8.13.0) continuava
     produzindo um `.aab` sem assinatura, sem warning nenhum. Causa raiz
     do lado da AGP não identificada (`enableV1Signing`/V2/V3 explícitos
     no signingConfig não mudaram nada). Workaround aplicado: assinar o
     `.aab` manualmente com `jarsigner` logo depois do `bundleRelease`,
     reusando a mesma keystore/senha — confirmado funcionando (upload no
     Play Console passou, só com avisos genéricos, sem erro de
     assinatura). Ferramenta certa pra verificar isso é `jarsigner
     -verify` ou o `bundletool` do Google com `--ks` explícito — rodar
     `bundletool build-apks` **sem** `--ks` sempre cai pro keystore de
     debug, então isso NÃO serve como teste de "o .aab tem assinatura
     própria" (armadilha em que caí investigando isso).
  **Bug de CI achado e corrigido em 2026-08-21**: até esse dia, o step de
  publicação no Play Store **não tinha `continue-on-error`** — uma falha
  nele (como a da API desabilitada, acima) fazia o GitHub Actions pular
  **todas** as etapas seguintes daquele job por padrão, inclusive o
  `wrangler deploy` que publica o site e o link fixo do APK. Ou seja: o
  primeiro push em `main` depois do secret configurado buildou tudo
  certinho mas **não publicou nada** — nem o site, nem o APK — porque a
  falha do Play Store travou o resto do job silenciosamente. Corrigido
  adicionando `continue-on-error: true` nesse step, mesmo padrão
  best-effort que os steps de deploy do Cloudflare já usavam pra secret
  ausente. Confirmar de vez em quando que `Publish AAB to Google Play`
  aparece riscado/amarelo (falhou mas não bloqueou) em vez de vermelho
  sólido (bloqueou o job) nos runs do Actions.

## Onde cada plataforma está no funil de lançamento

A landing page (`src/app/page.tsx`) oferece dois caminhos, peso igual —
desde 2026-08-21 **não existe mais opção de rodar no navegador** (PWA
desligado por completo, ver "O produto, em uma frase" acima):

1. **Android** — botão "Baixar APK", direto pro link fixo do Cloudflare.
   App instalado de verdade, GPS não pausa com tela travada.
2. **iPhone** — **sem botão de download**, só um badge "Em teste fechado".
   Convidados do TestFlight Internal Testing já conseguem instalar. O
   **External Testing foi submetido pra Beta App Review em 2026-08-21**
   (build 107, grupo "Beta") — o link público
   (`https://testflight.apple.com/join/RMqtChWj`) só libera instalação de
   verdade depois que a Apple aprovar; até lá continua "em teste fechado"
   de fato. Upload automático pro TestFlight a cada push continua normal;
   promoção pra produção continua sem prazo definido.

## OAuth / Login social

- **Google**: funcionando, via Appwrite (Google Cloud Console → OAuth
  client novo depois que o projeto GCP anterior foi excluído e recriado).
- **Apple**: implementado (Sign in with Apple, obrigatório pela guideline
  4.8 da App Store já que o app oferece login Google) — task #51 concluída.
- **Microsoft**: **removido** — as 3 opções de OAuth (Google/Apple/Microsoft)
  davam o mesmo erro do Appwrite ("Invalid success param", plataforma Web
  não registrada); depois de registrar `xanthus.app.br` como Web Platform
  no Appwrite Console isso desbloqueou Google e Apple, mas o Microsoft foi
  descartado por decisão do produto (não é bug pendente).
- **Telefone/SMS**: código pronto (2026-08-17) e desligado —
  `src/lib/auth.ts` (`sendPhoneOtp`/`verifyPhoneOtp`) +
  `src/app/(app)/account-prompt.tsx` (`PhoneSignIn`), atrás de
  `PHONE_AUTH_ENABLED = false`. **Não precisa de nenhuma env var/secret
  no repo** — o que falta é só configurar um provedor de SMS de verdade
  no **Appwrite Console → Auth → Settings → SMS** (Twilio, MSG91, Vonage
  ou TextMagic) com as credenciais reais; feito isso, é só virar essa
  flag pra `true`. Custo estimado via Twilio pra número brasileiro:
  ~US$ 0,125 por login verificado (US$ 0,075 do SMS + US$ 0,05 do
  Twilio Verify) — motivo de ainda estar desligado.

## Domínio e e-mail

- `xanthus.app.br` — registrado como Web Platform no Appwrite Console
  (Overview → Platforms → Add Platform → Web App) **e** conectado como
  Custom Domain no Cloudflare Workers (confirmado no ar em 2026-08-17) —
  serve o mesmo Worker que `xanthus.yujiarima.workers.dev`, então os dois
  hosts respondem em paralelo. Todo link novo voltado pro usuário
  (`updateCheck.ts`, `version.json` publicado pelo CI, e-mail de
  boas-vindas, README) já usa `xanthus.app.br`.
  **Pegadinha achada em 2026-08-21**: os dois hosts respondem o mesmo
  conteúdo, mas só `xanthus.app.br` está cadastrado como Web Platform no
  Appwrite Console — abrir `xanthus.yujiarima.workers.dev` direto faz
  **toda** chamada de conta (login, perfil, ranking, etc.) falhar
  silenciosamente com CORS 403 (`Origin ... is not allowed by
  Access-Control-Allow-Origin`), já que o navegador bloqueia antes da
  resposta chegar no app. `getCurrentAccount()` engole esse erro com
  graça (volta `null`, mesmo comportamento de "sem conta"), mas ainda
  assim gerou um relato confuso de bug ("iniciar corrida não faz nada")
  que na real era só estar testando no host errado. **Sempre testar o
  PWA web em `xanthus.app.br`, nunca no `.workers.dev` direto** — se algum
  dia isso precisar funcionar nos dois hosts, a correção é cadastrar o
  `.workers.dev` como uma segunda Web Platform no Appwrite Console, não
  mexer em código.
  **Regressão de 2026-08-18, já resolvida**: usuário reportou `xanthus.app.br`
  devolvendo `DNS_PROBE_FINISHED_NXDOMAIN` no navegador (o binding de Custom
  Domain do Worker tinha caído do lado da Cloudflare — a zona continuava
  corretamente delegada, só o binding em si tinha sumido). Usuário
  re-adicionou o Custom Domain no dashboard; confirmado voltando a
  responder `200` (`curl -sI https://xanthus.app.br/`) ainda em 2026-08-18,
  poucas horas depois. Voltou ao normal, nada de código envolvido.
- E-mail via **Cloudflare Email Routing**, sem regras antes de 2026-08-17:
  hoje existem `contato@xanthus.app.br` e `feedback@xanthus.app.br`,
  ambos redirecionando pro e-mail pessoal do dono do projeto.
  `/privacidade` já usa `contato@xanthus.app.br` no lugar do e-mail
  pessoal (trocado nesta mesma leva de sessões).

## Funcionalidades já construídas (confirmado direto no código)

Ver a lista completa de tasks concluídas (#1–#52) na sessão do Claude Code
chamada "Xanthus" — resumo por área:

- **Tracking de corrida** (`/run`): GPS (web + nativo via
  `@capacitor-community/background-geolocation`), filtro Kalman/EWMA,
  aviso por voz configurável, wake lock, pausas com motivo, rota
  desenhada ao vivo no mapa (MapLibre + Protomaps/PMTiles + MapTiler).
- **Histórico**: por corrida, com mapa, splits, PRs, conquistas com
  "unboxing" de emblema por tier.
- **Compartilhamento**: card de corrida (`/compartilhar`) — o parâmetro
  `?run=id` só resolve contra o IndexedDB local do próprio aparelho, não é
  um link público hospedado no servidor (corrigido em 2026-08-17, ver
  achado C6 da auditoria LGPD).
- **Corrida compartilhada / modo treinador** — já construído e wired:
  - `live_runs` (tabela Appwrite) + `src/lib/liveRuns.ts` (sync)
  - Aluno compartilha corrida ao vivo a partir de `/run`
  - Treinador vê a posição do aluno em tempo real num mapa próprio
    (`group-live-map.tsx` / viewer do treinador)
  - Relação treinador↔aluno com convite/aceite (`/treinador`)
  - **Se isso ainda estiver em desenvolvimento ativo além do que está
    commitado, avisa — o que existe no código é o que está descrito
    acima, pode já ter mais coisa combinada que não chegou a ser
    implementada.**
- **Longão**: corrida em grupo com código de convite, vários corredores
  no mesmo mapa ao vivo.
- **Amigos**: convite por @handle.
- **Perfil**: unidade km/mi, intervalo de aviso por voz, estatísticas na
  tela de corrida, tênis com quilometragem por tênis, **tema
  claro/escuro/sistema** (adicionado 2026-08-17).
- **Lugares pra correr**: parques avaliados por segurança/iluminação/etc.
- Política de privacidade, exclusão de conta (Appwrite Function
  dedicada, `appwrite-functions/delete-account`), PWA instalável.

O que ainda é maquete (não persiste de verdade): meta de prova em
`/perfil` — está marcado como tal no próprio código, não finge ser real.

## Funcionalidades planejadas, ainda não implementadas

- **Dados de saúde do smartwatch** (escopado em 2026-08 numa sessão anterior,
  contexto recuperado do transcript bruto porque nunca foi salvo aqui —
  registrando agora pra não se perder de novo):
  - **Abordagem técnica**: nenhum relógio conversa direto com o app — todos
    (Apple Watch, Garmin, Fitbit, Samsung, Coros) sincronizam primeiro pro
    repositório de saúde do próprio celular. No iOS isso é o **Apple
    HealthKit**, no Android é o **Health Connect**. O plano sempre foi ler
    dos dois via um único plugin Capacitor, achado por pesquisa:
    **`Cap-go/capacitor-health`**, mantido pela mesma equipe do plugin de
    GPS já em produção (`@capgo/background-geolocation`), cobrindo os dois
    com uma API só. **Só funciona no app nativo** — HealthKit/Health Connect
    são APIs do sistema operacional, inexistentes no navegador/PWA; exige
    permissão nova (capability HealthKit no iOS, permissão Health Connect
    no Android) e rebuild dos dois projetos nativos.
    **Pegadinha achada e corrigida em 2026-08-22**: a implementação original
    instalou o pacote npm de nome simples `capacitor-health` (fork de
    `mley`), não o `@capgo/capacitor-health` pretendido aqui — nomes
    parecidos, pacotes diferentes. O fork errado só lia passos/FC média/
    calorias/distância; o certo lê tudo isso **e** FC em repouso, HRV, VO2
    máx e sono. Trocado pro pacote certo nessa data — ver "Estudo de
    captação de wearables" abaixo.
  - **Dados considerados**: frequência cardíaca (inclusive em tempo real
    durante a corrida — ainda não implementado, ver estudo de captação),
    calorias medidas de verdade (antes só estimativa), contagem de passos,
    treinos já registrados no relógio, e desde a correção do plugin:
    frequência cardíaca em repouso, variabilidade de frequência cardíaca
    (HRV), VO2 máx estimado, sono (com estágio).
  - **LGPD**: dado de saúde é categoria sensível (Art. 5º, II) — decidido
    que precisa de **tela de consentimento própria em `/perfil`**,
    separada do consentimento geral já existente, explicando exatamente o
    que é lido e de onde, com toggle que só ativa depois do aceite
    explícito.
  - **Status em 2026-08-17: fases 1, 2 e 3 todas com código pronto**, atrás
    de uma flag desligada (nada disso está ativo pra usuário nenhum ainda):
    - **Fase 1+2 (consentimento + maquete)**: card "Dados de saúde do
      smartwatch" em `/perfil`, explica o que seria lido e o motivo LGPD,
      toggle "Ver como ficaria" (estado local, não persistido) revela um
      card com FC/calorias/passos fictícios via `ExampleBadge`.
    - **Fase 3 (integração real)**: `@capgo/capacitor-health@8.10.4`
      instalado (`npm install` + `npx cap sync` já rodados; era
      `capacitor-health@8.1.2` — pacote errado, ver correção acima).
      `src/lib/health.ts`
      implementa `isHealthAvailable`/`requestHealthPermissions`/
      `fetchRunHealthData` de verdade, contra a API real do plugin
      (verificado lendo o Kotlin/Swift do pacote em `node_modules`, não só
      o README). `fetchRunHealthData` casa um treino do relógio com a
      janela de tempo da corrida (±10 min de tolerância) e devolve FC
      média/calorias/passos. Ligado em `historico/detalhe` (`run-detail.tsx`):
      um novo `StatQuadrant` de "FC média" e a calorias passam a preferir o
      valor medido do relógio (rotulado "Calorias (relógio)") quando
      disponível. Manifests nativos já configurados: `AndroidManifest.xml`
      (activity/activity-alias de `PermissionsRationaleActivity`, `queries`
      pro Health Connect, `uses-permission android.permission.health.*`) e
      `Info.plist` (`NSHealthShareUsageDescription`/
      `NSHealthUpdateUsageDescription`).
    - **Correção 2026-08-22 (a linha abaixo estava desatualizada)**:
      `HEALTH_DATA_ENABLED` foi **desligado de novo** (`= false`) numa
      auditoria LGPD/segurança em 2026-08-17/21 — estava lendo FC/calorias/
      passos automaticamente sem nenhuma tela de consentimento própria, só
      o aviso de permissão do sistema (que consente com o sensor, não com o
      uso do dado pelo app). Em 2026-08-22 essa lacuna foi fechada de
      verdade: `preferences.ts` ganhou `healthDataConsent` (desligado por
      padrão), `/perfil/relogio` tem um toggle real explicando o que é lido
      e de onde, `/privacidade` já declara HealthKit/Health Connect, e
      `fetchRunHealthData` checa esse consentimento por conta própria (não
      só a flag). Falta só religar `HEALTH_DATA_ENABLED = true` — o resto
      dos itens abaixo (capability HealthKit, teste em aparelho) continua
      valendo como estava.
    - ~~**`HEALTH_DATA_ENABLED = true`** em `src/lib/health.ts` desde
      2026-08-19~~ — ver correção acima. Entitlement (`App.entitlements`) e a
      capability no `project.pbxproj` já commitados em `main` (commits
      `673ad84`/`c8aa8bf`). Faltava:
      1. ~~Habilitar a **capability HealthKit** no App ID no Apple Developer
         Portal~~ — **feito manualmente pelo dono do projeto em
         developer.apple.com em 2026-08-19** (passo que não dava pra fazer
         por código). Ainda não confirmado se o build assinado do TestFlight
         (job `testflight` em `ios-build.yml`, assinatura automática com API
         key Admin) já reflete isso sem erro — checar os últimos runs em
         github.com/arimayuji/xanthus/actions antes de assumir que está
         tudo verde.
      2. Testar em aparelho real com um relógio de verdade sincronizado —
         nada disso foi validado em dispositivo, só `tsc`/`eslint`/`next
         build` (o plugin é nativo puro, não roda no sandbox nem no
         navegador). Esse é o único bloqueio real que resta.
      3. ~~Confirmar que o Android realmente lê certo quando o Health
         Connect não está instalado~~ — **confirmado por leitura de código
         em 2026-08-18, reconfirmado em 2026-08-22 após a troca de
         plugin** (não em dispositivo real, isso ainda depende do item 2
         acima): o `@capgo/capacitor-health` chama
         `HealthConnectClient.getSdkStatus(context)` (`HealthPlugin.kt`,
         método `isAvailable`) — API dedicada de status que nunca lança
         exceção, diferente do `getOrCreate()`-em-`try/catch` que o fork
         antigo usava, mas com a mesma garantia final: resolve
         `{available: false}` em vez de travar quando o app Health Connect
         não está instalado. `src/lib/health.ts`'s `isHealthAvailable()`
         tem seu próprio `try/catch` por cima disso (dupla proteção). E
         `fetchRunHealthData()` já checa `isHealthAvailable()` primeiro e
         devolve `null` antes de chamar `requestHealthPermissions()` ou
         qualquer query — nenhuma chamada nativa a mais acontece nesse
         caminho. Na UI (`run-detail.tsx`), `healthData` nulo já cai de
         volta pro comportamento antigo sem quebrar nada: o card de FC
         média some, calorias volta pra estimativa. Resta só o item 2 acima
         (teste em aparelho real) como validação real pendente — a flag já
         está ligada em `main`.

## Ferramentas externas usadas no projeto

- Design/animações/logo: **[Recraft AI](https://www.recraft.ai/)**.
  - **API pública**: cobre geração de imagem/vetor (`https://external.api.recraft.ai/v1`,
    Bearer token) — dá pra chamar direto por código com um token. **Vídeo
    não tem API** — o gerador de vídeo só existe dentro do Recraft Studio
    (web), não é automatizável; alguém precisa gerar manualmente lá e
    passar o arquivo pronto.
  - **Direção de arte (decidido em 2026-08-17)**: qualquer coisa gerada na
    Recraft — imagem ou vídeo — deve ser **ilustração desenhada à mão,
    com contorno definido, estilo animado/cel-shaded**, nunca
    fotorrealista. Vale pra qualquer prompt futuro (o brand mark e as
    artes de emblema já seguem essa linha; um clipe de vídeo "quase
    realista" gerado a partir de uma foto foge da identidade visual do
    app).

## Redes sociais

- Instagram: **[@xanthus.oficial](https://instagram.com/xanthus.oficial)** —
  linkado em `/perfil` (card "Instagram"). A bio do Instagram é o lugar
  combinado pra colocar os links de download (APK/TestFlight), não o app.

## Submissão pro Beta App Review — branch `testflight` (2026-08-21)

Toda push em `main` já sobe automático pro TestFlight (Internal Testing,
sem revisão da Apple). Mas **submeter esse build pra revisão externa**
(o que libera o link público pra novos testadores) virou uma decisão à
parte, não automática — decidido porque automatizar em cima de todo push
gastaria uma revisão de verdade da Apple a cada commit, com risco real de
rejeição por nota "o que testar" genérica.

Mecanismo: branch `testflight`, que só existe pra isso. Fluxo:
```
git checkout testflight && git merge main && git push
```
Isso dispara o job `submit_for_review` em `ios-build.yml`, que roda
`scripts/ci/submit-testflight-review.mjs` — usa as mesmas três secrets
`APP_STORE_CONNECT_*` já configuradas (via JWT ES256 assinado com o
`.p8`), espera o build mais recente terminar de processar no App Store
Connect, adiciona ao grupo externo "Beta" e cria a submissão de revisão.
Não builda nada novo — só age sobre o que `main` já subiu.

**Testado contra a conta real em 2026-08-21, run bem-sucedido em termos de
mecanismo**: JWT ES256, autenticação, achar o app por bundle id, achar o
build mais recente processado, e adicionar ao grupo "Beta" — tudo
funcionou exatamente como documentado, sem nenhum ajuste de código
necessário. A chamada final (`POST /betaAppReviewSubmissions`) falhou,
mas com um erro **esperado de regra de negócio da Apple**, não um bug do
script:
```
422 ENTITY_UNPROCESSABLE.ANOTHER_BUILD_IN_REVIEW
"Another build in the same train is already in beta review.
Please submit it again once it gets completed."
```
A Apple só permite **um build em revisão por vez** por app — o build 107
(submetido em 2026-08-21, ver seção "Submissão pro Beta App Review" acima
nas perguntas em aberto) ainda estava pendente de aprovação quando esse
teste rodou. Assim que a Apple resolver essa revisão (aprovar ou rejeitar),
um novo push pra `testflight` deve completar a submissão normalmente —
não precisa de nenhuma mudança de código, só esperar o build anterior
sair da fila.

## Auditoria LGPD/segurança — status em 2026-08-22

22 achados originais (2 Crítico, 6 Alto, 9 Médio, 5 Baixo). **16
corrigidos** ao longo de duas sessões, **6 em aberto**. Detalhe completo
achado-a-achado só existe no chat/branch, não replicado aqui — o que
importa persistir é a ação pendente:

- **Bloqueio de infra achado em 2026-08-22 tentando deployar**: o projeto
  Appwrite Cloud já bate no teto de Functions do plano atual com só 2
  Functions existentes (`send-welcome-email`, `join-group-run`) —
  `appwrite functions create` retorna `"The maximum number of functions
  allowed for the selected plan has reached. Upgrade to increase the
  limit."` antes mesmo da primeira das 5 pendentes (`claim-owned-row`,
  `revoke-coach-run-access`, `revoke-live-audience`, `set-plan-override`,
  `suggest-plan-override`) ser criada. Não é bug de código nem do CLI — é
  literalmente o teto do plano contratado no Appwrite Cloud. Nada foi
  apagado nem alterado no projeto tentando contornar isso. **Preço
  conferido em appwrite.io/pricing (2026-08-22)**: o plano **Free** (o
  atual) permite só **2 Functions por projeto** — exatamente as duas que
  já existem. O plano **Pro** (a partir de **US$25/mês**) libera Functions
  **ilimitadas**. **Decisão pendente do dono do projeto**: upgradar pro
  Pro, ou priorizar quais das 5 Functions pendentes cabem no limite atual
  caso não vá upgradar agora.
- **3 Appwrite Functions criadas nesta sessão pra fechar a auditoria LGPD,
  ainda NÃO deployadas** (bloqueadas pelo teto de plano acima; código
  pronto no branch `claude/strava-competitor-feedback-cyvop8`, instruções
  completas de deploy no `README.md`):
  - `claim-owned-row` — só assim que ela existir e `scripts/appwrite-setup.ts`
    rodar de novo é que fecha de vez o achado #12 (linha de perfil/stats
    "reservável" por outra conta antes do dono real criar a sua).
  - `revoke-coach-run-access` — Function por **evento** (não por chamada do
    cliente), dispara sozinha quando um vínculo de treinador é desfeito.
  - `revoke-live-audience` — Function por **evento**, dispara sozinha quando
    alguém sai de um longão.
  - **Enquanto as três não forem deployadas, os achados #10, #11 e #12
    continuam de fato abertos em produção**, mesmo com o código já commitado
    — a mitigação só vale a partir do deploy real.
- **Em aberto, dependem só do dono do projeto em console externo**:
  rotacionar `APPWRITE_SETUP_API_KEY` (achado #08, decidido adiar), restringir
  a chave pública da MapTiler por domínio (achado #13).
- **Em aberto, decisão de produto tomada, sem ação de código pendente**:
  achado #15 (chaves Gemini/Recraft paradas) — decidido manter, vão ser
  usadas; achado #18 (bucket de avatares público) — decidido manter, estilo
  "Strava só que melhor/gaming" (não detalhado ainda o que isso significa
  visualmente).

## Modo treinador com IA — Fase A implementada, Fase B planejada

Pedido do dono do projeto (2026-08-22): o "modo treinador" deveria virar
algo mais parecido com o Runna — um treinador de verdade ajustando o plano
de um aluno, eventualmente com IA sugerindo e input tipo planilha. Decisão
de arquitetura: **"os dois juntos"** — a IA (fase futura) sugere, o motor
determinístico existente (`src/lib/plan/`, limites como o teto de +30%/2
semanas do `buildVolumeRamp`) trava a sugestão dentro de limites seguros
antes dela virar um override real, e o treinador ainda pode editar por
cima via a mesma tela da Fase A. A Fase B também vai usar RAG contra
`src/lib/evidence/facts.ts` (a mesma base de fatos citados que `/plano` e
`/estudos` já usam) com um modelo lowcost (provável Gemini Flash, chave já
em `.env.local`), em vez de uma chamada de LLM sem embasamento.

**Fase A (implementada nesta sessão, branch `claude/strava-competitor-feedback-cyvop8`,
ainda não deployada em produção)** — só o override manual, sem IA nenhuma:

- Tabela nova `plan_overrides` (`scripts/appwrite-setup.ts`): chave
  `(coachId, studentId, weekStartDate)`, `rowId` determinístico
  `${studentId}_${weekStartDate}`. `permissions: []` na tabela — só a
  Function grava.
- Function `set-plan-override` (`appwrite-functions/set-plan-override/`):
  mesmo padrão de `join-group-run`/`claim-owned-row` — confirma vínculo
  `accepted` em `coach_relationships` antes de gravar, chave privilegiada,
  nunca escrita direta do cliente. **Ainda não deployada** — bloqueada
  pelo teto de plano do Appwrite Cloud, ver "Auditoria LGPD/segurança"
  acima; instruções de deploy no `README.md`.
- `src/lib/plan/coachOverride.ts` (`applyCoachOverride`): merge puro que
  sobrepõe o override no `PlannedWeek` calculado pelo motor — usado tanto
  em `/plano` quanto em `/run` (chip "Treino de hoje").
- `src/lib/coachPlanOverrides.ts`: round-trip com o Appwrite
  (`setPlanOverride`/`listPlanOverridesForStudent`/`deletePlanOverride`).
- Tela nova em `/treinador/aluno`: card "Planilha da semana" —
  navegação de semana (setas ← →), 7 linhas (dia, km, tipo via
  `SegmentedButton`, zona de ritmo só quando o tipo é "Forte"), recado
  opcional, Salvar/Remover.

**Limitação de arquitetura, importante pra qualquer trabalho futuro
nessa área**: o treinador **não consegue ver o plano que o motor já
calculou pro aluno** — `computeCurrentPlanWeek` depende do
`RunnerProfile` (localStorage) e do histórico de corridas (IndexedDB) do
próprio aparelho do aluno, nada disso sincroniza pro Appwrite. Por isso a
tela do treinador é uma planilha em branco (o treinador digita tudo do
zero), não uma tela de "revisar e ajustar o palpite do motor". Resolver
isso de verdade exigiria sincronizar pelo menos o resumo do plano do aluno
pro Appwrite — não fizemos isso, ficou como limitação conhecida da Fase A.

**Correção de bug feita junto com a Fase A**: até esta sessão,
`planStartDate` (o dia em que a semana 1 do plano do aluno começa) era
carimbado com "hoje", em qualquer dia da semana — mas o treinador não tem
como saber esse valor (é local ao aparelho do aluno) e precisa *adivinhar*
em que data cada semana do plano começa pra saber qual `weekStartDate`
usar num override. A tela do treinador adivinha usando a segunda-feira do
calendário (`mondayOf`, `src/lib/tracking/stats.ts`) — o que só funciona
se o plano do aluno também começar numa segunda. Corrigido carimbando
`planStartDate` sempre com a segunda-feira anterior ou igual a hoje
(`currentMondayIsoDate`, novo em `src/lib/runnerProfile.ts`), em vez do
dia exato em que o goal foi configurado. Sem essa correção, um override de
treinador simplesmente nunca bateria com a semana real do aluno pra quase
ninguém.

**Fase B (implementada nesta sessão, branch `claude/strava-competitor-feedback-cyvop8`,
ainda não deployada em produção)**:

- Function `suggest-plan-override` (`appwrite-functions/suggest-plan-override/`):
  chama Gemini Flash (`GEMINI_API_KEY`, já em `.env.local` — primeira
  Function deste projeto que precisa de um secret externo, não só
  `x-appwrite-key`) grounded num recorte curado de
  `src/lib/evidence/facts.ts` (só os tópicos volume_progression/
  periodization/taper/overtraining/injury_prevention — o resto do corpus
  não decide nada aqui). O contexto real vem do km semanal das últimas até
  4 semanas de corrida que o aluno já compartilhou com esse treinador
  (`runs` table, bucketed por segunda-feira em horário de Brasília fixo —
  sem DST desde 2019, então um offset fixo de UTC-3 é seguro). **Só
  leitura** (`databases.read`) — nunca escreve `plan_overrides` sozinha.
- O teto de segurança é a mesma matemática de
  `src/lib/plan/volumeProgression.ts` (`WEEKLY_STEP`/`TWO_WEEK_CEILING`,
  duplicada à mão no `main.js` da Function com comentário apontando de
  volta pro original — Functions aqui não têm build step nem import
  compartilhado com o app, mesma razão que já vale pra `facts.ts`) aplicada
  a uma semana avulsa em vez de a uma rampa inteira: nunca mais que
  +10%/semana nem mais que 30% acima de 2 semanas atrás. Isso é reforçado
  **depois** da resposta do Gemini (o total sugerido é escalado pra baixo
  se estourar), não é só instrução no prompt — defesa em profundidade.
- **Sem histórico real de corrida compartilhada, a Function recusa
  sugerir** (`no-history`) em vez de inventar um teto — não dá pra travar
  um limite de segurança sem dado real pra travar contra.
- Cliente (`src/lib/coachPlanSuggestion.ts`): `suggestPlanOverride()` só
  chama a Function e devolve a sugestão — **nunca salva sozinho**. Em
  `/treinador/aluno`, botão "Sugerir com IA" (com campo opcional de
  contexto livre pro modelo, ex. "joelho doendo") preenche o rascunho da
  planilha da Fase A; o treinador ainda revisa/edita e clica "Salvar
  semana" (que é a `set-plan-override` de sempre) — a arquitetura "os dois
  juntos" decidida nesta sessão, na prática: IA sugere, motor trava,
  treinador confirma.
- **Ainda não deployada** — bloqueada pelo teto de plano do Appwrite
  Cloud, ver "Auditoria LGPD/segurança" acima; instruções completas no
  `README.md`, incluindo o passo extra de configurar a variável `GEMINI_API_KEY` no
  Appwrite Console (não é opcional pra essa Function, ao contrário das
  outras).

## Perguntas em aberto (preencher quando puder)

- [x] **2026-08-21: aprovada** — conta de desenvolvedor do Google Play
      verificada. Falta só configurar o secret
      `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` e fazer o primeiro upload pro
      Play Console (fluxo já documentado no `README.md`).
- [x] **2026-08-19: decidido, 2026-08-21: executado** — TestFlight External
      Testing. Grupo "Beta" já existia no App Store Connect com link público
      pronto (`https://testflight.apple.com/join/RMqtChWj`), mas sem nenhum
      build associado (0 builds). Adicionado o build 107 ao grupo, preenchido
      "What to Test" e **submetido pra Beta App Review em 2026-08-21** —
      aguardando aprovação da Apple (geralmente horas a 1-2 dias). **O link
      público só libera instalação de verdade depois que esse build for
      aprovado** — até lá, ele existe mas não deixa ninguém entrar. Não
      colocar na bio do Instagram antes da aprovação. Revisão de build
      externo é por build, não por grupo: depois de aprovado, dá pra
      adicionar/remover testadores e até criar grupos novos com esse mesmo
      build sem precisar de nova revisão — só builds novos exigem revisão de
      novo. Revisão completa da App Store (produção) continua sem prazo
      definido.
- [x] **2026-08-22: escopado e Fase A implementada** — modo treinador vira
      "os dois juntos" (IA sugere + motor determinístico trava os limites +
      treinador edita por cima), ver seção própria acima. Fase A (planilha
      manual, sem IA) já tem código pronto, só falta deploy da Function
      `set-plan-override`. Fase B (IA + RAG) ainda não começou.
- [ ] Alguma decisão de produto/negócio recente que vale registrar aqui
      (posicionamento, prioridade de roadmap, concorrência, etc.)?
- [x] **2026-08-22: análise competitiva feita** — 16 reviews do Google Play
      de "Runna: Treinador de Corrida" (4.9★) extraídas e cruzadas com o que
      o Xanthus já entrega. Achado principal: o Xanthus já cobre as dores
      operacionais mais citadas (GPS confiável, sem travar em segundo plano,
      sem paywall, sem exigir login, em pt-BR) — essas eram literalmente o
      motivo do produto existir. Gap real de ambição de produto: o Runna tem
      plano de treino adaptativo por IA + módulo de treino de força; o
      Xanthus tem plano de treino (motor determinístico, `src/lib/plan/`,
      **não** IA) mas ele não tinha aderência real — corrigido em 2026-08-22
      (`planStartDate` ancorado + chip "Treino de hoje" em `/run`, ver acima
      na seção de tracking). Treino de força **decidido não fazer** por ora
      (aparece nas reviews majoritariamente como bug, não como o que
      fideliza). Falta ainda: casar corrida gravada com sessão planejada
      (marcar feito/pulado) e recalcular o ramp de volume pelo que
      realmente aconteceu — não fizemos essa parte ainda, escopado mas não
      construído.
- [ ] **Smartwatch — decisão pendente entre dois caminhos, não escolhida
      ainda**: "Caminho A" (ler HealthKit/Health Connect pós-corrida, já
      existe e cobre toda marca de relógio, mas não é ao vivo) teve seus
      itens de pré-requisito fechados em 2026-08-22 — falta só religar
      `HEALTH_DATA_ENABLED` e testar em aparelho real (ver acima). "Caminho
      B1" (FC ao vivo via Bluetooth Heart Rate Service, `0x180D`) foi só
      pesquisado, nada implementado — cobre cinta/relógio em modo broadcast
      mas nunca Apple Watch (não transmite por BLE). Não são excludentes,
      mas a ordem recomendada é A primeiro (mais gente, menos trabalho).

## Como manter isso vivo

Sempre que uma sessão descobrir ou decidir algo relevante de produto/infra
que não é óbvio só lendo o código (contas, domínios, decisões de escopo,
prazos, ferramentas externas), atualize este arquivo na hora — não deixe
só na conversa. Detalhes puramente técnicos (como rodar, como configurar
CI/CD, arquitetura do tracking) já estão bem documentados no
`README.md` e não precisam ser duplicados aqui.
