"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { completeAuthorization } from "@/lib/spotify/auth";

/**
 * Where Spotify redirects back to after the athlete approves (or denies)
 * access. This screen only exists for the few seconds the token exchange
 * takes — nothing here is part of the app shell, on purpose.
 */
export default function SpotifyCallbackPage() {
  const [result, setResult] = useState<"pending" | "ok" | "error">("pending");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    completeAuthorization(params).then((outcome) => {
      setResult(outcome.ok ? "ok" : "error");
      if (outcome.ok) {
        window.setTimeout(() => window.location.replace("/perfil"), 900);
      }
    });
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      {result === "pending" && (
        <>
          <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
          <p className="text-sm text-muted">Conectando ao Spotify&hellip;</p>
        </>
      )}
      {result === "ok" && <p className="text-sm text-good">Conectado. Voltando ao perfil&hellip;</p>}
      {result === "error" && (
        <>
          <p className="text-sm text-bad">Não deu pra conectar ao Spotify.</p>
          <Link href="/perfil" className="text-sm text-accent underline underline-offset-2">
            Voltar pro perfil
          </Link>
        </>
      )}
    </div>
  );
}
