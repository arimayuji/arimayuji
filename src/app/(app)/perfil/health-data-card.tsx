"use client";

import Link from "next/link";
import { usePreferences } from "@/lib/usePreferences";
import { Card, CardTitle, delay, NoticeBadge } from "../ui";

/** Same register as the bottom-nav icons in app-shell.tsx: stroke-only, 1.7 weight, round joins. */
const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HeartbeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 12h3.5l1.8-4.5L11 17l2.5-9 1.8 4.5H21" />
    </svg>
  );
}

/**
 * Preview + link-out card for the smartwatch health-data pipeline
 * (`src/lib/health.ts`) — extracted out of `/perfil` so it can live inside
 * the "Dados pessoais" widget instead, alongside the other properties of the
 * athlete (peso, dores, tênis, playlists) rather than mixed in with run-
 * experience settings.
 */
export function HealthDataCard() {
  const [prefs] = usePreferences();

  return (
    <Card className="pr-enter" style={delay(300)}>
      <CardTitle aside={<NoticeBadge>{prefs.healthDataConsent ? "ativado" : "desligado"}</NoticeBadge>}>
        Dados de saúde do smartwatch
      </CardTitle>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
          <HeartbeatIcon className="h-5 w-5" />
        </span>
        <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
          Frequência cardíaca, calorias medidas de verdade, passos, FC em repouso, HRV, VO2
          máx e sono — lidos do HealthKit (iPhone) ou do Health Connect (Android) e atrelados a
          cada corrida no Histórico.
        </p>
      </div>
      <Link
        href="/perfil/relogio"
        className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
      >
        <span className="text-muted">Como funciona, e onde aparece</span>
        <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold">Abrir</span>
      </Link>
    </Card>
  );
}
