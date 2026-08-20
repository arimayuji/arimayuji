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
        title="Privacidade"
        subtitle="O que o Xanthus guarda, onde, e como apagar tudo quando quiser."
      />

      <Screen>
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
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted">
            <li>— Nome, e-mail e foto vindos da sua conta Google/Apple</li>
            <li>— Nome de usuário (handle) e nome de exibição que você escolher</li>
            <li>— Amizades e vínculos de treinador(a)/aluno(a) que você criar</li>
            <li>— Avaliações de lugares pra correr que você publicar</li>
            <li>— Corridas que você escolher explicitamente compartilhar (com um(a) treinador(a) ou ao vivo)</li>
          </ul>
        </Card>

        <Card className="pr-enter" style={delay(120)}>
          <CardTitle>Dados sensíveis (dores, esforço percebido)</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Registros de dor/desconforto e RPE (esforço percebido) que você marcar durante uma
            corrida ficam no armazenamento local do aparelho, junto com o resto da corrida — não
            são enviados aos nossos servidores a menos que você compartilhe aquela corrida
            específica com um(a) treinador(a).
          </p>
        </Card>

        <Card className="pr-enter" style={delay(160)}>
          <CardTitle>Serviços de terceiros</CardTitle>
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted">
            <li>
              <strong className="text-foreground">Appwrite</strong> — hospeda conta, perfil e os
              dados compartilhados listados acima.
            </li>
            <li>
              <strong className="text-foreground">MapTiler</strong> — calcula elevação da rota;
              recebe só as coordenadas da corrida, sem identificar você.
            </li>
            <li>
              <strong className="text-foreground">Cloudflare</strong> — hospeda o app e os mapas
              (tiles); vê seu IP como qualquer acesso a um site.
            </li>
            <li>
              <strong className="text-foreground">Google / Apple</strong> — provedores de
              login, caso você escolha entrar com uma dessas contas.
            </li>
          </ul>
        </Card>

        <Card className="pr-enter" style={delay(200)}>
          <CardTitle>Apagar sua conta e seus dados</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Em <strong className="text-foreground">Perfil → Excluir conta</strong>, dentro do
            app: apaga a conta, o perfil e tudo que você compartilhou com outras pessoas (amigos,
            treinador, avaliações), imediatamente e sem volta. O que fica só no aparelho (Fase
            local acima) você apaga desinstalando o app ou limpando os dados do site.
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
