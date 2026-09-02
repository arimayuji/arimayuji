"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProfile, type Profile } from "@/lib/auth";
import {
  listMyCustomRoutes,
  listRoutesSharedWithMe,
  parseCustomRoutePoints,
  type CustomRoute,
} from "@/lib/customRoutes";
import { formatDistanceKm } from "@/lib/tracking/geoFilter";
import { projectRoute } from "@/lib/tracking/routeProjection";
import { useAuth } from "@/lib/useAuth";
import { useHeaderClose } from "../app-shell";
import { Card, CardTitle, delay, EmptyState, Screen, ScreenHeader } from "../ui";

/** Same thumbnail technique as matched-runs-card.tsx's RouteThumb — projectRoute takes any {lat,lon,timestamp}[], including a hand-drawn route's synthesized-timestamp points, with zero new rendering code. */
function RouteThumb({ points }: { points: { lat: number; lon: number; timestamp: number }[] }) {
  const projected = projectRoute(points, { viewBoxSize: 56, paddingFraction: 0.12 });
  if (!projected) return null;
  return (
    <svg
      viewBox={`0 0 ${projected.viewBoxSize} ${projected.viewBoxSize}`}
      className="h-14 w-14 shrink-0 rounded-lg border border-border bg-background text-accent"
      role="img"
      aria-label="Traçado da rota"
    >
      {projected.polylines.map((points, i) => (
        <polyline key={i} points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function RouteCard({ route, subtitle, href }: { route: CustomRoute; subtitle?: string; href: string }) {
  return (
    <Link
      href={href}
      className="pr-press flex items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0 hover:bg-foreground/[0.04] active:scale-[0.98]"
    >
      <RouteThumb points={parseCustomRoutePoints(route)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{route.name}</p>
        <p className="truncate font-mono text-xs text-muted">
          {formatDistanceKm(route.distanceMeters)} km{subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
    </Link>
  );
}

export default function RotasPage() {
  useHeaderClose("/lugares");
  const { status } = useAuth();
  const [myRoutes, setMyRoutes] = useState<CustomRoute[] | null>(null);
  const [sharedRoutes, setSharedRoutes] = useState<CustomRoute[] | null>(null);
  const [ownerProfiles, setOwnerProfiles] = useState<Map<string, Profile | null>>(new Map());

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listMyCustomRoutes().then((rows) => {
      if (!cancelled) setMyRoutes(rows);
    });
    listRoutesSharedWithMe().then(async (rows) => {
      if (cancelled) return;
      setSharedRoutes(rows);
      const ownerIds = [...new Set(rows.map((row) => row.ownerId))];
      const entries = await Promise.all(ownerIds.map(async (id) => [id, await getProfile(id)] as const));
      if (!cancelled) setOwnerProfiles(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <>
      <ScreenHeader wide title="Minhas rotas" subtitle="Desenhe um trajeto no mapa e compartilhe com amigos" />
      <Screen wide>
        <Link
          href="/rotas/criar"
          className="pr-enter pr-press block rounded-2xl hover:bg-foreground/[0.04] active:scale-[0.98] lg:rounded-md"
          style={delay(10)}
        >
          <Card className="flex items-center justify-between gap-3 lg:rounded-md lg:border lg:border-dashed lg:border-accent/40 lg:bg-transparent lg:shadow-none">
            <p className="text-sm font-semibold text-accent">+ Nova rota</p>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Card>
        </Link>

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(30)}>
          <CardTitle>Suas rotas</CardTitle>
          {myRoutes === null ? (
            <div className="h-14 animate-pulse rounded-lg bg-background" />
          ) : myRoutes.length === 0 ? (
            <EmptyState title="Nenhuma rota desenhada ainda" description="Comece pela acima." />
          ) : (
            <div className="flex flex-col gap-3.5">
              {myRoutes.map((route) => (
                <RouteCard key={route.$id} route={route} href={`/rotas/detalhe?id=${route.$id}`} />
              ))}
            </div>
          )}
        </Card>

        <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(50)}>
          <CardTitle>Recebidas de amigos</CardTitle>
          {sharedRoutes === null ? (
            <div className="h-14 animate-pulse rounded-lg bg-background" />
          ) : sharedRoutes.length === 0 ? (
            <EmptyState title="Nenhum amigo compartilhou uma rota com você ainda" />
          ) : (
            <div className="flex flex-col gap-3.5">
              {sharedRoutes.map((route) => (
                <RouteCard
                  key={route.$id}
                  route={route}
                  subtitle={ownerProfiles.get(route.ownerId)?.displayName ?? "Corredor(a)"}
                  href={`/rotas/detalhe?id=${route.$id}`}
                />
              ))}
            </div>
          )}
        </Card>
      </Screen>
    </>
  );
}
