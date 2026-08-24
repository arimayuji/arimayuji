# Xanthus

Um app de corrida construído em cima das dores mais reclamadas do
segmento (Strava, Nike Run Club, Runkeeper, Adidas Running, Komoot,
MapMyRun, Garmin Connect): preço que muda o combinado depois, GPS em que
ninguém confia, dados presos, suporte ausente.

## App nativo (Capacitor)

O produto nasceu como PWA pura, mas isso foi abandonado: o tracking em
segundo plano (tela apagada) é um problema real — GPS que para ou perde
precisão com a tela bloqueada — que nenhuma PWA resolve. Hoje só existem
os apps nativos via [Capacitor](https://capacitorjs.com/) nas pastas
`android/` e `ios/`; não há manifest, service worker, nem instalação pelo
navegador. `xanthus.app.br` (`npm run build` → Cloudflare Workers) segue no
ar só como landing page de marketing/download — nunca serve o app rodando
de verdade no navegador.

Importante: **não dá pra "envolver só a tela de corrida"** como a ideia
original imaginava — o Capacitor carrega o app inteiro numa WebView nativa
e o roteamento continua sendo feito pelo próprio Next.js, então o caminho
real foi embarcar o app inteiro no shell nativo (todas as telas, histórico
incluso) e trocar só o código de GPS: `src/lib/tracking/geolocation.ts`
chama `@capacitor/geolocation`, que cai pro `navigator.geolocation` do
navegador sozinho quando não tá rodando nativo — o mesmo código atende os
dois mundos.

Workflows em `.github/workflows/android-build.yml` e `ios-build.yml`
buildam automaticamente em toda push: o Android gera um APK debug pronto
pra sideload; o iOS sempre builda pro Simulator (sem assinatura, então roda
sem conta Apple) só pra validar que o projeto compila — e, se os secrets do
App Store Connect abaixo estiverem configurados, builda também um archive
assinado de verdade e sobe direto pro TestFlight.

**Baixar o APK**: <https://xanthus.app.br/download>
— link fixo, sem expirar, sem precisar de login (ao contrário do artefato
do próprio GitHub Actions, que expira em 30 dias e exige conta com acesso
ao repo). Publicado automaticamente a cada push em `main` via o secret
`CLOUDFLARE_API_TOKEN` (Settings → Secrets and variables → Actions do repo
no GitHub) — sem ele, o step de publicação do `android-build.yml` só avisa
e pula, o resto do build continua normal.

**Assinatura de release**: por padrão o link acima serve um APK
*debug*-assinado (funciona pra sideload, mas não é a identidade certa pra
publicar/atualizar de verdade). Pra virar release assinado, gere uma
keystore local —

```bash
keytool -genkeypair -v -keystore xanthus-release.keystore -alias xanthus \
  -keyalg RSA -keysize 2048 -validity 10000
```

— e configure dois secrets no repo: `ANDROID_RELEASE_KEYSTORE_BASE64` (a
keystore inteira, `base64 -w0 xanthus-release.keystore`) e
`ANDROID_RELEASE_KEYSTORE_PASSWORD`. **Guarde a keystore em algum lugar
seguro fora do git — se ela se perder, não tem como publicar uma
atualização do app com a mesma identidade nunca mais.** Ela nunca é
commitada (`android/.gitignore` bloqueia `*.keystore`/`*.jks`); o CI decodifica
o secret num arquivo temporário a cada build. Com os dois secrets presentes,
`android-build.yml` builda `assembleRelease` de verdade e passa a publicar
esse build (em vez do debug) no link público.

**Upload pro Google Play**: exige uma conta de desenvolvedor Google Play
(taxa única de US$25, não anual) e, **antes de qualquer automação por CI, a
primeira versão do app precisa ser enviada manualmente** pelo Play Console —
a API do Google não cria a ficha do app do zero, só publica versões novas de
um app que já existe lá. Depois desse primeiro upload manual:

1. No [Google Cloud Console](https://console.cloud.google.com), no mesmo
   projeto (ou um novo) ligado à sua conta do Play Console: **IAM e admin →
   Contas de serviço → Criar conta de serviço** (não precisa conceder nenhum
   papel do IAM na criação — o acesso é concedido depois, do lado do Play
   Console). Gera uma chave JSON pra essa conta de serviço (**Chaves →
   Adicionar chave → JSON**) e guarda o arquivo baixado.
2. No **Play Console** → sua conta de desenvolvedor → **Usuários e
   permissões → Convidar novos usuários** → cola o e-mail da conta de
   serviço (formato `nome@projeto.iam.gserviceaccount.com`, tá no JSON
   baixado) → concede acesso ao app Xanthus com permissão de **"Editar e
   publicar versões"** (Release Manager) no mínimo.
3. Configura o secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` no repo com o
   **conteúdo inteiro do arquivo JSON** (sem base64 — cola o JSON puro).

Com o secret presente, `android-build.yml` builda o `.aab` assinado (formato
que o Play exige, diferente do `.apk` usado no link público de sideload) e
sobe pro track **"internal"** — o único que já existe por padrão em todo app
novo, sem precisar criar nada antes. Promover a versão pra teste fechado ou
pra produção continua sendo manual no Play Console, mesmo modelo do
TestFlight (upload automático, "enviar pra revisão" na mão).

**Contas novas de desenvolvedor pessoa física** têm uma exigência extra do
Google antes de liberar produção: rodar uma trilha de teste fechado com pelo
menos 20 usuários que aceitaram o convite e instalaram de fato (não basta
convidar), por 14 dias corridos seguidos. O upload em si (via CI, na trilha
"internal") não é afetado por essa regra — ela só bloqueia a promoção pra
produção.

**Upload pro TestFlight (iOS)**: exige uma conta Apple Developer Program
paga (US$99/ano) — sem ela `ios-build.yml` só builda pro Simulator e pula o
resto, sem falhar. Com a conta ativa:

1. App Store Connect → Users and Access → Integrations → App Store Connect
   API → gera uma chave com acesso **Admin** (evita erro de permissão na
   hora do CI criar certificado/perfil de distribuição sozinho).
2. Baixa o arquivo `.p8` na hora (só dá pra baixar uma vez).
3. Configura três secrets no repo: `APP_STORE_CONNECT_KEY_ID` (tipo
   `B4RVV43UMG`, vem no nome do arquivo — `AuthKey_<KEY_ID>.p8`),
   `APP_STORE_CONNECT_ISSUER_ID` (UUID mostrado na mesma tela) e
   `APP_STORE_CONNECT_API_KEY_P8` (o `.p8` inteiro em base64:
   `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy` num Mac).

Assinatura usa a API key em vez de login com Apple ID
(`-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID
-allowProvisioningUpdates` do `xcodebuild`) — nada interativo, o próprio CI
cria/renova o certificado de distribuição e o perfil de provisionamento
conforme precisar. `CURRENT_PROJECT_VERSION` (build number) é o número do
run do workflow, que só sobe — a App Store Connect exige isso pra aceitar
cada upload novo da mesma versão. O Team ID (`6YJ97VWT8V`) tá fixo direto
no workflow — não é secreto, é o mesmo prefixo que já aparece em qualquer
provisioning profile da conta.

**Submeter pro Beta App Review (External Testing)**: deliberadamente
separado do upload — toda push em `main` já sobe pro TestFlight sozinha,
mas submeter esse build pra revisão externa da Apple é uma decisão à
parte (cada submissão consome uma revisão de verdade, com risco de
rejeição por nota "o que testar" genérica se isso virasse automático a
cada commit). Pra disparar:

```
git checkout testflight
git merge main
git push
```

Isso roda `scripts/ci/submit-testflight-review.mjs` (job `submit_for_review`
em `ios-build.yml`): espera o build mais recente terminar de processar no
App Store Connect, adiciona ao grupo externo "Beta" e submete pra revisão
— usando as mesmas três secrets `APP_STORE_CONNECT_*` de cima, via a App
Store Connect API (JWT assinado ES256). Não builda nada de novo, só age
sobre o build que `main` já subiu.

## Prontidão pra revisão das lojas

**Sign in with Apple** (`src/lib/auth.ts`): obrigatório pela guideline 4.8
da App Store sempre que o app oferece login social de terceiro (aqui,
Google) — sem ele a submissão é rejeitada. Configuração no lado da Apple
(exige a mesma conta Apple Developer Program do TestFlight):

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) →
   Identifiers → **+** → **Services IDs** → cria um identificador **diferente**
   do bundle ID do app (ex: `com.xanthus.app.signin`), habilita **Sign in
   with Apple**, e configura o domínio (**`xanthus.app.br`** — domínio de
   produção desde que o Custom Domain do Cloudflare foi ligado, ver
   `PROJECT-CONTEXT.md`; se a Services ID ainda lista só o antigo
   `xanthus.yujiarima.workers.dev`, é isso que causa "invalid_client" na
   tela do appleid.apple.com — precisa editar a Services ID, trocar/somar
   o domínio novo, e reverificar a propriedade dele se a Apple pedir) e a
   Return URL — o valor exato da Return URL está na tela do provedor "Apple"
   dentro do Appwrite Console (Auth → Settings → OAuth2 Providers).
2. **Keys** → **+** → habilita **Sign in with Apple**, associa ao App ID
   principal (`com.xanthus.app`) → baixa o `.p8` (só uma vez).
3. No **Appwrite Console** → Auth → Settings → OAuth2 Providers → **Apple**:
   habilita e preenche Client ID (o Services ID do passo 1), Team ID, Key ID
   e o conteúdo do `.p8` do passo 2 — confira os nomes exatos dos campos na
   tela, podem variar entre versões do Appwrite.

O passo 2 (Key + `.p8`) é usado pelo provedor OAuth2 do Appwrite (Android e
web); no Android/web o fluxo é o de sempre, redirect por navegador do
sistema (`startOAuthSignIn` em `src/lib/auth.ts`), sem SDK nativo nem
entitlement extra.

**No iOS, o login com Apple usa um caminho diferente** (`nativeAppleSignIn`,
mesmo arquivo): o fluxo por navegador acima é uma limitação documentada da
própria Appwrite pra Sign in with Apple especificamente em app nativo — o
`response_mode=form_post` da Apple não completa de forma confiável a volta
pro custom URL scheme de dentro do `SFSafariViewController` embarcado (Face
ID passa, uma conta real chega a ser criada no Appwrite do lado do
servidor, mas o cliente fica numa tela branca e nunca é logado de
verdade — github.com/appwrite/appwrite/issues/2611,
appwrite.io/integrations/native-auth-apple documenta essa mesma limitação
e recomenda exatamente a troca feita aqui). Em vez do navegador, o iOS
chama `ASAuthorizationAppleIDProvider` direto (sheet de Face ID puro, via
`@capacitor-community/apple-sign-in`) e manda o identity token pra ação
`apple-native-signin` em `client-actions` (ver seção de Functions abaixo),
que verifica a assinatura contra as chaves públicas da Apple e devolve um
`userId`/`secret` pro cliente trocar por sessão — sem navegador, sem deep
link, sem `oauth-callback-listener.tsx` envolvido.

Isso precisa de:
- `com.apple.developer.applesignin` no `ios/App/App/App.entitlements`
  (já commitado) — e a capability "Sign in with Apple" habilitada no App
  ID principal (`com.xanthus.app`) em developer.apple.com, que quase
  certamente já está ligada desde o passo 2 acima (a Apple exige essa
  capability no App ID principal antes de deixar criar uma Services ID
  vinculada a ele). Se um build assinado falhar por entitlement ausente,
  é o primeiro lugar pra conferir.
- A Function `client-actions` redeployada com a ação `apple-native-signin`
  e o `--execute any` (ver seção de Functions abaixo) — sem isso, o login
  nativo no iOS não tem como funcionar mesmo com o app buildado certo.

**Google Sign-In no iOS** (`nativeGoogleSignIn`, mesmo arquivo): reportado
pelo dono do projeto e por um amigo dele testando — no iPhone, tocar em
"Entrar com Google" cria a conta de verdade no Appwrite (visível no
Console, e-mail verificado) mas a tela nunca volta pro app, fica em loading
infinito; no Android o fluxo de sempre (`startOAuthSignIn`) funciona normal.
Mesma classe de bug do Apple acima — o `SFSafariViewController` que o
navegador do sistema abre no iOS não devolve o controle de forma confiável
pro custom URL scheme do app, pra nenhum dos dois provedores — só que o
Google não tem o atalho "chame a API do sistema direto" que a Apple tem
via `ASAuthorizationAppleIDProvider`; a correção usa o SDK nativo do Google
(`GIDSignIn`) via `@capgo/capacitor-social-login` (mesmo fabricante do
plugin de GPS/saúde já usados neste projeto), que manda o `idToken` pra
ação `google-native-signin` em `client-actions` — mesmo desenho de
`apple-native-signin`, com a vantagem de que o token do Google já vem com
`email`/`name` verificados, sem precisar confiar em nada que o cliente
mandou.

**Isso precisa de um OAuth Client ID do tipo "iOS" no Google Cloud, que só
o dono do projeto pode criar** (mesmo projeto GCP do login Google/Appwrite
já em uso):

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   → **+ Create Credentials** → **OAuth client ID**.
2. Tipo de aplicativo: **iOS**.
3. Bundle ID: `com.xanthus.app` (o mesmo de sempre).
4. Criar → copiar o **Client ID** gerado (termina em
   `.apps.googleusercontent.com` — não tem client secret, tipo "iOS" não
   gera um).
5. Colocar esse valor em **dois** lugares (o mesmo valor nos dois):
   - Secret do GitHub Actions `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (repo →
     Settings → Secrets → Actions) — `ios-build.yml` já injeta essa env
     var no `npm run build`.
   - Variável `GOOGLE_IOS_CLIENT_ID` na Function `client-actions`
     (Appwrite Console → Functions → client-actions → Variables) — é
     contra esse valor que `google-native-signin` confere o `aud` do
     token.

Sem isso configurado, `nativeGoogleSignIn` devolve o diagnóstico "Google
não devolveu um idToken"/"NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ausente" em vez
de travar silenciosamente — o mesmo padrão de todo early-return desse
arquivo (ver comentário de `startOAuthSignIn`). `npx cap sync` já registra
o plugin no projeto iOS (só Google habilitado — Facebook/Apple/Twitter
desligados em `capacitor.config.ts`, este app não usa nenhum dos três por
esse plugin).

**Bug real encontrado no build 134 (primeira tentativa em produção)**: o
app inteiro fechava (crash, não tela travada) no instante em que tocava
"Entrar com Google" — confirmado por um crash log de verdade baixado do
TestFlight (App Store Connect → TestFlight → Crashes/Feedback), não só
suposição. Stack trace: `EXC_CRASH (SIGABRT)` dentro de `-[GIDSignIn
signInWithOptions:]`, chamado por `GoogleProvider.swift` (o plugin) — o
próprio SDK do Google (`GIDSignIn`) levanta uma `NSException` não
capturada assim que o login começa, **antes** de mostrar qualquer UI, se
o app não tiver um `CFBundleURLTypes`/`CFBundleURLSchemes` registrado com
o "client ID invertido" no `Info.plist` — uma exigência do próprio SDK do
Google, independente do plugin Capacitor, que passou despercebida na
implementação original (a documentação do plugin só menciona
Info.plist/AppDelegate pro provedor Facebook, não pro Google, o que
sugeriu erroneamente que não precisava).

Corrigido em `ios/App/App/Info.plist`: uma terceira entrada em
`CFBundleURLTypes` com `$(GOOGLE_REVERSED_CLIENT_ID)` — uma substituição
de build setting do Xcode (mesmo mecanismo que `CURRENT_PROJECT_VERSION`
já usa nesse workflow), resolvida em `ios-build.yml` no step "Build &
upload signed archive to TestFlight" a partir do
`NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` já configurado — client IDs "iOS" do
Google sempre têm o formato `<números>-<hash>.apps.googleusercontent.com`,
e o "invertido" que o `GIDSignIn` exige é sempre
`com.googleusercontent.apps.<números>-<hash>`, calculado com um simples
strip de sufixo em bash, sem precisar colar o client ID real em lugar
nenhum do repo. Sem o secret configurado, essa entrada fica com o scheme
vazio — inofensivo, já que `nativeGoogleSignIn` nem chega a chamar
`GIDSignIn` nesse caso.

**Segundo bug real, no build seguinte (136) — dessa vez os dois logins
nativos (Apple e Google)**: depois do crash acima corrigido, os dois
passaram a falhar do mesmo jeito, um passo adiante — no exato
`account.createSession({userId, secret})` que fecha os dois fluxos (a
etapa compartilhada por `nativeAppleSignIn`/`nativeGoogleSignIn`), com o
erro da própria Appwrite: `"Invalid Scheme. The scheme used (capacitor)
in the Origin (capacitor://localhost) is not supported... change it to
appwrite-callback-<PROJECT_ID>"`. Causa: o Capacitor no iOS roda o WebView
sob o esquema `capacitor:` por padrão (não pode ser trocado pra
`http`/`https` — restrição do próprio Capacitor/WKWebView), e a Appwrite
rejeita esse esquema pra criação de sessão. O Android nunca teve esse
problema porque já roda em `https://localhost` por padrão, aceito sem
configuração extra.

Corrigido em `capacitor.config.ts`: `server.iosScheme` trocado pro mesmo
literal já usado no `CFBundleURLScheme` do `Info.plist`
(`appwrite-callback-<PROJECT_ID>`) — exatamente o esquema que a própria
mensagem de erro da Appwrite aponta como suportado. **Custo aceito
conscientemente**: trocar o esquema do WebView muda a origem que o
IndexedDB/localStorage do app enxerga — todo histórico de corrida já
salvo localmente num iPhone que rodou uma versão anterior (`capacitor://
localhost`) fica inacessível depois dessa mudança (não apagado, só
órfão). Aceitável agora com o app ainda em teste fechado com poucas
contas; seria um problema real numa base de usuários maior. Não
verificado ainda se reusar o mesmo esquema pro WebView e pro deep link
externo causa algum conflito de navegação — só dá pra confirmar isso
testando num aparelho real.

**Exclusão de conta** (`/perfil`): obrigatória pela guideline 5.1.1(v) da
App Store sempre que o app permite criar conta. O SDK cliente do Appwrite
não tem um jeito de auto-excluir a conta (só `deleteSession`/
`deleteIdentity`) — apagar de verdade exige a API privilegiada de Users,
então isso roda como Appwrite Function, nunca no cliente. Ver
`appwrite-functions/client-actions` (ação `delete-account`) abaixo.

**Entrar num "longão"**, **criar a primeira linha de
`profiles`/`profile_stats`/`place_run_stats`**, **salvar/sugerir um
override de treinador no plano do aluno**, **enviar o e-mail de
boas-vindas**, e **validar o login nativo com Apple no iOS**
(`apple-native-signin`, ver seção "Prontidão pra revisão das lojas" acima)
— seis ações privilegiadas diferentes, seis motivos diferentes pra não
serem uma escrita direta do cliente (ver o comentário de cada handler em
`appwrite-functions/client-actions/src/main.js` pro raciocínio específico
de cada uma), mas **uma Function só**, `client-actions`, despachando por
um campo `action` no corpo da requisição.

**Por que uma Function só em vez de seis**: o plano **Free** do Appwrite
Cloud trava em **2 Functions por projeto** (conferido em
appwrite.io/pricing, 2026-08-22) — as seis ações client-invocadas acima
mais as duas por evento abaixo somariam 8 Functions, quatro vezes o
limite do plano atual. Dobrar tudo em dois *dispatchers* (um por chamada
do cliente, outro por evento do banco) cabe exatamente nas duas vagas do
Free. A troca: cada dispatcher roda com a **união** de todos os escopos
de API key que suas ações precisam, não só o escopo mínimo de uma ação
específica — um raio de ação maior por execução do que seis Functions
isoladas teriam, mas ainda assim bem mais restrito que uma chave admin
fixa. Ver PROJECT-CONTEXT.md pra como esse teto foi descoberto e o preço
do plano Pro (ilimitado) se algum dia isso deixar de compensar.

Deploy (via [Appwrite CLI](https://appwrite.io/docs/tooling/command-line/installation)):

```bash
cd appwrite-functions/client-actions
appwrite functions create \
  --function-id client-actions --name "Ações privilegiadas do cliente" \
  --runtime node-22 --entrypoint src/main.js \
  --commands "npm install" \
  --execute any \
  --scopes users.read --scopes users.write --scopes databases.read \
  --scopes databases.write --scopes files.write
appwrite functions create-deployment --function-id client-actions --code . --entrypoint src/main.js --commands "npm install" --activate
```

**`--commands "npm install"` não é opcional** — sem isso o Appwrite sobe
só o código-fonte e nunca instala `node-appwrite`/`jose`, e a Function
crasha em toda chamada com `503`/`Cannot find package 'node-appwrite'`
(bug real encontrado e corrigido em 2026-08-24: os quatro deploys feitos
até então tinham ~30KB e ~4s de build — sem `node_modules` nenhum — porque
o comando original usado pra criar a Function nunca passou `--commands`,
então ficou permanentemente vazio até ser corrigido via `appwrite
functions update --commands "npm install"` seguido de um novo deploy,
esse sim com ~2MB e `node_modules` de verdade). Confirmar sempre que um
deploy novo tem tamanho de MB, não de KB — um build de poucos segundos e
poucos KB é sinal de que o `npm install` não rodou.

**Se `client-actions` já existe** (caso normal — ela já está em produção
desde a consolidação da auditoria LGPD, ver `PROJECT-CONTEXT.md`): o
comando `create` acima falha porque o ID já existe, e o `create-deployment`
sozinho não muda `--execute`/`--scopes` de uma function já criada — só o
código. Redeploy de código novo (inclui `apple-native-signin`):

```bash
cd appwrite-functions/client-actions
appwrite functions create-deployment --function-id client-actions --code . --entrypoint src/main.js --commands "npm install" --activate
```

Pra mudar `--execute` de `users` pra `any` (necessário pra
`apple-native-signin`/`google-native-signin` funcionarem — são as duas
únicas ações que rodam sem sessão nenhuma, ver o comentário de
`PUBLIC_ACTIONS` em `main.js`): **Appwrite Console → Functions →
client-actions → Settings → Execute Access → Any** (a lista de scopes
acima não muda — `users.read`/`users.write` já cobrem
`Users.create`/`Users.createToken`, que é tudo que as duas precisam além
do que as outras ações já usavam). O check `x-appwrite-user-id` dentro de
`clientActions()` continua bloqueando toda ação que não esteja em
`PUBLIC_ACTIONS` mesmo com execução aberta pra `any` — abrir isso não
deixa nenhuma das outras nove ações chamável anonimamente.

Depois, no Appwrite Console → Functions → client-actions → **Settings →
Variables**, adiciona:
- `RESEND_API_KEY` — usada pela ação `send-welcome-email` (ver "E-mail
  transacional (Resend)" abaixo pra como conseguir uma).
- `GEMINI_API_KEY` — usada pela ação `suggest-plan-override`, mesmo valor
  já presente em `.env.local`.
- `GOOGLE_IOS_CLIENT_ID` — usada pela ação `google-native-signin`, ver
  "Google Sign-In no iOS" acima pra como conseguir.

O `--execute any` libera a chamada pra qualquer um, autenticado ou não —
necessário só por causa de `apple-native-signin`/`google-native-signin`
(as únicas ações sem sessão possível). O check de sessão dentro de
`clientActions()` (ver `PUBLIC_ACTIONS` em `main.js`) continua exigindo
`x-appwrite-user-id` pra todas as outras, então nenhuma delas passa a ser
chamável anônima só por isso. Rode
`npx tsx scripts/appwrite-setup.ts` depois do deploy pra garantir que
`plan_overrides` existe e que a permissão antiga de `create` aberta em
`profiles`/`profile_stats`/`place_run_stats` foi retirada (achado de uma
auditoria LGPD/segurança — ver `PROJECT-CONTEXT.md`).

**Revogar acesso de ex-treinador e de quem saiu de um longão**
(`appwrite-functions/row-events`): dois achados de uma auditoria
LGPD/segurança — desfazer um vínculo de treinador nunca revogava a
leitura de GPS já concedida sobre corridas passadas compartilhadas, e sair
de um longão dependia só de um poll a cada 20s no próprio cliente do
atleta pra parar de te mostrar (best-effort, sem garantia). Mesma
consolidação do parágrafo acima, só que do lado dos eventos: uma Function
só, registrada nos dois eventos de delete, decidindo qual dos dois
handlers rodar olhando o cabeçalho `x-appwrite-event`. Nenhum código do
app precisou mudar: `removeCoachRelationship` e `leaveGroupRun` continuam
só apagando a linha de sempre, e o Appwrite chama essa Function sozinho
assim que a exclusão acontece de verdade, não importa qual lado da
relação a iniciou.

```bash
cd appwrite-functions/row-events
appwrite functions create \
  --function-id row-events --name "Revogar acesso ao sair" \
  --runtime node-22 --entrypoint src/main.js \
  --commands "npm install" \
  --events "databases.*.tables.coach_relationships.rows.*.delete" \
  --events "databases.*.tables.group_run_participants.rows.*.delete" \
  --scopes databases.read --scopes databases.write
appwrite functions create-deployment --function-id row-events --code . --entrypoint src/main.js --commands "npm install" --activate
```

Sem `--execute`, porque nada além do próprio evento do banco deve chamar
essa Function. **`--commands "npm install"` aqui também não é opcional**
— ver a mesma nota logo acima em `client-actions`, achado no mesmo dia
(essa Function tinha o mesmo bug: um único deploy de 6KB, sem
`node_modules`, então toda revogação de acesso — ex-treinador, ex-membro
de longão — vinha falhando silenciosamente desde que essa Function foi
criada).

**Nota sobre `create-deployment` em vez de `appwrite push functions`**:
o comando `push functions` lê a lista de functions de um
`appwrite.config.json` na raiz do projeto — que este repo nunca chegou a
ter (só um `projectId`, escrito à mão como config do cliente CLI). Sem
essa lista, `push functions` responde `function not found` mesmo com a
function já criada. `functions create-deployment --code . --activate`
não depende desse arquivo — sobe e ativa o código do diretório atual
direto pro ID indicado, e foi o comando que realmente funcionou nesta
migração.

**Migração de `send-welcome-email`/`join-group-run` já executada
(2026-08-22)**: essas duas Functions eram deployadas separadamente antes
dessa consolidação — apagadas de verdade (`appwrite functions delete
--function-id <id> --force`) e substituídas por `client-actions`/
`row-events` acima, seguindo exatamente os blocos de deploy documentados.
Confirmado via `appwrite functions list`: só as duas novas, ambas
`ready`. **Pendência que sobrou dessa migração**: `RESEND_API_KEY`
não migra sozinha — o Appwrite não deixa ler o valor de uma variável
secreta já configurada de volta, então ela se perdeu junto com a
`send-welcome-email` antiga. **Se isso ainda não foi feito**: gere uma
chave nova no Resend e configure em Appwrite Console → Functions →
client-actions → Settings → Variables → `RESEND_API_KEY` — até lá, o
e-mail de boas-vindas falha silenciosamente (best-effort, não trava a
criação de conta).

**Se for repetir esse deploy num projeto novo** (não uma migração, uma
instalação do zero): a ordem "apagar as antigas" acima não se aplica,
mas a mesma janela de best-effort vale — entre criar `client-actions` e
configurar `RESEND_API_KEY`/`GEMINI_API_KEY` nela, `sendWelcomeEmail()`/
`suggestPlanOverride()` falham silenciosamente do lado do cliente,
nenhuma trava conta, longão ou plano.

**Política de Privacidade** (`/privacidade`): já publicada junto com o
resto do app — a URL a colar nas duas lojas é
`https://xanthus.app.br/privacidade`.

## Rotação de chaves (LGPD/segurança)

| Chave | Onde | Frequência | Como rotacionar |
|---|---|---|---|
| `APPWRITE_SETUP_API_KEY` | `.env.local`, só usada por `scripts/appwrite-setup.ts` | A cada ~6 meses, ou imediatamente se suspeitar de vazamento | Appwrite Console → Overview → API Keys → gerar uma nova, revogar a antiga, atualizar `.env.local` |
| `NEXT_PUBLIC_MAPTILER_KEY` | `.env.local`, embarcada no bundle público (é uma chave pública por natureza) | Só se abusada (checar cota no [MapTiler Cloud](https://cloud.maptiler.com/)) | Gerar nova no MapTiler Cloud, restringir por domínio (`xanthus.app.br`) antes de trocar |
| `ELEVENLABS_API_KEY` | `.env.local`, só usada por `scripts/generate-voice-bank.ts` (nunca em runtime) | Baixa prioridade — não roda em produção | Gerar nova no ElevenLabs, atualizar `.env.local` |
| `GEMINI_API_KEY` | `.env.local` **e** Appwrite Console → Functions → client-actions → Variables (dois lugares independentes, ver seção de Functions acima) | Se abusada ou ao trocar de modelo | Gerar nova no Google AI Studio, atualizar os dois lugares |
| `RECRAFT_API_KEY` | `.env.local`, server-only, sem uso em código ainda | N/A enquanto não usada | Revogar se decidir não usar; gerar nova quando a feature que a usa for construída |
| `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` | Secret do GitHub Actions (`ios-build.yml`) **e** Appwrite Console → Functions → client-actions → Variables (mesmo valor, dois lugares independentes — ver "Google Sign-In no iOS" acima) | Só se abusada — não é secreta por natureza (client ID "iOS" não tem client secret) | Criar um novo OAuth client "iOS" no Google Cloud Console, atualizar os dois lugares |
| Secrets do GitHub Actions (`APP_STORE_CONNECT_*`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, keystores Android) | GitHub → Settings → Secrets | Seguindo a expiração de cada credencial (ex.: chave `.p8` da Apple não expira sozinha; conta de serviço do Google Play, conforme política do Google Cloud) | Gerar nova nas respectivas consoles, atualizar o secret no GitHub, nunca commitar o arquivo bruto |

Toda chave server-only (sem prefixo `NEXT_PUBLIC_`) já vive só em
`.env.local` (`.gitignore`) e nunca chega ao bundle do navegador — rotacionar
uma delas nunca exige mudança de código, só gerar a nova e substituir no
arquivo. As únicas exceções por natureza são as duas `NEXT_PUBLIC_*`
(Appwrite project ID e MapTiler key), que são públicas por definição e cuja
segurança depende de restrição por domínio/origem no console do provedor,
não de sigilo.

## E-mail transacional (Resend)

Emails disparados pelo backend (welcome, confirmação de exclusão de conta,
e no futuro anúncio de versão/newsletter) usam o [Resend](https://resend.com/).
Como o app é 100% client-side (export estático, sem servidor Next.js
rodando em produção), o envio nunca acontece no navegador — sempre por uma
Appwrite Function invocada com a sessão de quem chama (ação
`send-welcome-email` dentro de `appwrite-functions/client-actions`, ver
seção de Functions acima). A chave da API vive só na configuração da
Function no Appwrite Console, nunca neste repositório nem em
`NEXT_PUBLIC_*` — o app cliente nunca manda e-mail diretamente.

**Por que não é um evento do Appwrite (`users.create`)**: é o gatilho óbvio
à primeira vista, mas o próprio Appwrite documenta esse evento como não
confiável pra contas criadas via OAuth — e Google/Apple são o único login
que este app oferece (ver o comentário do handler `sendWelcomeEmail` em
`appwrite-functions/client-actions/src/main.js`). Em vez disso, o
welcome email é disparado direto do código, no exato momento em que
`createProfile()` roda pela primeira vez (`handle-picker.tsx` →
`sendWelcomeEmail()` em `src/lib/auth.ts`) — o único ponto client-side que
garante "essa conta acabou de nascer", best-effort (nunca bloqueia nem
falha a criação de conta se o envio de e-mail falhar).

**Setup (uma vez):**

1. Cria conta em [resend.com](https://resend.com/) (free tier: 3.000
   e-mails/mês, 100/dia — suficiente pra transacional numa base pequena).
2. **Domains → Add Domain** → `xanthus.app.br`. O Resend mostra os
   registros DNS necessários (SPF, DKIM, e opcionalmente DMARC) — adiciona
   todos no painel da **Cloudflare** (mesma zona onde `xanthus.app.br` já
   está configurado, **DNS → Records**). Não precisa trocar nameserver,
   só adicionar os registros que o Resend pedir.
3. Aguarda o domínio aparecer como **Verified** no Resend — geralmente
   minutos, pode levar até um dia por propagação de DNS.
4. **API Keys → Create API Key** → escopo "Sending access", restrita ao
   domínio `xanthus.app.br` se a opção estiver disponível.
5. Guarda a chave em **Appwrite Console → Functions → client-actions →
   Settings → Variables → `RESEND_API_KEY`** (mesmo lugar que já leva
   `GEMINI_API_KEY`, ver seção de Functions acima) — ela fica só ali, não
   em `.env`/`.env.local` deste repo (que a Appwrite Function nem lê) e
   não em secret do GitHub Actions (isso só seria necessário se um
   disparo de broadcast/newsletter um dia rodar via CI em vez de Appwrite
   Function — nesse caso, use uma chave *separada* da da function, pra
   dar pra revogar uma sem derrubar a outra).
6. Remetente: `noreply@xanthus.app.br` (não precisa de caixa de entrada
   real pra endereço de *remetente*, só do domínio verificado) — diferente
   de `contato@`/`feedback@`, que são os endereços de *recebimento* já
   configurados via Cloudflare Email Routing (ver seção de domínio no
   `PROJECT-CONTEXT.md`); um manda, o outro recebe, são coisas separadas.

O deploy da Function em si (`client-actions`, com o escopo `users.read`
já incluso na lista de scopes da seção acima) é o mesmo bloco de comando
já documentado ali — nenhum deploy separado só pra essa ação.

**LGPD**: e-mail transacional (welcome, confirmação de exclusão) não
precisa de opt-in separado — é execução do serviço. E-mail de
marketing/newsletter precisa, e o Resend deve ser adicionado à lista de
terceiros na `/privacidade` quando o primeiro envio real acontecer (ver
achado M5 da auditoria LGPD de 2026-08-17).

## Notificações push (marcos: boas-vindas, primeira corrida, novo recorde)

Push nativo de verdade (chega mesmo com o app fechado), não um banner
dentro do app — decisão tomada em 2026-08-23. Custo: **zero**. FCM
(Android) e APNs (iOS) não cobram por notificação; APNs usa a mesma
conta Apple Developer já paga. O envio em si passa pelo **Appwrite
Messaging** (`node-appwrite`'s `Messaging.createPush`), não por FCM/APNs
direto — Free plan inclui 1.000 mensagens/mês (cota compartilhada com
e-mail/SMS, que hoje vão pelo Resend em vez disso, então essa cota fica
quase inteira pra push), Pro ($25/mês) libera ilimitado.

**Como funciona**: `src/lib/pushNotifications.ts`'s `registerForPushNotifications()`
pede permissão e registra o token do dispositivo como um Push Target da
própria conta Appwrite (`account.createPushTarget`, chamado direto do
cliente — não é uma ação privilegiada, Appwrite já trata isso como algo
que a própria conta pode fazer). `src/app/push-registration.tsx`
(montado em `layout.tsx`) chama isso assim que `useAuth()` vira
`"signed-in"`. O envio em si é privilegiado — só pode disparar um dos
textos fixos definidos em `MILESTONE_MESSAGES`
(`appwrite-functions/client-actions/src/main.js`), nunca texto livre, e
só pra própria conta de quem chamou (`users: [userId]` sempre resolve
pro `x-appwrite-user-id` da sessão) — ação `send-milestone-notification`
dentro da Function consolidada, chamada via
`src/lib/milestoneNotifications.ts`'s `sendMilestoneNotification()` nos
pontos reais do app onde um marco acontece (`handle-picker.tsx` pro
boas-vindas, o efeito de detecção de PR em `run/page.tsx` pra primeira
corrida/novo recorde).

**Setup (feito em 2026-08-23 — este README ficou desatualizado por um
tempo dizendo "ainda pendente" depois disso; corrigido em 2026-08-24
depois do dono do projeto mostrar print do Appwrite Console confirmando
os dois providers `enabled`):**

1. **Firebase** (Android): projeto real criado (`xanthus-1ee15`), Cloud
   Messaging ativo, `google-services.json` real commitado em
   `android/app/` (commit `26588e8`, confirmado pacote `com.xanthus.app`).
2. **Apple Push Notifications** (iOS): chave APNs criada em
   developer.apple.com, capability **Push Notifications** habilitada no
   App ID `com.xanthus.app`.
3. **Appwrite Console → Messaging → Providers**: os dois providers
   existem e aparecem **enabled** — `apns` ("APNs (Xanthus iOS)") e `fcm`
   ("FCM (Xanthus Android)"), IDs batendo com `PROVIDER_ID` em
   `src/lib/pushNotifications.ts`.
4. Escopo **`messages.write`** na chave da Function `client-actions` —
   **não confirmado por print ainda**; se `Messaging.createPush` voltar a
   falhar com permissão negada, é o primeiro lugar a checar.
5. **Testado em dispositivo Android real em 2026-08-23**: achado e
   corrigido um bug de verdade nesse teste — faltava
   `android.permission.POST_NOTIFICATIONS` no `AndroidManifest.xml`
   (obrigatória desde Android 13/API 33), então a notificação de marco
   nunca aparecia mesmo com Function/provider/gatilho todos corretos
   (commit `8a59ac9`). iOS: implementado (`9aea2ae`), **ainda não
   confirmado testado num aparelho real**.

Ou seja: ao contrário do que este arquivo dizia antes, o setup de
console **já foi feito** — não é mais um passo pendente. O que falta
confirmar é só o item 4 (escopo da Function) e um teste real em iPhone.

### Aviso de "nova versão disponível" (Android e iOS)

Empurra quem já está logado e com push registrado pra abrir o app assim
que um build novo termina de publicar — diferente do sininho passivo em
`/notificacoes` (que só quem abre o app vê), esse chega mesmo com o app
fechado. **Alcance real: só contas logadas** — o app grava corrida sem
conta pra maioria dos atletas, e registrar um Push Target sempre exige
uma sessão Appwrite; sem repensar a arquitetura de sessão anônima pro app
inteiro (fora de escopo aqui), quem nunca fez login continua só vendo o
sininho passivo no Android e a notificação nativa do TestFlight no iOS.

Mecanismo: dois **tópicos** do Appwrite Messaging, `android-updates` e
`ios-updates` (criados uma vez via script, ver git history de
`.setup-update-topics.mjs` — um tópico é agnóstico de provider FCM/APNs,
só agrupa alvos). `registerForPushNotifications()` inscreve o Push Target
recém-criado no tópico do seu SO chamando a ação `subscribe-update-topic`
em `client-actions`. O CI (`.github/workflows/android-build.yml`, job
`release`, step "Notify Android accounts...") dispara o aviso pro tópico
`android-updates` assim que o link público do APK é confirmado — direto
via `curl` na REST API do Appwrite Messaging (`POST
/messaging/messages/push`), não pelo SDK, pra não precisar instalar
`node-appwrite` só nesse step do CI. Precisa de um secret novo no GitHub:

- **`APPWRITE_MESSAGING_API_KEY`** — chave de API do Appwrite Console
  (Overview → API Keys) com **só** o escopo `messages.write` marcado
  (não reusar a `APPWRITE_SETUP_API_KEY` aqui — essa é de uso local, sem
  escopo restrito, e não devia circular em mais lugares do que precisa).
  Sem esse secret configurado, o step avisa com `::warning::` e segue em
  frente (`continue-on-error: true`) — nunca derruba o deploy do
  APK/site por causa disso.

O equivalente pro iOS (tópico `ios-updates`, step "Notify iOS accounts..."
em `ios-build.yml`, logo depois do upload pro TestFlight) **também está
implementado** — decisão explícita de não depender só da notificação
nativa do TestFlight (que só existe enquanto o app estiver nesse canal;
some assim que virar uma release de verdade na App Store). Mesmo mecanismo
do Android: `messageId` chaveado no número do run do GitHub Actions
(`GITHUB_RUN_NUMBER`, a mesma fonte do número de build do `xcodebuild
archive` acima) pra um re-run do mesmo build não notificar duas vezes.
`updateCheck.ts` (o sininho passivo em `/notificacoes`) continua
Android-only — esse push não abre nenhuma tela nova no iOS, só usa o
mesmo "puxão pra abrir o app" que o Android já tinha.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. A gravação de corrida (`/run`) precisa de
HTTPS ou `localhost` para a Geolocation API e o Wake Lock funcionarem — em
produção isso é automático.

## Arquitetura do tracking

O núcleo fica em `src/lib/tracking/`:

- **`geolocation.ts`** — dois backends de GPS por trás da mesma interface
  (`beginGeoWatch`/`endGeoWatch`), escolhidos por plataforma. Na web,
  `@capacitor/geolocation` (que cai pro `navigator.geolocation` sozinho).
  No nativo, `@capacitor-community/background-geolocation` — o
  `watchPosition` do primeiro só entrega fix com a WebView visível; tela
  bloqueada ou app em segundo plano pausa, que é exatamente o problema que
  motivou ir pra nativo. O plugin de background roda um foreground service
  de verdade no Android (a notificação persistente é obrigatória pelo
  próprio Android pra manter isso vivo) e pede autorização "Always" no
  iOS. **Só testado contra Capacitor 7** (`npx cap sync` avisa isso) —
  precisa validar em aparelho real antes de confiar. No iOS, mesmo com
  "Always", a entrega de fix pra dentro da WKWebView suspensa tende a vir
  em lote só quando o app volta ao primeiro plano, não como fluxo
  contínuo — limite estrutural do modelo de WebView, não bug do plugin.
  `capacitor.config.ts` liga `android.useLegacyBridge` (sem isso, os fixes
  param de chegar ~5min depois da tela travar) e `ios/App/App/Info.plist`
  declara `NSLocationAlwaysAndWhenInUseUsageDescription` +
  `UIBackgroundModes: [location]` — a Apple revisa essa justificativa até
  pra TestFlight (Internal Testing não, só External).
- **`geoFilter.ts`** — filtro Kalman escalar para posição, EWMA para
  velocidade, e os três gates que descartam GPS ruim: acurácia, salto
  implausível de velocidade e drift parado. Prefere `coords.speed`
  (Doppler, vindo do próprio chip GNSS) a derivar velocidade da posição —
  é a fonte mais estável disponível no navegador.
- **`useRunTracker.ts`** — hook React que liga tudo: `watchPosition`,
  aquecimento do GPS antes de começar a contar, anúncio de pace por voz a
  cada X metros (configurável), Wake Lock, e persistência periódica no
  IndexedDB para não perder a corrida numa queda de sinal ou reload.
- **`speech.ts`** — avisos por voz via Speech Synthesis. No iOS precisa
  ser destravado por um gesto do usuário (feito no botão "Iniciar").
- **`wakeLock.ts`** — mantém a tela ligada durante a corrida; reaquire
  sozinho, porque o navegador libera o lock ao trocar de app.
- **`storage.ts`** — IndexedDB: corrida ativa (para recuperar de um
  crash/reload) e histórico de corridas concluídas.

## Roadmap

1. **Loop de gravação** (este scaffold) — pace estável, aviso por voz,
   previsão de chegada. Se isso não for confiável, nada mais importa.
2. Gráficos de progresso e histórico.
3. Card animado compartilhável, alimentado pelos dados já validados do
   passo 1 — não antes disso.
4. Plano de treino por template.
5. Export/import de dados e cross-post automático para o Strava (em vez
   de forçar o usuário a escolher entre os dois apps).

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS v4, embarcado nos apps
nativos via Capacitor (sem manifest/service worker — não é mais PWA).
Mapa (MapLibre) e backend
(Supabase: auth, Postgres, storage) entram no passo 2, quando o histórico
de corridas precisar de mapa e sincronização entre dispositivos.
