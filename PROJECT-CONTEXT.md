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
    HealthKit**, no Android é o **Health Connect**. O plano é ler dos dois
    via um único plugin Capacitor, achado por pesquisa:
    **`capacitor-health`** (`Cap-go/capacitor-health`, mantido, cobre os
    dois com uma API só). **Só funciona no app nativo** — HealthKit/Health
    Connect são APIs do sistema operacional, inexistentes no navegador/PWA;
    exige permissão nova (capability HealthKit no iOS, permissão Health
    Connect no Android) e rebuild dos dois projetos nativos.
  - **Dados considerados**: frequência cardíaca (inclusive em tempo real
    durante a corrida), calorias medidas de verdade (hoje é só estimativa),
    contagem de passos, treinos já registrados no relógio.
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
    - **Fase 3 (integração real)**: `capacitor-health@8.1.2` instalado
      (`npm install` + `npx cap sync` já rodados). `src/lib/health.ts`
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
    - **`HEALTH_DATA_ENABLED = true`** em `src/lib/health.ts` desde
      2026-08-19 — chave única que liga tudo isso de uma vez, mesmo padrão
      do `PHONE_AUTH_ENABLED`. Entitlement (`App.entitlements`) e a
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
         em 2026-08-18** (não em dispositivo real, isso ainda depende do
         item 2 acima): o plugin `capacitor-health` chama
         `HealthConnectClient.getOrCreate(context)` dentro de um
         `try/catch` (`HealthPlugin.kt`, método `isHealthAvailable`) — essa
         chamada da própria AndroidX Health Connect lança exceção quando o
         app Health Connect não está instalado no aparelho, e o plugin
         captura isso e resolve `{available: false}` em vez de rejeitar a
         chamada. `src/lib/health.ts`'s `isHealthAvailable()` tem seu
         próprio `try/catch` por cima disso (dupla proteção). E
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
- [ ] A corrida compartilhada / modo treinador tem trabalho combinado que
      ainda não está no código (além do que já está listado acima)?
- [ ] Alguma decisão de produto/negócio recente que vale registrar aqui
      (posicionamento, prioridade de roadmap, concorrência, etc.)?

## Como manter isso vivo

Sempre que uma sessão descobrir ou decidir algo relevante de produto/infra
que não é óbvio só lendo o código (contas, domínios, decisões de escopo,
prazos, ferramentas externas), atualize este arquivo na hora — não deixe
só na conversa. Detalhes puramente técnicos (como rodar, como configurar
CI/CD, arquitetura do tracking) já estão bem documentados no
`README.md` e não precisam ser duplicados aqui.
