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
em que ninguém confia, dados presos, suporte ausente. Nasceu PWA pura,
hoje é PWA + apps nativos (Android e iOS via Capacitor) — a ida pra nativo
foi motivada por um problema real e não resolvível em PWA pura: o GPS
perde precisão ou para de vez com a tela travada.

Nome de código no repo: `xanthus` / "Pegasus Run" (aparece nas duas formas
no histórico de tasks — mesmo projeto).

## Onde cada coisa mora

| Camada | Onde |
|---|---|
| Landing page + PWA | Cloudflare Workers, `xanthus.yujiarima.workers.dev` (domínio próprio `xanthus.app.br` sendo configurado — ver seção Domínio abaixo) |
| Backend | Appwrite Cloud (auth, banco: `runs`, `live_runs`, `friendships`, `coach_relationships`, `place_ratings`, `run_comments`) |
| Download Android (APK) | `https://xanthus.yujiarima.workers.dev/download/xanthus.apk` — link fixo, sem expirar, publicado automático a cada push em `main` |
| App nativo Android | `android/` (Capacitor), CI em `.github/workflows/android-build.yml` |
| App nativo iOS | `ios/` (Capacitor), CI em `.github/workflows/ios-build.yml` |
| Repositório | `arimayuji/arimayuji` no GitHub |

## Status das contas de desenvolvedor (na data deste documento)

- **Apple Developer Program**: **configurada e ativa** (paga, US$99/ano).
  É essa conta que assina os builds de TestFlight e viabiliza Sign in with
  Apple. Os secrets (`APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
  `APP_STORE_CONNECT_API_KEY_P8`) já estão configurados no repo — o CI builda
  e sobe automaticamente pro TestFlight a cada push em `main`.
- **Google Play Developer**: conta criada, mas a **verificação ainda não foi
  concluída**. Até isso fechar, a distribuição Android é só via APK direto
  (sideload, link acima) — o fluxo de publicação real na Play Store (`.aab`
  assinado, track "internal" do Play Console) já está todo documentado e
  pronto no `README.md`, só falta a conta terminar de verificar e o secret
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` ser configurado.

## Onde cada plataforma está no funil de lançamento

A landing page (`src/app/page.tsx`) oferece três caminhos, peso igual, sem
uma opção escondendo as outras:

1. **Navegador (PWA)** — "Abrir agora", direto pro `/run`. Funciona sem
   instalar nada; GPS pausa se a tela travar.
2. **Android** — botão "Baixar APK", direto pro link fixo do Cloudflare.
   App instalado de verdade, GPS não pausa com tela travada.
3. **iPhone** — **sem botão de download**, só um badge "Em teste fechado".
   Hoje só quem já foi convidado pro **TestFlight Internal Testing**
   consegue instalar. **Ainda não foi submetido pra revisão da App Store**
   nem aberto External Testing — é upload automático pro TestFlight a cada
   push, promoção pra teste/produção continua manual.

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

## Domínio e e-mail

- `xanthus.app.br` — registrado como Web Platform no Appwrite Console
  (Overview → Platforms → Add Platform → Web App).
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
- **Compartilhamento**: card de corrida (`/compartilhar`), link direto
  por corrida (`?run=id`).
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

## Ferramentas externas usadas no projeto

- Design/animações/logo: **não documentado ainda** — a sessão de
  2026-08-17 mencionou "a gente usa [uma IA] pra fazer algumas animações
  e logos" mas a frase foi cortada antes do nome da ferramenta. Ver
  Perguntas em aberto.

## Perguntas em aberto (preencher quando puder)

- [ ] Qual ferramenta/IA é usada pra animações e logos do Xanthus?
- [ ] A conta de desenvolvedor do Google Play já terminou a verificação?
      Se sim, falta só configurar o secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
- [ ] Existe prazo/meta pra submeter o iOS pra revisão real da App Store
      (não só TestFlight Internal Testing)?
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
