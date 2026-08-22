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

**Exclusão de conta** (`/perfil`): obrigatória pela guideline 5.1.1(v) da
App Store sempre que o app permite criar conta. O SDK cliente do Appwrite
não tem um jeito de auto-excluir a conta (só `deleteSession`/
`deleteIdentity`) — apagar de verdade exige a API privilegiada de Users,
então isso roda como Appwrite Function, nunca no cliente. Ver
`appwrite-functions/client-actions` (ação `delete-account`) abaixo.

**Entrar num "longão"**, **criar a primeira linha de
`profiles`/`profile_stats`/`place_run_stats`**, **salvar/sugerir um
override de treinador no plano do aluno**, e **enviar o e-mail de
boas-vindas** — cinco ações privilegiadas diferentes, cinco motivos
diferentes pra não serem uma escrita direta do cliente (ver o comentário
de cada handler em `appwrite-functions/client-actions/src/main.js` pro
raciocínio específico de cada uma), mas **uma Function só**,
`client-actions`, despachando por um campo `action` no corpo da
requisição.

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
  --execute users \
  --scopes users.read --scopes users.write --scopes databases.read \
  --scopes databases.write --scopes files.write
appwrite push functions
```

Depois, no Appwrite Console → Functions → client-actions → **Settings →
Variables**, adiciona:
- `RESEND_API_KEY` — usada pela ação `send-welcome-email` (ver "E-mail
  transacional (Resend)" abaixo pra como conseguir uma).
- `GEMINI_API_KEY` — usada pela ação `suggest-plan-override`, mesmo valor
  já presente em `.env.local`.

O `--execute users` restringe a chamada a usuários autenticados — todas as
seis ações exigem sessão, nenhuma é pensada pra ser chamada anônima. Rode
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
  --events "databases.*.tables.coach_relationships.rows.*.delete" \
  --events "databases.*.tables.group_run_participants.rows.*.delete" \
  --scopes databases.read --scopes databases.write
appwrite push functions
```

Sem `--execute`, porque nada além do próprio evento do banco deve chamar
essa Function.

**Migrando de `send-welcome-email`/`join-group-run` (já em produção)**:
essas duas Functions eram deployadas separadamente antes dessa
consolidação e continuam rodando até serem apagadas de verdade — IDs de
Function não são renomeáveis nem "fundem" com outra, então a virada exige
apagar as antigas e deployar `client-actions`/`row-events` em seguida:

```bash
appwrite functions delete --function-id send-welcome-email --force
appwrite functions delete --function-id join-group-run --force
# depois disso, os dois blocos de deploy acima já cabem nas vagas livres
```

Faça isso só depois de `client-actions` já estar com o código pronto e
testado localmente (`node --check` nos dois `main.js`) — entre apagar as
antigas e o deploy das novas terminar, `sendWelcomeEmail()`/
`joinGroupRun()` falham silenciosamente do lado do cliente (ambas já são
best-effort/com fallback de erro, nenhuma trava a conta ou o longão), mas
o ideal é manter essa janela a mais curta possível.

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
