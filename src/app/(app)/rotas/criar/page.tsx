"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomRoute, routeDistanceMeters } from "@/lib/customRoutes";
import { formatDistanceKm } from "@/lib/tracking/geoFilter";
import { useHeaderClose } from "../../app-shell";
import { delay, Screen, ScreenHeader } from "../../ui";
import { RouteBuilderMap } from "../route-builder-map";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export default function CriarRotaPage() {
  useHeaderClose("/rotas");
  const router = useRouter();
  const [points, setPoints] = useState<{ lat: number; lon: number }[]>([]);
  const [name, setName] = useState(() => `Rota de ${dateFormatter.format(new Date())}`);
  const [saving, setSaving] = useState(false);

  const distanceMeters = routeDistanceMeters(points);
  const canSave = points.length >= 2 && name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const route = await createCustomRoute(name.trim(), points);
    setSaving(false);
    if (route) router.push("/rotas");
  };

  return (
    <>
      <ScreenHeader wide title="Nova rota" subtitle="Toque no mapa pra ir marcando o trajeto — sem colar na rua, é livre." />
      <Screen wide>
        <div className="pr-enter" style={delay(10)}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-lg font-semibold tabular-nums lg:tracking-[-0.01em]">
              {formatDistanceKm(distanceMeters)} <span className="text-xs font-normal text-muted">km</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={points.length === 0}
                onClick={() => setPoints((current) => current.slice(0, -1))}
                className="pr-press rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-muted hover:bg-foreground/[0.04] active:scale-95 disabled:opacity-40 lg:rounded-md"
              >
                Desfazer
              </button>
              <button
                type="button"
                disabled={points.length === 0}
                onClick={() => setPoints([])}
                className="pr-press rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-muted hover:bg-foreground/[0.04] active:scale-95 disabled:opacity-40 lg:rounded-md"
              >
                Limpar
              </button>
            </div>
          </div>
          {/* No Card wrapper — the map's own pixels are the content, a gray
              box behind it would just be chrome. rounded-xl here clips the
              map's own corners, it isn't a component boundary. */}
          <RouteBuilderMap points={points} onAddPoint={(lat, lon) => setPoints((current) => [...current, { lat, lon }])} className="h-80 w-full overflow-hidden rounded-xl lg:h-[28rem]" />
        </div>

        <div
          className="pr-enter rounded-2xl border border-border bg-surface p-5 lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4"
          style={delay(30)}
        >
          <label className="mb-2 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase" htmlFor="route-name">
            Nome da rota
          </label>
          <input
            id="route-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            className="pr-press w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm font-semibold outline-none focus:border-accent lg:rounded-md"
          />
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSave}
            className="pr-press mt-4 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-60 lg:min-h-0 lg:w-auto lg:rounded-md lg:px-4 lg:py-1.5"
          >
            {saving ? "Salvando…" : "Salvar rota"}
          </button>
        </div>
      </Screen>
    </>
  );
}
