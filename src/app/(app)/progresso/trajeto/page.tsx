"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, Screen } from "../../ui";
import { RouteGroupDetail } from "./route-group-detail";

/**
 * Query-string route (`?anchor=`), same reasoning as
 * /historico/detalhe's `?id=` — a matched-run group's anchor id is a run id
 * generated per-device in IndexedDB, nothing to give `generateStaticParams`
 * a build-time list for.
 */
export default function TrajetoPage() {
  return (
    <Suspense fallback={null}>
      <TrajetoContent />
    </Suspense>
  );
}

function TrajetoContent() {
  useHeaderClose("/perfil?tab=progresso");
  const params = useSearchParams();
  const anchor = params.get("anchor");

  if (!anchor) {
    return (
      <Screen>
        <Card>
          <CardTitle>Nenhum trajeto selecionado</CardTitle>
          <Link href="/perfil?tab=progresso" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pro progresso
          </Link>
        </Card>
      </Screen>
    );
  }

  return <RouteGroupDetail anchorRunId={anchor} />;
}
