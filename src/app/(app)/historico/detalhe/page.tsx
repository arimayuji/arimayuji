"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, Screen } from "../../ui";
import { RunDetail } from "./run-detail";

/**
 * A query-string route (`?id=`), not a `[id]` dynamic segment: run ids are
 * generated per-device in IndexedDB and never exist at build time, so there
 * is no `generateStaticParams` list to give a static export for a real
 * dynamic segment — this page itself is the one static file, and the id is
 * resolved client-side after hydration, same reasoning `/lugares/[id]`
 * could skip (those ids are a known, static seed list).
 */
export default function DetalheCorridaPage() {
  return (
    <Suspense fallback={null}>
      <DetalheCorridaContent />
    </Suspense>
  );
}

function DetalheCorridaContent() {
  const params = useSearchParams();
  const id = params.get("id");

  if (!id) {
    return (
      <Screen>
        <Card>
          <CardTitle>Nenhuma corrida selecionada</CardTitle>
          <Link href="/historico" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pro histórico
          </Link>
        </Card>
      </Screen>
    );
  }

  return <RunDetail id={id} />;
}
