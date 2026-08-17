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
| Landing page + PWA | Cloudflare Workers — domínio próprio `xanthus.app.br` já no ar como Custom Domain (2026-08-17), `xanthus.yujiarima.workers.dev` continua respondendo em paralelo (é o subdomínio padrão do Worker, nunca desliga) |
| Backend | Appwrite Cloud (auth, banco: `runs`, `live_runs`, `friendships`, `coach_relationships`, `place_ratings`, `run_comments`) |
| Download Android (APK) | `https://xanthus.app.br/download` — página de instruções (não mais o link cru do `.apk`), publicada automático a cada push em `main` |
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
  - **Maquete pedida, nunca chegou a ser criada**: o plano era reaproveitar
    o padrão `ExampleBadge` (tag amarela "exemplo ilustrativo", já existe
    em `src/app/(app)/ui.tsx`) pra montar uma tela/card de frequência
    cardíaca com dado fictício e claramente rotulado, **antes** de mexer em
    plugin/permissão nativa de verdade. Isso nunca foi construído — a sessão
    anterior só chegou a grepar por `ExampleBadge` e foi puxada pra outros
    itens pendentes (login nativo quebrado). Nenhum arquivo, tela ou mockup
    desse recurso existe no repo hoje.
  - **Próximos passos combinados, em ordem**: 1) tela/toggle de
    consentimento em `/perfil` (não feito) → 2) card maquete com dado falso
    rotulado via `ExampleBadge` (não feito) → 3) só depois de aprovar a
    maquete, integração real com `capacitor-health` + permissões nativas
    nos dois projetos (não iniciado).

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
