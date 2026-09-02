"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentAccount, getProfile, type Profile } from "@/lib/auth";
import {
  deleteCustomRoute,
  getCustomRoute,
  parseCustomRoutePoints,
  sharedFriendIds,
  shareCustomRoute,
  type CustomRoute,
} from "@/lib/customRoutes";
import { computeElevationGain } from "@/lib/elevation";
import { listFriendConnections, type FriendConnection } from "@/lib/friendships";
import { formatDistanceKm } from "@/lib/tracking/geoFilter";
import { Card, CardTitle, delay, Screen, ScreenHeader, SPAN_COLUMNS } from "../../ui";
import { RouteBuilderMap } from "../route-builder-map";

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; route: CustomRoute; isOwner: boolean; ownerProfile: Profile | null };

export function RouteDetail({ id }: { id: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [friends, setFriends] = useState<FriendConnection[] | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [elevationGain, setElevationGain] = useState<number | null>(null);
  const [elevationUnavailable, setElevationUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [route, account] = await Promise.all([getCustomRoute(id), getCurrentAccount()]);
      if (cancelled) return;
      if (!route || !account) {
        setLoad({ status: "not-found" });
        return;
      }
      const isOwner = route.ownerId === account.id;
      const ownerProfile = isOwner ? null : await getProfile(route.ownerId);
      if (cancelled) return;
      setLoad({ status: "ready", route, isOwner, ownerProfile });
      setSharedIds(new Set(sharedFriendIds(route)));
      if (isOwner) {
        listFriendConnections("accepted").then((rows) => {
          if (!cancelled) setFriends(rows);
        });
      }
      // Real DEM lookup, one network round trip per visit — same "no
      // invented numbers" rule elevation.ts already follows for real runs;
      // a hand-drawn route has no altitude of its own to read.
      computeElevationGain(parseCustomRoutePoints(route)).then((gain) => {
        if (cancelled) return;
        if (gain === null) setElevationUnavailable(true);
        else setElevationGain(gain);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (load.status === "loading") {
    return (
      <Screen>
        <Card className={`lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
          <p className="text-sm text-muted">Carregando rota…</p>
        </Card>
      </Screen>
    );
  }

  if (load.status === "not-found") {
    return (
      <Screen>
        <Card className={`lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
          <CardTitle>Rota não encontrada</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            Ou ela foi apagada, ou você não tem mais acesso a ela.
          </p>
        </Card>
      </Screen>
    );
  }

  const { route, isOwner, ownerProfile } = load;
  const points = parseCustomRoutePoints(route);

  const handleShareToggle = async (friendId: string) => {
    const next = new Set(sharedIds);
    if (next.has(friendId)) next.delete(friendId);
    else next.add(friendId);
    setSharingId(friendId);
    const result = await shareCustomRoute(route.$id, [...next]);
    setSharingId(null);
    if (result.ok) setSharedIds(next);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const ok = await deleteCustomRoute(route.$id);
    setDeleting(false);
    if (ok) router.push("/rotas");
  };

  return (
    <>
      <ScreenHeader title={route.name} subtitle={isOwner ? undefined : `Rota de ${ownerProfile?.displayName ?? "um amigo"}`} />
      <Screen>
        {/* No Card wrapper — the map's own pixels are the content, a gray
            box behind it would just be chrome. rounded-xl here clips the
            map's own corners, it isn't a component boundary. A real,
            pannable/zoomable map (not the fixed RouteMap summary view) so
            looking at someone else's route feels like exploring it, not
            just glancing at a static trace — same km-checkpoint markers
            shown while drawing it. */}
        <div className={`pr-enter overflow-hidden rounded-xl ${SPAN_COLUMNS}`} style={delay(10)}>
          <RouteBuilderMap points={points} className="h-80 w-full lg:h-[28rem]" />
        </div>

        <div
          className="pr-enter flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4"
          style={delay(30)}
        >
          <div className="flex gap-6">
            <div>
              <p className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">Distância</p>
              <p className="font-mono text-lg font-semibold tabular-nums lg:tracking-[-0.01em]">
                {formatDistanceKm(route.distanceMeters)} <span className="text-xs font-normal text-muted">km</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">Elevação</p>
              {elevationGain !== null ? (
                <p className="font-mono text-lg font-semibold tabular-nums lg:tracking-[-0.01em]">
                  +{elevationGain} <span className="text-xs font-normal text-muted">m</span>
                </p>
              ) : (
                <p className="text-sm text-muted">{elevationUnavailable ? "Indisponível" : "Calculando…"}</p>
              )}
            </div>
          </div>
          {isOwner && (
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="pr-press shrink-0 rounded-full bg-bad px-4 py-2 text-xs font-semibold text-white hover:opacity-90 active:scale-95 disabled:opacity-60 lg:rounded-md"
            >
              {deleting ? "Apagando…" : "Apagar rota"}
            </button>
          )}
        </div>

        {isOwner && friends !== null && friends.length > 0 && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none" style={delay(50)}>
            <CardTitle>Compartilhar com amigos</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Só quem você marcar aqui consegue ver essa rota — desmarcar tira o acesso.
            </p>
            <ul className="flex flex-col gap-2.5">
              {friends.map((connection) => {
                const shared = sharedIds.has(connection.otherId);
                return (
                  <li key={connection.friendship.$id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{connection.profile?.displayName ?? "Corredor(a)"}</span>
                    <button
                      type="button"
                      disabled={sharingId === connection.otherId}
                      onClick={() => handleShareToggle(connection.otherId)}
                      className={`pr-press shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-60 lg:rounded-md ${
                        shared ? "bg-good/15 text-good" : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {sharingId === connection.otherId ? "…" : shared ? "Compartilhado" : "Compartilhar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Screen>
    </>
  );
}
