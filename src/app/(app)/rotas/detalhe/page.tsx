"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, Screen, SPAN_COLUMNS } from "../../ui";
import { RouteDetail } from "./route-detail";

/**
 * A query-string route (`?id=`), not a `[id]` dynamic segment — same
 * reasoning as historico/detalhe/page.tsx: a custom route's id is generated
 * by Appwrite and never exists at build time, so there's no
 * `generateStaticParams` list to give a static export for a real dynamic
 * segment.
 */
export default function DetalheRotaPage() {
  return (
    <Suspense fallback={null}>
      <DetalheRotaContent />
    </Suspense>
  );
}

function DetalheRotaContent() {
  const params = useSearchParams();
  const id = params.get("id");

  if (!id) {
    return (
      <Screen>
        <Card className={SPAN_COLUMNS}>
          <CardTitle>Nenhuma rota selecionada</CardTitle>
          <Link href="/rotas" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pras rotas
          </Link>
        </Card>
      </Screen>
    );
  }

  return <RouteDetail id={id} />;
}
