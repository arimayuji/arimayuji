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
pra sideload; o iOS builda pro Simulator (sem assinatura, então roda sem
conta Apple) só pra validar que o projeto compila — build assinado pra
TestFlight/dispositivo físico é um passo manual à parte, que exige Xcode
num Mac e uma conta Apple Developer paga.

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
