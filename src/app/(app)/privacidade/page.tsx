"use client";

import { useHeaderClose } from "../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../ui";

/**
 * Exigência de submissão (App Store guideline 5.1.1 e Play Console Data
 * Safety) e não só formalidade: precisa ser uma URL pública real, listada
 * nas fichas das duas lojas. Conteúdo reflete o que o código de fato faz —
 * ver src/lib/tracking/storage.ts (dados locais) e src/lib/auth.ts +
 * scripts/appwrite-setup.ts (dados remotos), não uma lista genérica.
 */
export default function PrivacidadePage() {
  useHeaderClose("/perfil");
  return (
    <>
      <ScreenHeader
        panel
        title="Privacidade"
        subtitle="O que o Xanthus guarda, onde, e como apagar tudo quando quiser."
      />

      <Screen panel>
        <Card className="pr-enter" style={delay(40)}>
          <CardTitle>Dados guardados só no seu aparelho</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Toda corrida gravada — rota GPS, ritmo, distância, splits — fica salva localmente no
            seu aparelho (IndexedDB), mesmo sem conta. Se você nunca fizer login, esses dados
            nunca saem do aparelho. Desinstalar o app ou limpar os dados do navegador apaga tudo
            isso permanentemente, sem como recuperar.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(80)}>
          <CardTitle>Dados enviados aos nossos servidores</CardTitle>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            Só quando você cria conta (login com Google ou Apple) — usada em recursos
            opcionais como avaliar lugares, adicionar amigos ou compartilhar com um(a)
            treinador(a). Nesse caso guardamos, na nossa infraestrutura Appwrite:
          </p>
          <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
            <li>— Nome, e-mail e foto vindos da sua conta Google/Apple</li>
            <li>— Nome de usuário (handle) e nome de exibição que você escolher</li>
            <li>— Amizades e vínculos de treinador(a)/aluno(a) que você criar</li>
            <li>— Avaliações de lugares pra correr que você publicar</li>
            <li>
              — Km total acumulado e número de corridas, sincronizado automaticamente a cada
              corrida enquanto você tiver conta — usado só na sua tela de perfil visível a amigos
              que você aceitar
            </li>
            <li>
              — Se você ligar o &quot;Ranking de lugares&quot; (desligado por padrão, em Perfil):
              km acumulado por lugar sob o nome de exibição que você escolher, público pra
              qualquer pessoa dentro do app
            </li>
            <li>— Corridas que você escolher explicitamente compartilhar (com um(a) treinador(a) ou ao vivo)</li>
          </ul>
        </Card>

        <Card className="pr-enter" style={delay(120)}>
          <CardTitle>Dados sensíveis (dores, esforço percebido)</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Registros de dor/desconforto e RPE (esforço percebido) que você marcar durante uma
            corrida ficam sempre no armazenamento local do aparelho, junto com o resto da corrida
            — mesmo quando você compartilha aquela corrida com um(a) treinador(a), só a rota, a
            distância, a duração e o tênis usado vão pro servidor; dor e esforço percebido nunca
            saem do seu aparelho.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(140)}>
          <CardTitle>Dados do seu smartwatch (Apple Health / Health Connect)</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Se você ligar &quot;Ler dados de saúde&quot; (desligado por padrão, em Perfil → Dados do
            relógio), o app lê frequência cardíaca, calorias, passos, frequência cardíaca em
            repouso, variabilidade de frequência cardíaca (HRV), VO2 máx estimado e sono do
            repositório de saúde do próprio celular — nunca fala com o relógio direto — e mostra
            esses números junto com a corrida correspondente no seu Histórico. É dado sensível
            (LGPD Art. 11): fica só nesse fluxo, nunca é enviado a servidor nenhum, e a leitura
            para completamente assim que você desliga essa chave.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(160)}>
          <CardTitle>Serviços de terceiros</CardTitle>
          <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
            <li>
              <strong className="text-foreground">Appwrite</strong> — hospeda conta, perfil e os
              dados compartilhados listados acima.
            </li>
            <li>
              <strong className="text-foreground">MapTiler</strong> — calcula elevação da rota;
              recebe só as coordenadas da corrida, sem identificar você.
            </li>
            <li>
              <strong className="text-foreground">Open-Meteo</strong> — dá a previsão do tempo pra
              corrida, só quando você toca em &quot;Ver previsão&quot; em /run; recebe só a
              coordenada daquele momento, sem identificar você.
            </li>
            <li>
              <strong className="text-foreground">Cloudflare</strong> — hospeda o app e os mapas
              (tiles); vê seu IP como qualquer acesso a um site.
            </li>
            <li>
              <strong className="text-foreground">Google / Apple</strong> — provedores de
              login, caso você escolha entrar com uma dessas contas.
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> — envia o e-mail de boas-vindas
              quando você cria conta; recebe seu e-mail e nome só pra isso.
            </li>
            <li>
              <strong className="text-foreground">Apple (iTunes Search)</strong> — busca de
              música pro card de compartilhamento; recebe só o termo que você digitar.
            </li>
          </ul>
        </Card>

        <Card className="pr-enter" style={delay(180)}>
          <CardTitle>Créditos</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            O modelo 3D de tênis (vitrine em Perfil → Meus tênis) é{" "}
            <a
              href="https://sketchfab.com/3d-models/running-shoe-759202749ca548c09d7cad02046588d8"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-accent"
            >
              &quot;Running Shoe&quot;
            </a>{" "}
            por{" "}
            <a
              href="https://sketchfab.com/shyambhanushali3"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-accent"
            >
              shyambhanushali3
            </a>
            , licenciado sob{" "}
            <a
              href="http://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-accent"
            >
              CC BY 4.0
            </a>{" "}
            — recolorimos os materiais pra bater com a paleta do app, a geometria é a original.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(200)}>
          <CardTitle>Apagar sua conta e seus dados</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Em <strong className="text-foreground">Perfil → Excluir conta</strong>, dentro do
            app: apaga a conta, o perfil, a foto, o total acumulado, o ranking de lugares e tudo
            que você compartilhou com outras pessoas (amigos, treinador, avaliações, corridas em
            grupo), imediatamente e sem volta. O que fica só no aparelho (Fase local acima) você
            apaga desinstalando o app ou limpando os dados do site.
          </p>
        </Card>

        <p className="pr-enter text-center text-xs leading-relaxed text-muted text-pretty" style={delay(240)}>
          Dúvida sobre privacidade? Escreva pra{" "}
          <a href="mailto:contato@xanthus.app.br" className="underline underline-offset-2 hover:text-accent">
            contato@xanthus.app.br
          </a>
          .
        </p>
      </Screen>
    </>
  );
}
