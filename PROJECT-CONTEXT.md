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
  **Atualização 2026-08-24 — API já habilitada, resolvido sozinho**:
  confirmado no log do run #161 (push em `main`) que o step de publicação
  teve sucesso de ponta a ponta, sem nenhum erro de API — não ficou claro
  quando exatamente alguém habilitou `androidpublisher.googleapis.com`,
  só que já está propagado e funcionando. **Mas o problema de fundo pro
  usuário final continuava**: a faixa publicada era `internal` (Teste
  Interno) — invisível na ficha pública da Play Store, só abre pra quem
  está numa lista de testadores cadastrada à mão no Play Console. Um
  usuário qualquer clicando em
  `play.google.com/store/apps/details?id=com.xanthus.app` via a
  notificação de "nova versão" via `/download` (ver "Onde cada
  plataforma está no funil de lançamento" acima) via essa faixa
  simplesmente não conseguia baixar nada — primeira decisão do dono do
  projeto: mudar `track: internal` pra `track: production`. **Revista
  ainda no mesmo dia**, antes de qualquer push: contas de desenvolvedor
  novas (a nossa foi aprovada em 2026-08-21) precisam completar um teste
  fechado com pelo menos 12 testadores por 14 dias corridos antes do
  Google liberar o primeiro envio pra produção — exigência de conta, não
  algo que o CI resolve sozinho, e bem provável que essa conta ainda não
  cumpriu. **Decisão inicial (2026-08-24, corrigida em 2026-08-25 — ver
  abaixo): `track: open`** — a suposição na hora foi que Teste Aberto
  ficava de fora da trava de conta nova, por analogia direta com o grupo
  externo "Beta" do TestFlight no iOS. **Essa suposição estava errada.**
  Confirmado direto na UI do Play Console em 2026-08-25 (a aba "Teste
  aberto" mostra um ícone de cadeado com o texto literal: "O teste aberto
  fica disponível quando você tem o acesso de produção"): no Android, ao
  contrário do iOS, a faixa Aberta **também** exige ter primeiro o acesso
  de Produção — que por sua vez exige o teste fechado de 12
  testadores/14 dias. **Não existe atalho nenhum pra pular essa trava de
  conta nova** — nem Aberto nem Produção funcionam sem passar pelo Teste
  Fechado primeiro. `track: internal` (Teste Interno) continua sendo o
  único caminho viável pro CI publicar automaticamente enquanto isso não
  for cumprido — a tentativa de mudar pra `track: open` nunca chegou a
  rodar de verdade (o CI já tinha achado a faixa inexistente antes,
  então o "ainda não confirmado se teve sucesso" abaixo nunca vai ser
  confirmado, porque a premissa era falsa). **Próximo passo real**:
  publicar uma versão na faixa de Teste Fechado, convidar de verdade 12+
  testadores que aceitem entrar (não basta cadastrar e-mail, precisa
  aceitar o convite), e esperar 14 dias corridos com o teste rodando —
  só depois disso Produção (e provavelmente Aberto junto) destranca.
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
2. **iPhone** — **link público já funciona de verdade** desde
   2026-08-23: o build 124 (submetido via branch `testflight` depois do
   build 107 sair da fila de revisão — ver "Submissão pro Beta App
   Review" abaixo) foi **aprovado pela Apple em 2026-08-23**, aprovação
   saiu rápido (menos de 2 dias). **Build 134** (Google Sign-In nativo no
   iOS + push de "nova versão" independente do TestFlight + fix do pace
   ao vivo, tudo desta mesma leva de sessão) foi submetido pela mesma
   branch `testflight` em 2026-08-24 e **aprovado pela Apple ainda no
   mesmo dia** — aprovação saiu rápido de novo. O link
   (`https://testflight.apple.com/join/RMqtChWj`) agora deixa qualquer
   pessoa entrar de verdade no teste externo — dá pra trocar o badge "Em
   teste fechado" da landing e colocar o link na bio do Instagram.
   Upload automático pro TestFlight a cada push continua normal; builds
   novos não precisam de nova revisão pra continuar valendo pra esse
   mesmo grupo (só builds novos re-submetidos exigem revisão de novo, ver
   detalhe abaixo). Promoção pra produção (App Store completa) continua
   sem prazo definido.

## OAuth / Login social

- **Google**: funcionando no Android e na web via Appwrite (Google Cloud
  Console → OAuth client novo depois que o projeto GCP anterior foi
  excluído e recriado). **No iOS nativo, reportado quebrado em 2026-08-24**
  (confirmado com print do Appwrite Console: a conta é criada de verdade,
  mas a tela nunca volta pro app — testado em dois iPhones diferentes,
  incluindo o de um amigo do dono do projeto). Mesma causa-raiz do bug do
  Apple abaixo (o redirect por navegador do sistema não completa a volta
  pro app no iOS). **Corrigido no código** nesta mesma data via
  `nativeGoogleSignIn` (`src/lib/auth.ts`, usando
  `@capgo/capacitor-social-login`/`GIDSignIn`) — ver o README ("Google
  Sign-In no iOS") para o desenho completo. Client ID criado pelo dono do
  projeto e configurado nos dois lugares (`NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`
  no GitHub Actions, `GOOGLE_IOS_CLIENT_ID` na Function `client-actions`) —
  confirmado via API do Appwrite que a variável da Function está presente.
  **Bug real na primeira tentativa em produção (build 134, 2026-08-24)**:
  em vez de logar, o app inteiro **crashava** ao tocar "Entrar com Google" —
  confirmado por crash log de verdade baixado do TestFlight (App Store
  Connect → TestFlight → Crashes/Feedback): `EXC_CRASH (SIGABRT)`,
  `NSException` não capturada dentro de `-[GIDSignIn signInWithOptions:]`,
  antes de qualquer UI aparecer. Causa: faltava um `CFBundleURLTypes` com o
  client ID invertido no `Info.plist` — exigência do próprio SDK do Google
  (`GIDSignIn`), não do plugin Capacitor; passou despercebido porque a
  documentação do plugin só menciona esse passo pro provedor Facebook, não
  pro Google. **Corrigido** via substituição de build setting do Xcode
  (`$(GOOGLE_REVERSED_CLIENT_ID)`, calculado em `ios-build.yml` a partir do
  client ID já configurado — nunca precisou colar o valor real no repo) —
  ver README pro detalhe técnico. **Build 136** (com esse fix) submetido
  pra Beta App Review em 2026-08-24 — na primeira tentativa de submissão
  a Apple ainda não tinha processado esse build (`INVALID_QC_STATE` ao
  tentar submeter o 134 de novo, que já tinha sido revisado — falhou de
  forma segura, sem re-enviar o build quebrado), retentado minutos depois
  (`rerun_failed_jobs`, sem rebuildar) já pegando o 136 certo.
  **Testado no build 136 pelo dono do projeto e por um amigo: o crash
  sumiu, mas os dois logins nativos (Apple e Google) passaram a falhar do
  mesmo jeito, um passo adiante** — erro da própria Appwrite no
  `account.createSession` que fecha os dois fluxos: `"Invalid Scheme...
  capacitor://localhost... change it to appwrite-callback-<PROJECT_ID>"`.
  Causa: iOS roda o WebView do Capacitor sob o esquema `capacitor:` por
  padrão (não pode virar `http`/`https`, restrição do próprio
  Capacitor/WKWebView), e a Appwrite rejeita esse esquema pra criar
  sessão — Android nunca teve esse problema (já roda em `https://
  localhost`, aceito). **Corrigido** em `capacitor.config.ts`
  (`server.iosScheme` trocado pro mesmo literal já usado no `Info.plist`,
  `appwrite-callback-<PROJECT_ID>` — o esquema que a própria mensagem de
  erro da Appwrite aponta como suportado) — ver README pro detalhe e pro
  custo aceito conscientemente (troca de esquema do WebView invalida
  histórico de corrida já salvo localmente em builds anteriores; aceitável
  agora com poucas contas em teste fechado). **Ainda não submetido/testado
  em build novo** — esse fix ainda não chegou num build real no
  TestFlight.
- **Web (Sala de Treino/`/treinador` no navegador desktop): login falha com
  "guests" mesmo depois do OAuth completar de verdade, achado em 2026-08-25**.
  Relato real do dono do projeto: clicou "Entrar", completou o consentimento
  do Google (aceitou acesso ao Gmail de verdade), voltou pro navegador na
  tela do treinador e continuava pedindo login. Confirmado via DevTools:
  toda chamada `GET account` depois do redirect volta
  `401 general_unauthorized_scope`, `"User (role: guests) missing scopes
  ([\"account\"])"` — ou seja, o Appwrite nunca viu o Google recusar nada, o
  problema é depois: o app não reconhece a sessão que o próprio Appwrite
  acabou de criar.
  **Causa raiz**: `NEXT_PUBLIC_APPWRITE_ENDPOINT` (`.env.local`) é
  `https://nyc.cloud.appwrite.io/v1` — domínio diferente de
  `xanthus.app.br`. O cookie de sessão do `createOAuth2Session` fica
  hospedado em `nyc.cloud.appwrite.io`; quando o app (rodando em
  `xanthus.app.br`) chama `account.get()` depois do redirect, isso é uma
  request cross-site pro domínio do Appwrite — navegadores com bloqueio de
  cookie de terceiros (padrão crescente em Chrome/Firefox/Safari, ou
  extensão de privacidade) descartam esse cookie, então toda chamada
  seguinte lê como visitante. É puramente sobre a chamada `account.get()`
  do lado do app, não sobre CORS (a resposta 401 chega normal, só que como
  "guests") nem sobre o OAuth em si (que termina certinho do lado do
  Google/Appwrite). **Só afeta o navegador desktop** — o app nativo
  (Android/iOS) nunca teve esse sintoma porque usa o fluxo de *token*
  (`oauth2TokenUrl`/`Browser.open`, ver comentário em `auth.ts`), que nunca
  depende de cookie cross-site pra começo de conversa.
  **Fix tentado e revertido (2026-08-25)**: domínio customizado da API no Appwrite
  Console (Project Settings → Domains), subdomínio `cloud.xanthus.app.br` —
  não por CNAME, o Appwrite pediu delegação por **NS** desse subdomínio
  específico (`ns1.appwrite.zone`/`ns2.appwrite.zone`, dois registros NS
  criados na zona `xanthus.app.br` na Cloudflare, sem afetar o resto do
  domínio). **Verificado com sucesso no Appwrite Console pelo dono do projeto** —
  status "Verified" tanto no Appwrite Console quanto na própria Cloudflare
  (os dois registros NS na zona `xanthus.app.br` conferidos nas duas
  telas; a delegação é só desse subdomínio, dentro da zona já delegada do
  Registro.br pra Cloudflare — não mexe no domínio raiz nem precisa de
  nada no Registro.br). Endpoint chegou a ir pro ar de verdade (secret do
  GitHub Actions atualizado + deploy manual via `workflow_dispatch` do
  `android-build.yml`, run #170, 2026-08-25) — mas o certificado SSL desse
  subdomínio nunca saiu do lado do Appwrite: 3+ horas depois do DNS
  verificado, o navegador ainda recebia erro de certificado (via Fastly,
  a CDN que o Appwrite usa por trás — "host does not match any SAN on TLS
  certificate", ou seja, o roteamento chega até o Appwrite mas o
  certificado desse domínio específico nunca carregou do lado deles).
  Sem opção de forçar/reemitir certificado na aba Settings do domínio no
  Console. **Revertido em 2026-08-25** — `.env.local` voltou pra
  `https://nyc.cloud.appwrite.io/v1`; o secret do GitHub Actions também
  precisa voltar (mesma trilha manual) e rodar outro deploy pra valer em
  produção. Volta o problema original de "guests" em navegador com
  bloqueio de cookie de terceiro (achado acima), mas sem quebrar o login
  por completo com erro de certificado. **`cloud.xanthus.app.br` fica
  registrado no Appwrite Console pra retomar depois** — se o certificado
  eventualmente sair sozinho (ou o suporte do Appwrite destravar
  manualmente), é só trocar o endpoint de volta, sem refazer DNS nenhum.
  **Pesquisa adicional (2026-08-25)**: confirmado no fórum oficial do
  Appwrite que certificado nunca ser emitido é um problema **recorrente**
  da plataforma deles (vários threads idênticos, um citando literalmente
  "reached the max number of certificates" do lado da Fastly) — não é
  peculiaridade desse domínio. Também confirmado que a CA usada
  (`certainly.com`, no CAA gerado automaticamente) é a própria CA da
  Fastly — ou seja, o erro que aparecia (SAN mismatch via Fastly) é 100%
  interno à dupla Appwrite+Fastly, sem nada a mais pra ajustar do lado do
  DNS. Apagar e recriar o domínio no Console (sugestão recorrente nos
  threads) não resolveu nesse caso — tentado, ainda travado.
  **Fix definitivo aplicado (2026-08-25), sem depender do Appwrite**:
  `worker/index.js`, um Worker de verdade na frente do Cloudflare Workers
  Assets (antes o deploy era só arquivos estáticos, sem nenhum código) —
  qualquer chamada sob `/v1/*` (exatamente o que o SDK do Appwrite já
  chama) é repassada pelo próprio Worker pro endpoint real do Appwrite
  (`nyc.cloud.appwrite.io`), never o navegador falando direto com ele.
  Do ponto de vista do navegador isso é same-origin (só fala com
  `xanthus.app.br`) — o cookie de sessão nunca é cross-site, resolve o
  bug de "guests" sem esperar certificado nenhum de terceiro. Detalhes:
  - `src/lib/appwrite.ts`: endpoint agora é escolhido por plataforma —
    `NEXT_PUBLIC_APPWRITE_ENDPOINT` (endpoint real do Appwrite) continua
    valendo sem mudança nenhuma pro app nativo (nunca teve esse bug,
    WebView não é sujeito a bloqueio de cookie de terceiro do jeito que
    Safari/Chrome desktop são); `NEXT_PUBLIC_APPWRITE_WEB_ENDPOINT`
    (`https://xanthus.app.br/v1`, novo) só é usado quando
    `isNativePlatform()` é falso.
  - `worker/index.js`: proxy simples — clona o request pra
    `https://nyc.cloud.appwrite.io` mantendo path/método/headers/corpo
    (mesmo idioma que a própria Cloudflare documenta, inclusive cobre
    upgrade de WebSocket automaticamente — usado pelo Appwrite Realtime,
    corrida ao vivo); remove qualquer `Domain=` explícito dos
    `Set-Cookie` de volta, forçando cookie host-only pro
    `xanthus.app.br` (sem isso, um `Domain=` apontando pro host real do
    Appwrite faria o navegador descartar o cookie por mismatch).
  - `wrangler.jsonc`: ganhou `"main": "worker/index.js"` +
    `"assets": {"binding": "ASSETS", ...}` — o script roda primeiro,
    delega pros assets estáticos (`env.ASSETS.fetch`) sempre que a rota
    não é `/v1/*`.
  - Testado localmente via `wrangler dev`: assets estáticos (`/`,
    `/perfil/`) continuam servindo normal, `/v1/health` e `/v1/account`
    retornam resposta real do Appwrite (não erro de rede) — confirma que
    o proxy está de fato alcançando o backend real. **Não testado**: o
    fluxo de OAuth completo de verdade num navegador (precisa de deploy
    real + login real do Google, não dá pra simular headless aqui) — o
    dono do projeto precisa confirmar isso depois do deploy.
  **Deploy do proxy confirmado com sucesso (run #172, 2026-08-25) — mas o
  bug de "guests" continuou** (mesmo erro `general_unauthorized_scope`),
  reportado pelo dono do projeto testando de verdade em
  `xanthus.app.br/treinador`. **Causa raiz real, achada só depois do teste
  de verdade**: o proxy nunca chega a proteger a etapa que mais importa. O
  fluxo antigo (`account.createOAuth2Session`, cookie-based) faz o
  navegador navegar de verdade por 3 saltos: `xanthus.app.br` (proxied) →
  Google → **de volta direto pro domínio real do Appwrite**
  (`nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/...`, a URL
  de callback que o próprio Appwrite registrou no client OAuth do Google
  Console, fixa, **nunca reescrita pelo nosso proxy** porque esse salto é
  o navegador indo direto pro Google/Appwrite, não uma chamada que o
  código deste app faz). É **nesse** salto que o cookie de sessão é
  setado — e ele é setado pro domínio real do Appwrite, não pro
  `xanthus.app.br`, porque o navegador nunca passou pelo nosso Worker
  nessa requisição específica. O proxy só ajuda chamadas que o próprio
  código do app faz via `fetch`/XHR (como `account.get()` depois) — não
  ajuda em nada uma navegação de página inteira disparada pelo próprio
  Google/Appwrite de volta pro domínio deles.
  **Fix de verdade (2026-08-25)**: trocar o fluxo web inteiro de
  cookie-based (`createOAuth2Session`) pra **token-based**
  (`/account/tokens/oauth2/*`) — o mesmo mecanismo que o nativo já usa há
  tempos (ver `nativeGoogleSignIn`/`nativeAppleSignIn` e
  `oauth-callback-listener.tsx`), só que adaptado pra navegador em vez de
  deep link:
  - `src/lib/auth.ts` (`startOAuthSignIn`): o branch web agora chama
    `oauth2TokenUrl(provider, success, failure)` (a mesma função já usada
    pelo nativo) em vez de `account.createOAuth2Session` — `success`
    aponta pra uma página nova, `/oauth-callback?returnTo=...`, em vez de
    `returnTo` direto.
  - `src/app/oauth-callback/page.tsx` (novo): a versão web do que
    `oauth-callback-listener.tsx` já faz no `appUrlOpen` nativo — lê
    `userId`/`secret` da própria query string (que o Appwrite anexa na
    URL de `success` depois do login, sem cookie nenhum nessa etapa) e
    chama `account.createSession({userId, secret})` **por conta própria**.
    A diferença crucial: essa chamada é um `fetch`/XHR que o código deste
    app de fato faz — vai pro `ENDPOINT` configurado
    (`NEXT_PUBLIC_APPWRITE_WEB_ENDPOINT`, o proxy), então o `Set-Cookie`
    de resposta **passa pelo `worker/index.js`** de verdade dessa vez, cai
    same-origin em `xanthus.app.br`, exatamente como o proxy foi desenhado
    pra fazer. O restante do fluxo (Appwrite ↔ Google, incluindo o salto
    de volta pro domínio real do Appwrite) continua igual — só que agora
    não seta cookie nenhum ali, só devolve `userId`/`secret` na URL, então
    não importa que esse salto não passe pelo proxy.
  - Verificado: `tsc --noEmit`, `npm run lint`, `npm run build` (rota
    `/oauth-callback` aparece na lista de rotas geradas) — todos limpos.
    **Ainda não testado em produção** (precisa de deploy + login real de
    novo) — mesma pendência de sempre, só o dono do projeto testando de
    verdade fecha isso.
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
- **Corrida compartilhada com amigos (task #62, implementada em
  2026-08-22)**: mesma infra de `live_runs`/`liveRuns.ts` do treinador
  acima, só trocando a fonte de `viewerIds` — em `/run`, o atleta agora
  também pode escolher um ou mais amigos aceitos (multi-seleção, diferente
  do treinador que é sempre um só) pra ver a corrida ao vivo, ao lado do
  coach e do longão. Do lado de quem assiste: `/amigos` mostra um selo
  verde "Ao vivo" (poll de 15s enquanto a aba "Amigos" está aberta) em
  qualquer amigo correndo agora que te incluiu, e o selo linka pra
  `/amigos/ao-vivo?id=`, uma tela de mapa dedicada (mesmo padrão do card
  ao vivo do treinador, só sem a lista de corridas passadas — isso
  continua exclusivo de `runsSync.ts`/coach, amigo só vê ao vivo mesmo).
  Nenhuma tabela nova, nenhuma Function nova — é só reuso client-side da
  mesma permissão por linha que já existia.
- **Modo treino alternável (task #99, implementada em 2026-08-22)**: pra
  quem é atleta E treina outras pessoas, um toggle "Atleta"/"Treinador" em
  `/perfil` (`preferences.ts`'s `appMode`) troca o que abre primeiro —
  a tab 0 da navegação vira "Treinador" (`/treinador`) em vez de "Corrida"
  (`/run`), e o mesmo vale pro redirect de abertura do app nativo
  (`standalone-gate.tsx`). Só aparece pra quem realmente tem pelo menos um
  aluno com vínculo aceito; pra todo mundo (a grande maioria) o card nem
  renderiza. Escopo deliberadamente pequeno: não virou uma 6ª aba nem um
  conjunto paralelo de abas — o lado treinador do produto ainda é só
  `/treinador` e `/treinador/aluno`, duas telas, não uma seção inteira.
- **Longão**: corrida em grupo com código de convite, vários corredores
  no mesmo mapa ao vivo.
- **Amigos**: convite por @handle.
- **Perfil**: unidade km/mi, intervalo de aviso por voz, estatísticas na
  tela de corrida, tênis com quilometragem por tênis, **tema
  claro/escuro/sistema** (adicionado 2026-08-17).
- **Lugares pra correr**: parques avaliados por segurança/iluminação/etc.
- Política de privacidade, exclusão de conta (ação `delete-account` da
  Function `client-actions`), PWA instalável.

O que ainda é maquete (não persiste de verdade): meta de prova em
`/perfil` — está marcado como tal no próprio código, não finge ser real.

## Funcionalidades planejadas, ainda não implementadas

- **Cronograma de treino com IA pro atleta comum (autoatendimento)** —
  pedido em 2026-08-25: o atleta preenche um formulário prévio (perfil de
  corredor — experiência, objetivo, dias disponíveis, lesões/dores
  recentes, o que hoje só existe manualmente espalhado por `/perfil` e
  `runnerProfile.ts`) e recebe um cronograma de treino sugerido pela IA,
  grounded nos mesmos estudos de `src/lib/evidence/facts.ts`. Não é uma
  feature nova do zero — é essencialmente **a Fase B do modo treinador
  (`suggest-plan-override`, ver "Modo treinador com IA" acima) reaberta
  pro atleta comum acionar sozinho**, sem precisar de um treinador
  cadastrado: mesmo Gemini Flash grounded no recorte de `facts.ts`, mesmo
  teto de segurança do motor determinístico (`volumeProgression.ts`)
  travando a sugestão antes dela virar plano de verdade. **Decisões de
  produto confirmadas nesta sessão**: (1) manter a mesma honestidade já
  documentada no `SOCIAL-CONTEXT.md` — nunca vender como "plano 100%
  gerado por IA" nem esconder que existe um motor determinístico travando
  os limites por trás, mesmo raciocínio que já vale pro Runna sendo citado
  como referência de ambição, não de cópia; (2) fluxo de Q&A — questionário
  prévio antes da sugestão, não um único prompt de texto livre; (3) tela de
  disclaimer com aceite explícito obrigatório (a pessoa precisa confirmar
  que está ciente antes do plano sugerido virar válido) — mesmo padrão de
  consentimento explícito já usado pra dado de saúde
  (`healthDataConsent`)/ranking de lugares (`leaderboardOptIn`), nunca um
  toggle "ligado por padrão". Ainda não escopado em detalhe (schema do
  formulário, onde essa sugestão fica salva pro atleta sem treinador —
  hoje `plan_overrides` é sempre `coachId`+`studentId`, aqui não existe
  treinador nenhum na relação) nem implementado.
- **Calendário de corridas de rua por cidade** — pedido em 2026-08-25: a
  pessoa poder ver quais maratonas/corridas de rua vão acontecer na cidade
  dela dentro do app, em vez de precisar procurar espalhado pela internet.
  **Não existe fonte estruturada (RSS/API) pra isso no Brasil** — diferente
  do World Athletics RSS já usado no pilar de conteúdo (`SOCIAL-CONTEXT.md`),
  calendário de corrida de rua local não tem feed padronizado; os sites que
  listam isso (Melhor Corrida, Ticket Sports, prefeituras) precisariam de
  scraping por site, frágil (quebra a cada mudança de layout) e com risco
  de ToS. **Decisão do dono do projeto (2026-08-25): seguir mesmo assim
  pela via de scraping** (rodando com frequência semanal), em vez de
  esperar uma API — mas ainda **falta a pesquisa de quais sites/fontes são
  viáveis de raspar antes de escopar a implementação**; nada verificado
  ainda sobre confiabilidade de fonte nenhuma.
- **Sincronização opcional do plano/perfil entre aparelhos (pra ver no
  desktop o que foi montado no celular, com gráfico/calendário melhor)** —
  pedido em 2026-08-25, avaliado em conjunto nesta sessão. **O bloqueio
  real não é visualização, é dado**: `RunnerProfile` (meta, tempo de prova,
  dias de treino) e o histórico de corrida vivem só em `localStorage`/
  IndexedDB do aparelho que gravou, sem sync nenhum hoje — é a mesma causa
  raiz já documentada na limitação de arquitetura do modo treinador acima
  ("o treinador não consegue ver o plano que o motor já calculou pro
  aluno"), só que agora é o próprio atleta batendo nisso ao abrir
  `xanthus.app.br` num notebook. **Decisão de produto confirmada nesta
  sessão**: login continua nunca sincronizando isso por padrão — mesmo
  quem já loga hoje só pra usar amigos/treinador não deve ver o plano
  virar sincronizado de surpresa. Precisa de um **consentimento explícito
  separado**, próprio dessa feature (mesmo padrão de `healthDataConsent`/
  `leaderboardOptIn`), distinto de simplesmente "estar logado". Ônus real
  levantado nesta sessão, pra pesar antes de escopar: (1) hoje o app só
  sabe empurrar dado de um jeito (compartilhar uma corrida específica),
  nunca sincronizar um estado mutável entre aparelhos — sincronizar
  `RunnerProfile` de verdade abre problema novo de conflito (editar a meta
  no celular e no notebook ao mesmo tempo, ou offline); (2) pra virar
  gráfico de progressão de verdade (não só a meta atual), precisaria
  também sincronizar um resumo de cada corrida (pace/distância/data, não o
  traçado GPS) a cada corrida gravada, não só ocasionalmente; (3) mais uma
  tabela Appwrite, mais uma seção de política de privacidade. Vale desenhar
  junto com a limitação do treinador (mesma causa raiz) em vez de separado.
  Ainda não escopado em detalhe nem implementado.
- **Backlog de ideias soltas (sessão 2026-08-23, nenhuma escopada em detalhe
  ainda — só registrando pra não perder)**:
  - **Editor do card de compartilhar com elementos arrastáveis** (pedido
    em 2026-08-24, confirmado via pergunta direta ao dono do projeto qual
    das telas ele queria dizer): em `/compartilhar`, poder arrastar a
    ilustração da rota e os números grandes (distância/tempo/pace)
    livremente dentro do card antes de exportar/postar — tipo editor de
    story do Instagram/Stories, em vez do layout fixo atual. Confirmado
    por leitura de código que não existe nenhum drag-and-drop hoje em
    `src/app/(app)/compartilhar/page.tsx`/`src/lib/shareCard/` — layout é
    inteiramente fixo. Ainda não escopado (precisa decidir: arrastar livre
    por pixel, ou só reordenar/trocar posições entre slots fixos; se a
    posição persiste por corrida ou é só uma preferência de template) nem
    implementado.
  - **Repetir corrida**: no histórico, um botão "repetir corrida" que
    reabre `/run` já configurado com a mesma meta (distância/tempo/ritmo) —
    e possivelmente o mesmo trajeto, se fizer sentido — de uma corrida
    passada. Escopo pequeno, não iniciado.
  - **Nomear/filtrar o histórico pelo lugar onde a corrida aconteceu**:
    pedido do dono do projeto pra poder filtrar o histórico por "lugares
    que já corri" — mas a infra que já existe (`placeMatch.ts`,
    tarefas #74-78) só casa uma corrida contra os poucos lugares com
    `circuits` (rota rastreada) do catálogo de `places.ts`, tipicamente
    parques, deixando de fora qualquer corrida de rua que passe por vários
    bairros. **Decisão de produto (2026-08-24)**: quando não bate com o
    catálogo, o **atleta digita o nome manualmente** — descartada a opção
    de geocodificação reversa automática (evita mais uma chamada de API
    paga/com cota por corrida). Ainda não implementado — falta o campo de
    texto livre na tela de resumo/detalhe e usar esse valor como filtro no
    histórico junto com os lugares já reconhecidos pelo catálogo.
  - **Sugestão de correr com amigo por proximidade**: se dois amigos
    estão com o app aberto e fisicamente perto um do outro, avisar
    ("fulano tá aí perto, bora correr junto?") — dentro do app tá OK, não
    precisa ser push nativo. Depende de compartilhar localização em tempo
    real de quem só abriu o app (não de quem já está numa corrida ativa,
    que já existe via `live_runs`). **Decisões de produto (2026-08-24)**:
    opt-in explícito, desligado por padrão (mesmo padrão do ranking de
    lugares — `leaderboardOptIn`, ligado em `/perfil`); visível **só pra
    amigos aceitos**, nunca pra qualquer usuário do app nas redondezas.
    Ainda não implementado — falta desenhar como/quando esse
    compartilhamento de localização "só abri o app" liga e desliga (não é
    o mesmo ciclo de vida de uma corrida ativa).
  - **"Trajeto da comunidade" (rotas populares agregadas)**: em vez de só
    o catálogo curado à mão (`places.ts`), minerar as rotas GPS já salvas
    na plataforma pra achar trechos que muita gente corre em comum e virar
    isso um "trajeto sugerido pela comunidade" — o raciocínio do pedido: a
    equipe não conhece todo lugar bom pra correr numa cidade, mas quem já
    corre lá sabe. Tecnicamente isso é clustering/agregação geoespacial de
    trajetórias de várias contas — bem mais pesado que o matching atual
    (que só compara contra um catálogo fixo, nunca entre usuários).
    **Decisões de produto (2026-08-24)**: só entram trajetórias de quem já
    ligou o opt-in do ranking de lugares (`leaderboardOptIn`) — nenhum
    opt-in novo pra construir, e ninguém tem sua rota agregada sem ter
    decidido antes que sua atividade pode aparecer pra outros; threshold
    inicial **baixo (10-20 pessoas)**, não os "uns 100" soltos no pedido
    original — com a base de usuários atual, esperar 100 podia nunca
    disparar em lugar nenhum, dá pra subir depois se aparecer barulho/falso
    positivo. Ainda não implementado.
  - ~~Ciclofaixa como "lugar pra correr" de fato~~ — **descartado** pelo
    dono do projeto em 2026-08-23, não vale reabrir sem pedido explícito
    de novo.
  - **"Coach ao vivo" — treinador acompanhando e falando com o aluno durante
    a corrida em tempo real** (pedido em 2026-08-23, nada escopado em
    detalhe, ideia rica com vários pedaços):
    - **Acesso a dado de saúde ao vivo pro treinador** (FC/zona de esforço,
      possivelmente outros dados do smartwatch) durante uma corrida
      compartilhada — **consentimento próprio, começando desligado por
      padrão, o aluno ativa manualmente quando quiser** (explicitamente
      pedido pelo dono do projeto) — **separado** do consentimento geral
      de dados de saúde já existente (`healthDataConsent`,
      `HEALTH_DATA_ENABLED`, ver seção de smartwatch acima): aquele é
      "o app lê meu HealthKit/Health Connect", este seria "meu treinador
      específico vê isso ao vivo enquanto eu corro" — duas permissões
      concentricamente diferentes, não a mesma flag reaproveitada.
    - **Treinador manda mensagem → vira voz durante a corrida do aluno**,
      numa voz claramente diferente do aviso padrão do app, anunciada
      como tal ("Seu treinador está pedindo pra reduzir o ritmo", "Seu
      treinador quer que você acelere nessa reta final", "Seu treinador
      está pedindo pra você parar"). **Decisão de produto (2026-08-24)**:
      **frases pré-gravadas que o treinador só escolhe, não digita** —
      descartado TTS de texto livre (custo/latência/dependência de API
      externa nova). Reaproveita o banco de voz atual
      (`scripts/generate-voice-bank.ts`, tarefas #82-85), só precisa
      gravar as frases fixas do treinador como clipes novos no mesmo
      pipeline — sem incompatibilidade técnica pra resolver. Ainda não
      implementado.
    - **Previsão de chegada/tempo final ao vivo**, visível pro treinador
      (o app já expõe métricas ao vivo pro próprio atleta — conferir se
      dá pra reaproveitar o mesmo cálculo, não construir um novo).
    - **Analogia usada pelo dono do projeto**: "treinador de time de
      quadra orientando posicionamento do jogador ao vivo, só que pra
      corrida" — acompanhado do notebook ou celular.
    - **Problema de escala reconhecido pelo próprio dono do projeto**: fácil
      com 1 aluno; com vários simultâneos, uma visão única fica poluída de
      informação. Preferência dele: visão geral simples (quem tá correndo
      agora) + entrar no perfil de UM aluno por vez pra ver o live
      detalhado e mandar mensagem — não um painel único mostrando tudo de
      todo mundo ao mesmo tempo. **Isso é literalmente o mesmo problema já
      escopado na Fase C do "Modo treinador com IA"** (painel web "Sala de
      Treino", ver seção própria acima) — vale desenhar as duas coisas
      juntas, não em paralelo sem se falar.
  - **Lugares pra correr em outras capitais** (pedido nesta mesma sessão,
    confirmado "vários lugares por capital", com um critério de "pelo
    menos ~3km" de percurso que ficou cortado no áudio original — não
    confirmado se é raio ou comprimento de circuito): **atualização
    2026-08-24 — essa expansão de dados já aconteceu**, commit `142180d`
    ("expandir pras 27 capitais brasileiras") adicionou 54 lugares novos
    em 26 capitais além de São Paulo. A nota acima ficou desatualizada
    (dizia "ainda não iniciado") — corrigida agora. **O que falta de
    verdade**: ilustração. Só 10 dos 68 lugares no catálogo têm
    `coverImage` (a imagem cel-shaded no topo do card/detalhe) e todos os
    10 são de São Paulo — os 54 lugares novos (e mais 4 de SP:
    `parque-do-carmo`, `parque-trianon`, `parque-burle-marx`,
    `parque-da-juventude`) não têm nenhuma, porque nenhum teve ilustração
    comissionada ainda (deliberado desde o commit original, não é bug —
    `coverImage` já é opcional por design e a UI degrada bem sem ela).
    Plano de execução: gerar as 58 ilustrações via Recraft na mesma
    direção de arte já estabelecida (`SOCIAL-CONTEXT.md`), depois soltar
    cada `.webp` em `public/lugares/` e adicionar a linha `coverImage` em
    `src/lib/places.ts` — trabalho incremental, uma imagem por vez, não
    precisa esperar as 58 de uma vez. Em aberto: priorizar por capital ou
    tentar tudo de uma vez, e quem gera (o dono do projeto no Recraft
    Studio, como as 10 já feitas, ou via API do Recraft se
    `RECRAFT_API_KEY` for exposta a uma sessão).

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
    - **Histórico da flag** (pra não repetir o vaivém): ligada em
      2026-08-19, desligada de novo em 2026-08-17/21 numa auditoria LGPD
      (lia FC/calorias/passos automaticamente com só o aviso de permissão
      do sistema, sem consentimento de produto de verdade), lacuna fechada
      em 2026-08-22 (`preferences.ts` ganhou `healthDataConsent`,
      `/perfil/relogio` tem toggle real, `/privacidade` declara as duas
      fontes, `fetchRunHealthData` checa o consentimento por conta
      própria) — e **religada de vez em 2026-08-22**, branch
      `claude/strava-competitor-feedback-cyvop8`, ainda não em `main`.
    - Pré-requisitos já fechados: entitlement (`App.entitlements`) e
      capability no `project.pbxproj` commitados; capability HealthKit
      habilitada no App ID pelo dono do projeto em developer.apple.com
      (2026-08-19) — ainda não confirmado se o build assinado do
      TestFlight reflete isso sem erro, checar os runs em
      github.com/arimayuji/xanthus/actions antes de assumir que está tudo
      verde; fallback do Android quando o Health Connect não está
      instalado confirmado por leitura de código (`HealthConnectClient.
      getSdkStatus`, nunca lança exceção, `isHealthAvailable()` com seu
      próprio `try/catch` por cima) — não em dispositivo real.
    - **Único bloqueio real que resta**: testar em aparelho real com um
      relógio de verdade sincronizado. Nada disso foi validado em
      dispositivo, só `tsc`/`eslint`/`next build` (o plugin é nativo puro,
      não roda no sandbox nem no navegador) — isso não dá pra fazer nesse
      ambiente remoto, precisa ser o dono do projeto testando no celular
      dele com um relógio pareado.

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

## Persona da mascote (esboço, 2026-08-24 — ainda não decidido em definitivo)

Ideia levantada nesta sessão pra dar personalidade de conteúdo ao cavalo
que já existe como brand mark (`src/app/horse-mark.tsx`) — hoje só usado
estático/geométrico (logo, emblemas com tint cromado por tier), nunca como
personagem em conteúdo. Nada disso foi implementado ainda — é um rascunho
de branding, registrado aqui pra não se perder, não uma decisão de produto
fechada.

- **O gancho central**: na mitologia grega, Xanthus é um dos dois cavalos
  imortais de Aquiles (presente de Poseidon), a quem Hera deu o dom da
  fala — no momento mais dramático da Ilíada é Xanthus quem avisa Aquiles,
  chorando, que ele vai morrer em batalha, e mesmo assim corre ao lado
  dele até o fim. Um cavalo que **fala verdade difícil e corre junto mesmo
  sabendo o preço** — bate direto com a ideia-guia já usada pro
  posicionamento do produto ("o app de corrida que não te trai depois que
  você confiou nele"). O nome do produto já carrega essa referência; hoje
  ela não é contada em lugar nenhum do app/marketing.
- **Traço de personalidade proposto**: fala verdade mesmo quando dói (feedback
  real de pace/treino, não hype vazio de "você é incrível" toda hora);
  corre do lado, nunca de cima pra baixo como um "coach"; bom humor
  autodepreciativo ("eu já corri isso mil vezes e ainda dói") em vez de
  mascote sempre-animado-demais; apego vem de confiabilidade/recorrência,
  não de ser "fofo" — mesmo raciocínio de produto do app (GPS confiável >
  GPS bonito).
- **Visual**: reaproveitar a silhueta rampante (empinada, heráldica) já
  desenhada em `horse-mark.tsx` como âncora de identidade pra qualquer
  geração de imagem/vídeo (é o que ferramentas de consistência de
  personagem tipo Nano Banana Pro precisam) — nunca redesenhar o cavalo do
  zero, só recolorir/reposar a partir dela. Cores continuam vindo do
  sistema de tier já existente (cobre→prisma dos emblemas), não uma
  paleta nova de mascote. Valeria comissionar no Recraft um sheet de poses
  novas (descanso, galope, ofegante/cansado, "ouvindo") — hoje só existe a
  pose rampante e o corpo completo de perfil.
- **Onde apareceria**: reagindo a marcos reais do usuário (PR, emblema
  novo — a mesma cena de "unboxing" que já existe no app, só filmada de
  fora); um segmento recorrente curto tipo "o Xanthus resenha seu treino
  da semana" (recorrência gera apego, não uma peça isolada); nunca em
  conteúdo de conversão dura (CTA de baixar) — aí ele apresenta o app, não
  o app empresta a cara dele pra vender. Encaixa na linha de produção real
  (não avatar sintético/fotorreal) já mapeada em "Fábrica de Conteúdo",
  ver artifact da sessão.

## Painel interno de conteúdo — `/interno/conteudo` (2026-08-24)

Pedido do dono do projeto: não quer ficar gerando/rastreando conteúdo
pelo chat — quer um board visual, **no próprio domínio `xanthus.app.br`**,
acessível só por ele e um time futuro (não é feature pública do app).
Especificação completa desenhada via plan mode antes de codar (pesquisa
de código real via agente Explore) — spec guardada em
`/root/.claude/plans/pure-knitting-cosmos.md` se precisar do histórico
completo do porquê de cada decisão.

**Implementado nesta sessão, branch `claude/strava-competitor-feedback-cyvop8`,
ainda não deployado em produção**:

- Rota nova `src/app/(app)/interno/conteudo/page.tsx` — board de ideias de
  conteúdo por pilar (produto/autêntico/autoridade/marca/comunidade, os
  mesmos do `SOCIAL-CONTEXT.md`) e status (ideia → rascunho → agendado →
  publicado), com link opcional pro asset onde quer que ele exista
  (Artifact, Recraft Studio, vídeo já montado). **Deliberadamente só um
  rastreador, não um gerador** — a geração de imagem/vídeo em si continua
  100% fora do app, nas ferramentas externas do `SOCIAL-CONTEXT.md`.
  Fora da bottom nav de propósito (`app-shell.tsx` não foi tocado — a
  lista `TABS` ali só controla a nav, não é um registro de rotas; qualquer
  rota nova dentro de `(app)` já funciona por roteamento de arquivo).
- **Controle de acesso por lista fixa** (não é uma relação aceita entre
  duas contas, como treinador/amigos) — primeira vez nesse projeto que
  esse conceito existe. Duas metades, deliberadamente duplicadas (mesmo
  padrão já usado pro teto de segurança do motor de treino entre
  `volumeProgression.ts` e a Function `suggest-plan-override`):
  - `src/lib/internalTeam.ts` — `INTERNAL_TEAM_ACCOUNT_IDS`, array vazio
    por padrão, gate só de UI (cosmético — o app é build estático, sem
    servidor, então nenhum gate de cliente é a fronteira de segurança
    real).
  - `scripts/appwrite-setup.ts` — o mesmo array espelhado, usado pra
    montar as permissões da tabela `content_ideas`
    (`Permission.read/create/update/delete(Role.user(id))` por conta) —
    essa sim é a fronteira real. Primeira tabela do projeto com permissão
    de conta fixa em vez de `Role.any()`/`Role.users()`/Function
    privilegiada, porque aqui "quem pode" é uma decisão estática do dono
    do projeto, não uma relação negociada entre duas contas.
  - **Pendência real antes de funcionar**: `INTERNAL_TEAM_ACCOUNT_IDS`
    está vazio nos dois lugares — precisa do `$id` real da conta do dono
    do projeto (Appwrite Console → Auth → Users) preenchido nos dois
    arquivos, e `scripts/appwrite-setup.ts` rodado (ou re-rodado) depois
    disso pra tabela `content_ideas` existir com as permissões certas.
- `src/lib/contentIdeas.ts` — CRUD direto do SDK de browser (sem Function,
  já que a permissão é de conta fixa, não precisa de checagem
  privilegiada). Verificado: `tsc --noEmit`, `npm run lint`, `npm run
  build` (rota aparece na lista, sem entrar em nenhuma nav) — todos
  limpos.
- **Geração self-hosted (Wan2.2 via GPU alugada) ficou de fora de
  propósito** — decisão explícita do dono do projeto de separar isso como
  fase 2. Pesquisa feita (não implementada): `Wan-Video/Wan2.2` é o
  modelo aberto de verdade (confirmado no GitHub, Apache 2.0); o "Wan 2.7"
  do relatório original provavelmente só existe hospedado (fal.ai/Recraft
  Studio) — não achei repositório oficial. Custo estimado rodando o
  Wan2.2 em GPU por segundo (RunPod Serverless, verificado na página
  oficial): ~US$10-15/mês em 480p, provavelmente US$30-60/mês em 720p, no
  volume do relatório original (16 vídeos/mês) — mais barato que a rota
  paga (Wan 2.7 via fal.ai, ~US$72-108/mês), mas exige montar/manter um
  workflow ComfyUI containerizado e um fluxo assíncrono de job, trabalho
  de infra real que não está escopado ainda.

## Bug corrigido e confirmado: Health Connect declarava 47 permissões, não 9 (2026-08-24)

Achado direto pelo dono do projeto preenchendo o formulário de
declaração de permissões de Saúde do Play Console: a tela pedia
justificativa pra **47 permissões**, mas `REQUIRED_READ_TYPES`
(`src/lib/health.ts`) só lista 9 tipos que o app de fato lê (steps,
distance, totalCalories, heartRate, workouts, restingHeartRate,
heartRateVariability, vo2Max, sleep).

**Causa raiz**: `@capgo/capacitor-health` traz seu próprio
`AndroidManifest.xml`
(`node_modules/@capgo/capacitor-health/android/src/main/AndroidManifest.xml`)
declarando um superconjunto bem maior de permissões (todas as `WRITE_*`
mais 15 `READ_*` que o app nunca usa — calorias em atividade, peso,
ritmo respiratório, saturação de oxigênio, pressão arterial, glicemia,
temperatura corporal, altura, andares subidos, gordura corporal,
temperatura basal, taxa metabólica basal, mindfulness, hidratação,
nutrição). O merge de manifests do Android injeta esse superconjunto no
app final, **independente** do que o código do app realmente pede — a
declaração do Play Console reflete o manifest resultante, não
`REQUIRED_READ_TYPES`.

**Fix**: `android/app/src/main/AndroidManifest.xml` ganhou
`xmlns:tools="http://schemas.android.com/tools"` na raiz e 38
`<uses-permission ... tools:node="remove" />` (as 23 `WRITE_*` — o app é
só leitura por design — mais as 15 `READ_*` não usadas), removendo cada
uma explicitamente do manifest final via merge override.

**Confirmado em produção (2026-08-25)**: depois do build #163 (branch
`main`, commit `6ef211e`) ser processado no Play Console — faixa
Internal Testing, mesmo build que carregava esse fix — a declaração de
Saúde recalculou sozinha e passou a pedir justificativa só pras 9
permissões reais (`READ_STEPS`, `READ_DISTANCE`,
`READ_TOTAL_CALORIES_BURNED`, `READ_HEART_RATE`, `READ_EXERCISE`,
`READ_RESTING_HEART_RATE`, `READ_HEART_RATE_VARIABILITY`,
`READ_VO2_MAX`, `READ_SLEEP`) — bate exatamente com
`REQUIRED_READ_TYPES`. Fechado, sem pendência.

## Bug encontrado, fix aplicado, causa raiz ainda não confirmada: pedido de amizade falhando silenciosamente (2026-08-24/25)

Relato real do dono do projeto: um pedido de amizade entre duas contas
reais falhou com "tenta de novo", sem nenhuma informação de diagnóstico.
Verificado via Appwrite CLI (`tables-db get-table`/`list-columns`/
`list-indexes`) que a configuração das tabelas `friendships`
(`rowSecurity: true`, permissões corretas) e `profiles`
(`rowSecurity: true`, `read("any")`) está certa, tamanho de coluna
correto (`pairKey` = 73 = 36+1+36) e o índice único
(`unique_pair_key`) existe — **não é bug de configuração**.

`sendFriendRequest`/`respondToFriendRequest`/`removeFriendship`
(`src/lib/friendships.ts`) seguiam a mesma convenção do resto do backend
layer (engolir qualquer exceção e devolver `{ok:false}`/`false`, "já que
nada disso é necessário pra gravar uma corrida") — mas isso deixa um bug
de escrita real tão silencioso quanto um erro esperado. Adicionado
`console.error("[friendships] ...")` nas três funções de escrita
(mantido silencioso só o lookup de leitura em `getProfileByHandle`,
mesma convenção de "degradar graciosamente em leitura" já usada em
outro lugar do arquivo).

**Ainda pendente**: essa mudança só tem efeito depois de um build novo
(é código de cliente, não backend) — falta reproduzir o bug de novo e
conferir `adb logcat` por `[friendships] sendFriendRequest failed` pra
achar a causa raiz de verdade.

## Bug crítico encontrado e corrigido: Functions sem escopo `rows.*` (2026-08-24)

Relato real do dono do projeto: login com Apple funcionou (depois do fix
de `node_modules` abaixo + de apagar a conta travada no Appwrite Console
pra forçar um teste limpo), mas criar o perfil em seguida falhou com "tenta
de novo" — o Appwrite Console mostrava o erro de verdade:
```
claim-owned-row failed for profiles/<rowId>: app.<project>@service...
missing scopes (["rows.write","documents.write"])
```
**Causa raiz**: as duas Functions consolidadas (`client-actions` e
`row-events`) só tinham `databases.read`/`databases.write` nos escopos —
que no Appwrite atual **não cobrem operações de linha** na API de
Tables/Rows (`TablesDB`/`tablesDB.createRow`/`updateRow`/`deleteRow`/
`listRows`/`getRow`, usada em todo o código das duas Functions). Essas
duas permissões controlam só operações de schema (criar/alterar tabela,
coluna) — ler/escrever linhas precisa dos escopos separados `rows.read`/
`rows.write`, que nunca foram concedidos desde a criação das Functions em
2026-08-22. **Isso significa que toda operação de linha nas duas
Functions esteve quebrada desde sempre** — não só `claim-owned-row`
(criação de perfil), mas também `delete-account`, `join-group-run`,
`set-plan-override`, `suggest-plan-override`, e as duas limpezas por
evento em `row-events` (`revoke-coach-run-access`,
`revoke-live-audience`). Só não tinha aparecido antes porque: (1) o bug
de `node_modules` (seção abaixo) bloqueava as Functions por inteiro até
horas atrás, mascarando qualquer erro de escopo por trás de um 503 mais
básico; (2) `claim-owned-row` foi a primeira ação de escrita de linha
realmente exercitada depois desse fix.

**Corrigido** via `appwrite functions update` nas duas Functions,
adicionando `rows.read`+`rows.write` aos escopos existentes (mantendo
tudo mais igual — nome, entrypoint, `commands`, `execute`/`events`,
scopes anteriores — já que o `update` do CLI não faz patch parcial,
substitui os campos informados). Confirmado depois: execução de teste em
`client-actions` (`action: "__healthcheck__"`) respondendo
`400 {"error":"unknown-action"}` normalmente (Function saudável, não é
esse o teste que valida o fix em si — o teste real é o dono do projeto
tentar criar o perfil de novo no app). **Ainda não confirmado por teste
real** — mesma pendência de sempre, precisa ser confirmado num aparelho
de verdade.

**Lição pro README**: a lista de escopos documentada lá (`databases.read`/
`databases.write` apenas) está desatualizada — precisa registrar
`rows.read`/`rows.write` como parte do conjunto obrigatório pra qualquer
Function que use `TablesDB`, não só `databases.*`.

## Bug crítico encontrado e corrigido: Functions sem `node_modules` (2026-08-24)

Relato real do dono do projeto: login com Apple no iPhone, logo depois do
Face ID, voltava pro app com um erro mostrando "503". Investigação real
via Appwrite Console → Functions → `client-actions` → Executions revelou
o log de erro de verdade:

```
Failed to load module: Cannot find package 'node-appwrite' imported from /mnt/code/src/main.js
```

**Causa raiz**: as duas Functions consolidadas deste projeto
(`client-actions` e `row-events`) foram criadas sem o parâmetro
`--commands "npm install"` — sem isso, o Appwrite sobe só o código-fonte
puro e **nunca instala as dependências** (`node-appwrite`, `jose`).
Confirmado via `appwrite functions list-deployments`: todos os deploys de
`client-actions` até então tinham ~4s de build e 25-38KB de tamanho —
`row-events` tinha um único deploy de 6KB — nenhum dos dois nunca teve
`node_modules` de verdade. Isso significa que **toda ação dessas duas
Functions esteve quebrada desde que foram criadas** (2026-08-22): login
nativo Apple/Google, planilha de treinador (Fase A/B), boas-vindas por
e-mail, exclusão de conta, entrar num longão, e as duas limpezas de
acesso por evento (revogar leitura de ex-treinador, revogar espectador de
longão) — não só o login com Apple que gerou o relato original.

**Corrigido** via Appwrite CLI direto (instalado nesta sessão,
`npm install -g appwrite-cli`, configurado com as credenciais já em
`.env.local`):
```bash
appwrite functions update --function-id client-actions --commands "npm install" ... # (demais flags iguais aos já configurados)
appwrite functions create-deployment --function-id client-actions --code . --entrypoint src/main.js --commands "npm install" --activate
```
(mesma coisa pra `row-events`). Confirmado depois: builds novos com
~2MB (não mais KB) e uma chamada de teste em `client-actions` respondendo
`400 {"error":"unknown-action"}` de verdade (não mais um crash) — a
Function agora carrega e roda o dispatcher normalmente.

`README.md` atualizado (seção de cada Function) pra documentar
`--commands "npm install"` como obrigatório nos comandos de
`create`/`create-deployment`, com uma nota explícita pra sempre conferir
que um deploy novo tem tamanho de MB (não KB/poucos segundos de build) —
esse é o sinal de que o `npm install` não rodou.

**Ainda não confirmado por teste real**: o dono do projeto ainda precisa
tentar o login com Apple/Google de novo no iPhone pra confirmar que o 503
não acontece mais — o healthcheck confirma que a Function não crasha mais,
mas não substitui o teste ponta a ponta num aparelho real.

**Achado em 2026-08-24, investigando um relato separado ("não recebi
push nativo de nova versão no iOS")**: é a mesma causa raiz, não um bug
novo — confirmado direto via Appwrite CLI (`appwrite messaging
list-subscribers`/`list-topics`, `appwrite users list-targets`):
- Os dois tópicos (`android-updates`, `ios-updates`) existem, os dois
  providers (`fcm`, `apns`) existem e estão `enabled` — nada errado de
  configuração de console.
- **Zero inscritos em qualquer um dos dois tópicos** — nenhum dispositivo,
  Android ou iOS, jamais completou `subscribe-update-topic` com sucesso,
  porque essa ação também passa pela mesma `client-actions` quebrada.
- A conta Apple do próprio relato (`vc6ntw8s9s@privaterelay.appleid.com`)
  tem **zero push targets registrados** — não é só a inscrição no tópico
  que falhou, o dispositivo nunca chegou a se registrar de verdade.
  Motivo: `nativeAppleSignIn` (`src/lib/auth.ts:275`) chama
  `client-actions` (`action: "apple-native-signin"`) pra validar o JWT da
  Apple **antes** de `account.createSession` — como toda tentativa real
  desse login bateu no 503, a sessão nunca foi criada de verdade nessa
  conta a partir do iPhone, `useAuth()` nunca virou `"signed-in"` nesse
  dispositivo, e `PushRegistration` (que só roda quando `status ===
  "signed-in"`) nunca chegou a disparar `registerForPushNotifications()`.
  Ou seja: o relato de "não recebo push de nova versão" e o relato
  original de "503 depois do Face ID" são **o mesmo bug**, não dois.
- Confirmado também: o escopo `messages.write` na chave da Function
  (item 4 do checklist de push no `README.md`, marcado como "não
  confirmado por print ainda") **está presente** —
  `appwrite functions get --function-id client-actions` lista
  `messages.write` entre os scopes. Esse item pode ser fechado.
- **Nenhuma mudança de código foi necessária pra isso** — como o fix de
  `--commands "npm install"` já corrigiu `client-actions` de ponta a
  ponta, a próxima tentativa de login com Apple no iPhone deve completar
  o `createSession` normalmente, o que por sua vez dispara o registro de
  push e a inscrição no tópico automaticamente. **Ainda não confirmado
  por teste real** — mesma pendência do item acima, mesmo teste resolve
  os dois relatos de uma vez.

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
(submetido em 2026-08-21) ainda estava pendente de aprovação quando esse
teste rodou. Confirmado depois: assim que o 107 saiu da fila, um novo push
pra `testflight` completou a submissão do build 124 normalmente, sem
nenhuma mudança de código — e a Apple **aprovou o build 124 em
2026-08-23**, menos de 2 dias depois. O link público
(`https://testflight.apple.com/join/RMqtChWj`) hoje serve esse build de
verdade (ver "Perguntas em aberto" abaixo).

## Auditoria LGPD/segurança — status em 2026-08-22

22 achados originais (2 Crítico, 6 Alto, 9 Médio, 5 Baixo). **16
corrigidos** ao longo de duas sessões, **6 em aberto**. Detalhe completo
achado-a-achado só existe no chat/branch, não replicado aqui — o que
importa persistir é a ação pendente:

- **Bloqueio de infra achado em 2026-08-22 tentando deployar, resolvido por
  consolidação (não por upgrade de plano)**: o projeto Appwrite Cloud já
  batia no teto de Functions do plano atual com só 2 Functions existentes
  (`send-welcome-email`, `join-group-run`) — `appwrite functions create`
  recusava a primeira das 5 pendentes (LGPD + modo treinador) com
  `"The maximum number of functions allowed for the selected plan has
  reached."` **Preço conferido em appwrite.io/pricing**: Free trava em
  **2 Functions/projeto**, Pro (a partir de **US$25/mês**) libera
  ilimitadas. Perguntado ao dono do projeto se preferia pagar o Pro ou
  consolidar em menos Functions — **decidiu consolidar**.
  **Consolidação implementada nesta sessão**: as 6 ações client-invocadas
  (`delete-account`, `send-welcome-email`, `join-group-run`,
  `claim-owned-row`, `set-plan-override`, `suggest-plan-override`) viraram
  uma única Function `client-actions`, despachando por um campo `action`
  no corpo da requisição; as 2 por evento (`revoke-coach-run-access`,
  `revoke-live-audience`) viraram `row-events`, registrada nos dois
  eventos de delete, despachando por qual tabela disparou. Isso cabe nas 2
  vagas do Free — inclusive cobrindo de graça `delete-account`, que nunca
  chegou a ser deployada standalone apesar de documentada. Trade-off
  aceito conscientemente: cada dispatcher roda com a união de todos os
  escopos das suas ações, não o mínimo de uma ação específica — ver
  `README.md` pra esse raciocínio completo.
  **Virada de produção executada em 2026-08-22**: `send-welcome-email` e
  `join-group-run` apagadas de verdade (`appwrite functions delete`),
  `client-actions` e `row-events` criadas e deployadas no lugar
  (`appwrite functions create-deployment --code . --activate` — não
  `appwrite push functions`, que depende de um `appwrite.config.json`
  com a lista de functions que este projeto nunca teve; `create-deployment`
  não precisa desse arquivo). `GEMINI_API_KEY` já configurada em
  `client-actions` (mesmo valor do `.env.local`). Confirmado via
  `appwrite functions list`: exatamente as 2 Functions esperadas, ambas
  `ready`. **Pendência resolvida em 2026-08-22**: `RESEND_API_KEY` não
  migrou sozinha (Appwrite não deixa ler o valor de uma variável secreta
  já configurada de volta, então se perdeu junto com a `send-welcome-email`
  antiga), mas o dono do projeto gerou uma chave nova no Resend e
  configurou em `client-actions` no mesmo dia — confirmado via
  `appwrite functions list-variables`: `GEMINI_API_KEY` e `RESEND_API_KEY`
  ambas presentes. E-mail de boas-vindas voltou a funcionar, nenhuma
  pendência real restando dessa migração.
  **Segunda descoberta de teto de plano nessa mesma sessão**: rodar
  `scripts/appwrite-setup.ts` depois do deploy bateu num teto separado —
  Free também trava em **1 bucket de Storage por projeto**, e como o
  bucket `avatars` já existia, o `createBucket` do script tentava recriar
  e levava 403 (`additional_resource_not_allowed`) **antes** de sequer
  checar se o ID já existia (diferente de tabela/coluna, que dão 409 nesse
  caso). Corrigido no próprio script: agora confere com `getBucket()`
  primeiro e só chama `createBucket` se realmente não existir — sem essa
  correção, o script falhava sempre que rodado de novo num projeto que já
  tem o bucket, mesmo sem nada de fato pra criar.
- **Achados #10, #11 e #12 da auditoria LGPD fechados de verdade em
  produção em 2026-08-22** — `client-actions`/`row-events` deployadas, e
  `scripts/appwrite-setup.ts` rodado até o fim (incluindo o bloco que
  retira a permissão antiga de `create` aberta em
  `profiles`/`profile_stats`/`place_run_stats`). `plan_overrides` também
  criada nessa mesma rodada.
- **Em aberto, dependem só do dono do projeto em console externo**:
  rotacionar `APPWRITE_SETUP_API_KEY` (achado #08, decidido adiar), restringir
  a chave pública da MapTiler por domínio (achado #13).
- **Em aberto, decisão de produto tomada, sem ação de código pendente**:
  achado #15 (chaves Gemini/Recraft paradas) — decidido manter, vão ser
  usadas; achado #18 (bucket de avatares público) — decidido manter, estilo
  "Strava só que melhor/gaming" (não detalhado ainda o que isso significa
  visualmente).

## Modo treinador com IA — Fases A e B implementadas, Fase C escopada

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
- Ação `set-plan-override` dentro da Function consolidada `client-actions`
  (`appwrite-functions/client-actions/src/main.js` — ver "Auditoria
  LGPD/segurança" acima pra por que virou uma ação dentro de um
  dispatcher em vez da Function própria que era originalmente): mesmo
  padrão de `join-group-run`/`claim-owned-row` — confirma vínculo
  `accepted` em `coach_relationships` antes de gravar, chave privilegiada,
  nunca escrita direta do cliente. **Ainda não deployada** — a Function
  `client-actions` em si ainda não foi deployada; instruções no `README.md`.
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

- Ação `suggest-plan-override` dentro da Function consolidada
  `client-actions` (`appwrite-functions/client-actions/src/main.js` — ver
  "Auditoria LGPD/segurança" acima pra por que virou uma ação dentro de
  um dispatcher em vez da Function própria que era originalmente): chama
  Gemini Flash (`GEMINI_API_KEY`, já em `.env.local` — primeira
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
- **Ainda não deployada** — a Function `client-actions` em si ainda não
  foi deployada; instruções completas no `README.md`, incluindo o passo
  de configurar a variável `GEMINI_API_KEY` nela (usada só por essa ação,
  ao lado de `RESEND_API_KEY` usada por `send-welcome-email`).

**Fase C (painel web pra vários alunos, escopo decidido em 2026-08-23,
implementada em 2026-08-24, branch `claude/strava-competitor-feedback-cyvop8`,
ainda não deployada em produção)** — motivação: um treinador que atende muita
gente é um multiplicador de aquisição (1 treinador ativo traz vários
alunos novos), diferente de um usuário comum que só puxa quem já corre
junto — vale investir numa tela que escale além de 1-2 alunos.
`/treinador` hoje é uma lista simples e `/treinador/aluno` abre um aluno
por vez em coluna de celular; não escala pra quem treina 15+. Mockup
visual em "Sala de Treino" (artifact desta sessão) propõe uma janela de
navegador (não celular) com tira de resumo (ativos / correndo agora /
sem contato há 7+ dias) + lista de alunos com pill de status e aderência
à meta + a mesma "Planilha da semana" de sempre ao lado, sem navegação
por aluno. **Decisão de escopo fechada nesta sessão**: essa superfície
web é **só pra navegar/gerenciar** — nunca capta GPS nem roda tracking
nenhum. Todo dado de corrida continua vindo exclusivamente do app nativo
do aluno sincronizando pro Appwrite (`live_runs`, `runs` via
`runsSync.ts`); o painel do treinador só lê isso. **Não é reviver o PWA
do atleta** (esse continua morto por completo, ver "O produto, em uma
frase" acima) — é uma superfície nova e separada, cujo público (o
treinador) nunca precisa de GPS/tracking pra usá-la. Em aberto: se o
login do treinador nessa web continua a mesma conta Google/Apple de
sempre (só acessada de um navegador de desktop em vez do app nativo) e
se isso vira uma rota nova dentro do mesmo Next.js ou uma superfície/
deploy própria.

**Implementação real (2026-08-24)**: nova rota `/treinador/sala`, dentro do
mesmo Next.js/mesmo deploy — nenhuma superfície separada, mesma pergunta
em aberto acima resolvida na direção mais simples. Login continua sendo a
mesma conta Google/Apple de sempre (só que acessada num navegador em vez
do app nativo, não muda nada de autenticação).

- `WeekPlanEditor` (o card "Planilha da semana" inteiro, com o botão
  "Sugerir com IA" da Fase B incluso) foi extraído de dentro de
  `/treinador/aluno` pro arquivo compartilhado
  `src/app/(app)/treinador/week-plan-editor.tsx` — usado agora tanto por
  `/treinador/aluno` (um aluno, sem navegação de lista) quanto por
  `/treinador/sala` (o painel do aluno selecionado). Mesmo componente,
  nenhuma lógica duplicada entre as duas telas.
- `src/lib/liveRuns.ts` ganhou `listLiveRunsForStudents(studentIds)` —
  mesma ideia de `listSessionLiveRuns`, uma query batched em vez de N
  polls individuais; `src/lib/runsSync.ts` ganhou
  `listRunsSharedByStudents(studentIds)`, batched do mesmo jeito e
  agrupado de volta por `userId` no cliente (Appwrite não tem `GROUP BY`).
  Ambas continuam sob controle 100% de permissão por linha — um treinador
  só recebe de volta o que cada aluno realmente compartilhou com ele.
- `/treinador/sala`: tira de resumo (Ativos / Correndo agora / Sem
  contato há 7+ dias), lista de alunos com pill de status (Ao vivo /
  data da última corrida compartilhada / "sem corrida"), clique num
  aluno abre um painel abaixo com o card ao vivo (se estiver correndo)
  + a mesma planilha da semana — nunca um mapa único com todo mundo ao
  mesmo tempo, exatamente a decisão de produto documentada acima.
  `/treinador` ganhou um card de entrada linkando pra lá, visível só
  quando o treinador já tem pelo menos um aluno aceito.
- **Corte de escopo consciente**: o mockup original citava "aderência à
  meta" como parte do pill de status de cada aluno na lista — não
  implementado assim. A limitação de arquitetura já registrada acima (o
  treinador não vê o plano que o motor calculou pro aluno, só overrides
  que ele mesmo criou) significa que não existe uma "meta" pra comparar
  aderência a menos que já exista um override pra semana atual — calcular
  isso por aluno na lista exigiria uma chamada extra por aluno (perdendo
  o ganho de ter batched as duas queries principais). Fica como possível
  refinamento futuro, não bloqueou o resto da tela.
- Verificado: `tsc --noEmit`, `npm run lint`, `npm run build` (incluindo
  `/treinador/sala` na lista de rotas geradas) — todos limpos. Não
  testado em navegador real (ambiente remoto sem esse dev server visível
  pro dono do projeto) nem contra dados reais de múltiplos alunos.

## Perguntas em aberto (preencher quando puder)

- [x] **2026-08-21: aprovada** — conta de desenvolvedor do Google Play
      verificada. Falta só configurar o secret
      `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` e fazer o primeiro upload pro
      Play Console (fluxo já documentado no `README.md`).
- [x] **2026-08-19: decidido, 2026-08-21: submetido, 2026-08-23:
      aprovado** — TestFlight External Testing. Grupo "Beta" já existia no
      App Store Connect com link público pronto
      (`https://testflight.apple.com/join/RMqtChWj`), mas sem nenhum build
      associado (0 builds). O build 107 (submetido em 2026-08-21) ficou
      preso na fila de revisão da Apple até ser resolvido; o build 124
      (submetido depois, pela mesma branch `testflight`) foi o que a Apple
      efetivamente **aprovou em 2026-08-23** — aprovação saiu rápido, menos
      de 2 dias. **O link público agora deixa qualquer pessoa entrar de
      verdade** — dá pra colocar na bio do Instagram e trocar o badge "Em
      teste fechado" da landing. Revisão de build externo é por build, não
      por grupo: dá pra adicionar/remover testadores e até criar grupos
      novos com esse mesmo build 124 sem precisar de nova revisão — mas
      cada push novo em `main` só sobe pro Internal Testing automático (sem
      revisão), e o link público continua servindo o build 124 até alguém
      deliberadamente rodar o fluxo da branch `testflight` de novo pra
      promover um build mais recente — o que aí sim exige nova revisão da
      Apple. Revisão completa da App Store (produção) continua sem prazo
      definido.
      **Atualização 2026-08-24**: rodado de novo (build 134 — Google
      Sign-In nativo no iOS, push de "nova versão" independente do
      TestFlight, fix do pace ao vivo lendo mais devagar que o real) —
      **aprovado pela Apple ainda no mesmo dia**, o link público agora
      serve esse build.
      **Segunda atualização no mesmo dia (2026-08-24)**: build 140 (Sala
      de Treino, fix do `iosScheme`/login nativo, fix do CTA da landing)
      submetido pela branch `testflight` — só que na primeira tentativa
      a Apple ainda não tinha processado o 140, então o script (que
      sempre pega "o build mais recente já processado") submeteu o 139
      antigo por engano. Retentado direto via re-run do job
      `submit_for_review` (sem rebuildar nada) até o 140 aparecer como
      processado — a segunda tentativa falhou de forma segura
      (`INVALID_QC_STATE`, o 139 já estava em fila), a terceira pegou o
      140 certo e submeteu com sucesso. Ainda não confirmado se a Apple
      aprovou.
- [x] **2026-08-22: escopado, Fase A e Fase B implementadas** — modo
      treinador vira "os dois juntos" (IA sugere + motor determinístico
      trava os limites + treinador edita por cima), ver seção própria
      acima. Fase A (planilha manual) e Fase B (sugestão por IA) têm
      código pronto; falta só o deploy de `client-actions`.
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
- [x] **2026-08-22: `HEALTH_DATA_ENABLED` religado** — "Caminho A" (ler
      HealthKit/Health Connect pós-corrida, cobre toda marca de relógio,
      mas não é ao vivo) está com todo o código e pré-requisitos prontos.
      **Único bloqueio real restante: testar em aparelho real com um
      relógio de verdade sincronizado** — não dá pra fazer neste ambiente,
      precisa ser o dono do projeto no celular dele. "Caminho B1" (FC ao
      vivo via Bluetooth Heart Rate Service, `0x180D`) continua só
      pesquisado, nada implementado — cobre cinta/relógio em modo
      broadcast mas nunca Apple Watch (não transmite por BLE); não é
      excludente com o Caminho A, só uma fase futura possível.

## Como manter isso vivo

Sempre que uma sessão descobrir ou decidir algo relevante de produto/infra
que não é óbvio só lendo o código (contas, domínios, decisões de escopo,
prazos, ferramentas externas), atualize este arquivo na hora — não deixe
só na conversa. Detalhes puramente técnicos (como rodar, como configurar
CI/CD, arquitetura do tracking) já estão bem documentados no
`README.md` e não precisam ser duplicados aqui.
