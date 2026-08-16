# Xanthus

Um app de corrida construído em cima das dores mais reclamadas do
segmento (Strava, Nike Run Club, Runkeeper, Adidas Running, Komoot,
MapMyRun, Garmin Connect): preço que muda o combinado depois, GPS em que
ninguém confia, dados presos, suporte ausente.

## PWA + app nativo (Capacitor)

O produto nasceu como PWA pura e continua sendo servido assim
(`npm run build` → Cloudflare Workers). Quando o tracking em segundo plano
(tela apagada) virou um problema real — GPS que para ou perde precisão com
a tela bloqueada, que nenhuma PWA resolve — o app ganhou também um shell
nativo via [Capacitor](https://capacitorjs.com/) nas pastas `android/` e
`ios/`.

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

**Baixar o APK**: <https://xanthus.yujiarima.workers.dev/download/xanthus.apk>
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

## Prontidão pra revisão das lojas

**Sign in with Apple** (`src/lib/auth.ts`): obrigatório pela guideline 4.8
da App Store sempre que o app oferece login social de terceiro (aqui,
Google) — sem ele a submissão é rejeitada. Configuração no lado da Apple
(exige a mesma conta Apple Developer Program do TestFlight):

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) →
   Identifiers → **+** → **Services IDs** → cria um identificador **diferente**
   do bundle ID do app (ex: `com.xanthus.app.signin`), habilita **Sign in
   with Apple**, e configura o domínio (`xanthus.yujiarima.workers.dev`) e a
   Return URL — o valor exato da Return URL está na tela do provedor "Apple"
   dentro do Appwrite Console (Auth → Settings → OAuth2 Providers).
2. **Keys** → **+** → habilita **Sign in with Apple**, associa ao App ID
   principal (`com.xanthus.app`) → baixa o `.p8` (só uma vez).
3. No **Appwrite Console** → Auth → Settings → OAuth2 Providers → **Apple**:
   habilita e preenche Client ID (o Services ID do passo 1), Team ID, Key ID
   e o conteúdo do `.p8` do passo 2 — confira os nomes exatos dos campos na
   tela, podem variar entre versões do Appwrite.

Não precisa de nenhuma mudança no projeto Xcode/`ios/App` — o fluxo passa
pelo endpoint OAuth2 padrão da Apple (`appleid.apple.com`) do mesmo jeito
que Google e Microsoft já funcionam aqui, sem SDK nativo nem entitlement.

**Exclusão de conta** (`appwrite-functions/delete-account`): obrigatória
pela guideline 5.1.1(v) da App Store sempre que o app permite criar conta.
O SDK cliente do Appwrite não tem um jeito de auto-excluir a conta (só
`deleteSession`/`deleteIdentity`) — apagar de verdade exige a API
privilegiada de Users, então isso roda como uma **Appwrite Function**
separada, nunca no cliente. Deploy (via [Appwrite CLI](https://appwrite.io/docs/tooling/command-line/installation)):

```bash
cd appwrite-functions/delete-account
appwrite functions create \
  --function-id delete-account --name "Excluir conta" \
  --runtime node-22 --entrypoint src/main.js \
  --execute users
appwrite push functions
```

Depois, no Appwrite Console → Functions → delete-account → **Settings →
API key scopes**, marca `users.write` e `databases.write` — é isso que dá
à function a chave dinâmica (por execução, sem secret fixo guardado)
necessária pra apagar a conta e as linhas do usuário nas tabelas
`friendships`, `coach_relationships`, `place_ratings`, `runs`, `live_runs`
e `run_comments`. O `--execute users` restringe quem pode chamar a
function a usuários autenticados — Appwrite identifica automaticamente
quem está chamando pela própria sessão, sem o cliente precisar informar
nada.

**Política de Privacidade** (`/privacidade`): já publicada junto com o
resto do app — a URL a colar nas duas lojas é
`https://xanthus.yujiarima.workers.dev/privacidade`.

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

Next.js (App Router) + TypeScript + Tailwind CSS v4, PWA instalável
(manifest + service worker de app-shell). Mapa (MapLibre) e backend
(Supabase: auth, Postgres, storage) entram no passo 2, quando o histórico
de corridas precisar de mapa e sincronização entre dispositivos.
