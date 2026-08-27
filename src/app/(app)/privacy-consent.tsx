"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptPrivacy, hasAcceptedPrivacy } from "@/lib/consent";
import { ModalPortal } from "./modal-portal";

/**
 * First-launch privacy gate — the explicit acceptance LGPD Art. 8 asks for,
 * which the app previously didn't have at all (it leaned entirely on the
 * operating system's location pop-up, which consents to the sensor, not to
 * what we do with the reading).
 *
 * Three things this deliberately does *not* do:
 *
 * - It doesn't offer a "recusar" button. The app's core function is
 *   recording your runs onto your own device; there is no version of it that
 *   works while refusing that, so a decline button would either be a lie or
 *   an exit door. Declining here means not using the app, and saying so
 *   plainly beats a button that closes the app.
 * - It doesn't render on `/privacidade`. The whole screen is worthless if
 *   you can't read the policy before agreeing to it, so the gate steps
 *   aside for exactly that route and comes back when you leave it.
 * - It doesn't summarise the policy loosely. Every bullet below states a
 *   real behaviour of this codebase (local-first storage, the account-only
 *   server data, the MapTiler elevation call) — the point of the screen is
 *   that someone who reads only this still knows the true shape of it.
 */
export function PrivacyConsentGate() {
  const pathname = usePathname();
  const [accepted, setAccepted] = useState(true);

  // Same SSR-safe-mount reasoning as ModalPortal's own: `localStorage` can't
  // be read during the static render, and starting from `true` (rather than
  // `false`) means the gate never flashes on screen for someone who already
  // accepted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAccepted(hasAcceptedPrivacy()), []);

  if (accepted || pathname === "/privacidade") return null;

  const handleAccept = () => {
    acceptPrivacy();
    setAccepted(true);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-7 py-12">
          <div className="pr-enter flex flex-col gap-3.5">
            <h2 className="font-mono text-2xl font-semibold text-balance">
              Antes de começar
            </h2>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Em resumo, o que o Xanthus faz com seus dados:
            </p>
          </div>

          <ul className="pr-enter flex flex-col gap-5 text-sm leading-relaxed text-muted">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <strong className="text-foreground">Suas corridas ficam neste aparelho.</strong>{" "}
                Rota, ritmo, distância e splits são gravados localmente. Sem conta, nada disso
                sai daqui.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <strong className="text-foreground">Conta é opcional.</strong> Só se você entrar
                com Google ou Apple guardamos nome, e-mail e foto no servidor — e só pra recursos
                sociais, como amigos, treinador(a) e ranking de lugares.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <strong className="text-foreground">A rota vai pra MapTiler</strong> pra calcular
                o ganho de elevação depois da corrida — só as coordenadas, sem identificar você.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <strong className="text-foreground">Você apaga quando quiser.</strong> Desinstalar
                limpa o que está no aparelho; se tiver conta, Perfil → Excluir conta apaga o resto,
                sem volta.
              </span>
            </li>
          </ul>

          <div className="pr-enter flex flex-col gap-5">
            <Link
              href="/privacidade"
              className="text-center text-sm font-medium underline underline-offset-4 hover:text-accent"
            >
              Ler a política de privacidade completa
            </Link>
            <button
              type="button"
              onClick={handleAccept}
              className="w-full rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
            >
              Li e aceito
            </button>
            <p className="text-center text-xs leading-relaxed text-muted text-pretty">
              O Xanthus grava corridas no seu aparelho — sem aceitar isso, não há app pra usar.
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
