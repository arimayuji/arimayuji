"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ANNOUNCE_OPTIONS, announceLabel, type DistanceUnit } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { GoalDatePicker } from "../date-picker";
import { ShareCardTeaser } from "../share-card";
import { isConfigured, startAuthorization } from "@/lib/spotify/auth";
import { disconnectSpotify, useSpotifyConnected } from "@/lib/spotify/useConnection";
import {
  createShoe,
  deleteShoe,
  listCompletedRuns,
  listShoes,
  summarizeShoes,
  updateShoe,
  type Shoe,
  type ShoeSummary,
} from "@/lib/tracking/storage";
import { formatDistance, unitLabel } from "@/lib/units";
import { GOAL_DISTANCE_OPTIONS } from "@/lib/runnerProfile";
import { useRunnerProfile } from "@/lib/useRunnerProfile";

/**
 * Profile: two halves, kept visually distinct on purpose.
 *
 * The top half is real — the settings there are written to localStorage and
 * actually consumed (/run seeds its announcement interval from one, /historico
 * formats distances with the other). The bottom half is the race-goal mockup,
 * which persists nothing yet and is labelled as such rather than pretending.
 */

const UNITS: { value: DistanceUnit; label: string; hint: string }[] = [
  { value: "km", label: "Quilômetros", hint: "km · min/km" },
  { value: "mi", label: "Milhas", hint: "mi · min/mi" },
];

/** Shared look for the segmented selectors — big targets, single accent. */
function SegmentedButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 flex-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-background text-foreground hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Spotify: read-only, on purpose. It shows what was playing during a run —
 * nothing here plays, pauses, or skips anything, so a free account works the
 * same as Premium. Needs a Client ID the product owner registers themselves
 * (developer.spotify.com/dashboard); until then this degrades to an
 * explanation instead of a broken button.
 */
function SpotifyCard() {
  const connected = useSpotifyConnected();
  const configured = isConfigured();

  return (
    <Card className="pr-enter" style={delay(110)}>
      <CardTitle
        aside={
          configured ? (
            <NoticeBadge>{connected ? "conectado" : "não conectado"}</NoticeBadge>
          ) : (
            <ExampleBadge>não configurado</ExampleBadge>
          )
        }
      >
        Spotify
      </CardTitle>
      <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
        Mostra a(s) música(s) que estavam tocando durante a corrida, no resumo do final. Só
        leitura — o Xanthus nunca toca, pausa ou pula nada, então funciona em conta free ou
        Premium.
      </p>
      {!configured ? (
        <p className="text-xs leading-relaxed text-muted">
          Falta configurar o app no painel do Spotify (Client ID em
          <code className="mx-1 rounded bg-background px-1 py-0.5 text-[11px]">
            NEXT_PUBLIC_SPOTIFY_CLIENT_ID
          </code>
          ).
        </p>
      ) : connected ? (
        <button
          type="button"
          onClick={disconnectSpotify}
          className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-bad hover:text-bad"
        >
          Desconectar
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void startAuthorization()}
          className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground"
        >
          Conectar Spotify
        </button>
      )}
    </Card>
  );
}

const DEFAULT_SHOE_COLOR = "#2f6fed";

/** Fields the athlete fills in — the rest of a `Shoe` (id, createdAt) is storage's business. */
type ShoeDraft = Pick<Shoe, "brand" | "name" | "color" | "photoDataUrl">;

const EMPTY_SHOE_DRAFT: ShoeDraft = { brand: "", name: "", color: DEFAULT_SHOE_COLOR };

/**
 * Add/edit form for one shoe. The photo is read into a data URL instead of an
 * object URL because it goes into IndexedDB — an object URL dies with the
 * page and would leave a broken thumbnail after a reload.
 */
function ShoeForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ShoeDraft;
  submitLabel: string;
  onSubmit: (draft: ShoeDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ShoeDraft>(initial);
  const [saving, setSaving] = useState(false);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((current) => ({ ...current, photoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  const canSubmit = draft.name.trim().length > 0 && !saving;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        onSubmit({
          ...draft,
          brand: draft.brand.trim(),
          name: draft.name.trim(),
        });
      }}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-background p-3"
    >
      <label className="block space-y-1.5">
        <span className="text-xs font-medium">Marca</span>
        <input
          type="text"
          value={draft.brand}
          onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
          placeholder="Ex.: Nike"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium">Modelo</span>
        <input
          type="text"
          required
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Ex.: Pegasus 40"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Cor</span>
        <input
          type="color"
          aria-label="Cor do tênis"
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          className="h-10 w-16 shrink-0 cursor-pointer rounded-lg border border-border bg-surface"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {draft.photoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from the athlete's own file, nothing Next's <Image> optimizer can handle.
          <img
            src={draft.photoDataUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-accent">
          {draft.photoDataUrl ? "Trocar foto" : "Escolher foto"}
          <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
        </label>
        {draft.photoDataUrl && (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, photoDataUrl: undefined })}
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-warn hover:text-warn"
          >
            Remover foto
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 flex-1 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * One registered shoe, with the mileage it has actually accumulated. The
 * stats come from matching run history on the shoe's name, so a shoe that's
 * registered but never used honestly reads zero instead of hiding.
 */
function ShoeRow({
  shoe,
  summary,
  unit,
  onEdit,
  onDelete,
}: {
  shoe: Shoe;
  summary: ShoeSummary | undefined;
  unit: DistanceUnit;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const runCount = summary?.runCount ?? 0;

  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          style={{ backgroundColor: shoe.color }}
          className="h-5 w-5 shrink-0 rounded-full border border-border"
          data-testid="shoe-swatch"
        />
        {shoe.photoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from the athlete's own file, nothing Next's <Image> optimizer can handle.
          <img
            src={shoe.photoDataUrl}
            alt={`Foto de ${shoe.name}`}
            className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          {shoe.brand && <p className="truncate text-xs text-muted">{shoe.brand}</p>}
          <p className="truncate text-sm font-medium">{shoe.name}</p>
          <p className="text-xs text-muted">
            {runCount} {runCount === 1 ? "corrida" : "corridas"}
          </p>
        </div>
        <p className="shrink-0 font-mono text-lg tabular-nums">
          {formatDistance(summary?.totalMeters ?? 0, unit)}
          <span className="ml-1 text-xs text-muted">{unitLabel(unit)}</span>
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-accent"
        >
          Editar
        </button>
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-bad px-3 py-1.5 text-xs font-semibold text-bad"
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-bad hover:text-bad"
          >
            Excluir
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The shoe catalog: real registered shoes (brand, model, color, optional
 * photo) crossed with the mileage each has accumulated. The two halves stay
 * matched only by name — deleting a shoe here never touches run history.
 */
function ShoesCard({ unit }: { unit: DistanceUnit }) {
  const [shoes, setShoes] = useState<Shoe[] | null>(null);
  const [summaries, setSummaries] = useState<ShoeSummary[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all([listShoes(), listCompletedRuns()]).then(([catalog, runs]) => {
        setShoes(catalog);
        setSummaries(summarizeShoes(runs));
      }),
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summaryFor = (name: string) => summaries.find((s) => s.name === name);

  return (
    <Card className="pr-enter" style={delay(160)}>
      <CardTitle aside={<NoticeBadge>dados reais</NoticeBadge>}>Meus tênis</CardTitle>
      <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
        Registre seus tênis com marca, cor e foto. A quilometragem de cada um vem das corridas
        gravadas com o mesmo nome — ajuda a saber quando trocar.
      </p>

      {shoes === null ? (
        <div className="h-12 animate-pulse rounded-lg bg-background" />
      ) : shoes.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted">Nenhum tênis registrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shoes.map((shoe) =>
            editingId === shoe.id ? (
              <li key={shoe.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <ShoeForm
                  initial={shoe}
                  submitLabel="Salvar"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (draft) => {
                    await updateShoe({ ...shoe, ...draft });
                    setEditingId(null);
                    await refresh();
                  }}
                />
              </li>
            ) : (
              <ShoeRow
                key={shoe.id}
                shoe={shoe}
                summary={summaryFor(shoe.name)}
                unit={unit}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(shoe.id);
                }}
                onDelete={async () => {
                  await deleteShoe(shoe.id);
                  await refresh();
                }}
              />
            ),
          )}
        </ul>
      )}

      {adding ? (
        <ShoeForm
          initial={EMPTY_SHOE_DRAFT}
          submitLabel="Adicionar tênis"
          onCancel={() => setAdding(false)}
          onSubmit={async (draft) => {
            await createShoe(draft);
            setAdding(false);
            await refresh();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className="mt-4 min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-accent"
        >
          Adicionar tênis
        </button>
      )}
    </Card>
  );
}

const RUN_DAYS_OPTIONS = [3, 4, 5] as const;

export default function PerfilPage() {
  /** Writes immediately — no save button to forget on the way out the door. */
  const [prefs, update] = usePreferences();
  const [profile, updateProfile] = useRunnerProfile();

  const recentMinutes = profile.recentRaceTimeSeconds
    ? Math.floor(profile.recentRaceTimeSeconds / 60)
    : "";
  const recentSeconds = profile.recentRaceTimeSeconds
    ? profile.recentRaceTimeSeconds % 60
    : "";

  const setRecentRaceTime = (minutes: number, seconds: number) => {
    const total = minutes * 60 + seconds;
    updateProfile({ recentRaceTimeSeconds: total > 0 ? total : undefined });
  };

  return (
    <>
      <ScreenHeader
        title="Perfil"
        subtitle="Preferências que já valem de verdade, e o que ainda é maquete."
      />

      <Screen>
        <Card className="pr-enter" style={delay(60)}>
          <CardTitle aside={<NoticeBadge>salvo neste aparelho</NoticeBadge>}>
            Preferências de corrida
          </CardTitle>

          <fieldset>
            <legend className="text-sm font-medium">Aviso por voz a cada</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Valor inicial da tela de corrida. Dá pra mudar antes de cada treino.
            </p>
            <div className="mt-3 flex gap-2">
              {ANNOUNCE_OPTIONS.map((meters) => (
                <SegmentedButton
                  key={meters}
                  selected={prefs.announceIntervalMeters === meters}
                  onClick={() => update({ announceIntervalMeters: meters })}
                >
                  {announceLabel(meters)}
                </SegmentedButton>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6 border-t border-border pt-5">
            <legend className="text-sm font-medium">Unidade de distância</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Aplicada no histórico. A tela de corrida segue em km enquanto o tracking está em
              validação.
            </p>
            <div className="mt-3 flex gap-2">
              {UNITS.map((unit) => (
                <SegmentedButton
                  key={unit.value}
                  selected={prefs.distanceUnit === unit.value}
                  onClick={() => update({ distanceUnit: unit.value })}
                >
                  <span className="block">{unit.label}</span>
                  <span className="mt-0.5 block font-mono text-[10px] opacity-70">
                    {unit.hint}
                  </span>
                </SegmentedButton>
              ))}
            </div>
          </fieldset>
        </Card>

        <SpotifyCard />

        <ShoesCard unit={prefs.distanceUnit} />

        <Card className="pr-enter" style={delay(210)}>
          <CardTitle aside={<NoticeBadge>salvo neste aparelho</NoticeBadge>}>
            Meta de prova
          </CardTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Isso alimenta o motor de plano de verdade — distância e data viram a rampa de
            volume e o taper; o tempo recente (opcional) vira suas zonas de pace.
          </p>

          <fieldset>
            <legend className="text-sm font-medium">Distância da prova</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {GOAL_DISTANCE_OPTIONS.map((option) => (
                <SegmentedButton
                  key={option.meters}
                  selected={profile.goalDistanceMeters === option.meters}
                  onClick={() => updateProfile({ goalDistanceMeters: option.meters })}
                >
                  {option.label}
                </SegmentedButton>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 space-y-1.5">
            <p className="text-sm font-medium">Data da prova</p>
            <GoalDatePicker
              value={profile.goalDate}
              onChange={(goalDate) => updateProfile({ goalDate })}
            />
          </div>

          <fieldset className="mt-6 border-t border-border pt-5">
            <legend className="text-sm font-medium">Dias de corrida por semana</legend>
            <div className="mt-2 flex gap-2">
              {RUN_DAYS_OPTIONS.map((days) => (
                <SegmentedButton
                  key={days}
                  selected={(profile.weeklyRunDays ?? 4) === days}
                  onClick={() => updateProfile({ weeklyRunDays: days })}
                >
                  {days}
                </SegmentedButton>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6 border-t border-border pt-5">
            <legend className="text-sm font-medium">Seu tempo recente (opcional)</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Uma prova ou treino forte recente numa distância conhecida — dá as suas zonas de
              pace reais. Sem isso o plano ainda calcula volume, só não mostra pace por zona.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {GOAL_DISTANCE_OPTIONS.map((option) => (
                <SegmentedButton
                  key={option.meters}
                  selected={profile.recentRaceDistanceMeters === option.meters}
                  onClick={() => updateProfile({ recentRaceDistanceMeters: option.meters })}
                >
                  {option.label}
                </SegmentedButton>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="min"
                value={recentMinutes}
                onChange={(event) =>
                  setRecentRaceTime(Number(event.target.value) || 0, Number(recentSeconds) || 0)
                }
                className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-center font-mono text-sm tabular-nums outline-none focus:border-accent"
              />
              <span className="text-muted">:</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="59"
                placeholder="seg"
                value={recentSeconds}
                onChange={(event) =>
                  setRecentRaceTime(Number(recentMinutes) || 0, Number(event.target.value) || 0)
                }
                className="min-h-12 w-full rounded-xl border border-border bg-background px-3 py-3 text-center font-mono text-sm tabular-nums outline-none focus:border-accent"
              />
            </div>
            {profile.recentRaceTimeSeconds && !profile.recentRaceDistanceMeters && (
              <p className="mt-2 text-xs text-warn">Falta escolher a distância desse tempo.</p>
            )}
          </fieldset>

          <Link
            href="/plano"
            className="mt-6 inline-block text-sm text-accent underline underline-offset-2"
          >
            Ver o plano
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(260)}>
          <CardTitle>Card pra compartilhar</CardTitle>
          <Link href="/compartilhar" className="block rounded-xl focus:outline-accent">
            <ShareCardTeaser />
            <span className="mt-4 block w-full rounded-full border border-border bg-background px-6 py-3.5 text-center text-sm font-semibold">
              Abrir prévia do card
            </span>
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(310)}>
          <CardTitle>Seus dados</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            Corridas e preferências ficam no armazenamento deste aparelho, offline. Não há
            conta, login nem envio pra servidor — e por isso também não há sincronização entre
            aparelhos ainda.
          </p>
        </Card>
      </Screen>
    </>
  );
}
