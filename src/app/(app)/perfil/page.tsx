"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ANNOUNCE_MAX_METERS,
  ANNOUNCE_MIN_METERS,
  ANNOUNCE_STEP_METERS,
  announceLabel,
  type DistanceUnit,
  type ThemeMode,
} from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, Screen, ScreenHeader, SegmentedButton } from "../ui";
import { AccountCard } from "../account-card";
import { PillSlider } from "../pill-slider";
import { ShareCardTeaser } from "../share-card";
import { ShoeShowcase } from "../shoe-showcase";
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

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

/** Same register as the bottom-nav icons in app-shell.tsx: stroke-only, 1.7 weight, round joins. */
const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** One glyph per link-out card below, so "Ver" isn't the only thing telling them apart. */
function PlacesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

function FriendsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="8.7" cy="8" r="3" />
      <path d="M2.8 19.5a5.9 5.9 0 0 1 11.8 0" />
      <path d="M15.5 5.3a3 3 0 0 1 0 5.9M18.7 19.5a5.9 5.9 0 0 0-3.4-6.3" />
    </svg>
  );
}

function CoachIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3.5 10.3v3.9h2.5l7.3 3.9V6.4l-7.3 3.9H3.5Z" />
      <path d="M13.8 9.3a4.1 4.1 0 0 1 0 6.9" />
      <path d="M16.6 7.3a7.6 7.6 0 0 1 0 10.9" />
    </svg>
  );
}

function LongaoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="7" cy="8" r="2.6" />
      <circle cx="17" cy="8" r="2.6" />
      <path d="M2.5 19.5a4.6 4.6 0 0 1 9 0M12.5 19.5a4.6 4.6 0 0 1 9 0" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

function HeartbeatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 12h3.5l1.8-4.5L11 17l2.5-9 1.8 4.5H21" />
    </svg>
  );
}

/**
 * A plain label, not a `Card` — this screen collects a lot of unrelated
 * settings in one scroll, and grouping them under a few named clusters is
 * what actually addresses that ("muito poluída"), not moving cards around
 * without changing what the page reads like.
 */
function SectionLabel({ children, delayMs }: { children: React.ReactNode; delayMs: number }) {
  return (
    <p
      className="pr-enter mt-2 px-1 text-xs font-semibold tracking-[0.14em] text-muted uppercase first:mt-0"
      style={delay(delayMs)}
    >
      {children}
    </p>
  );
}

/** One on/off preference row — a label, a short reason, and a switch, for settings that don't fit the mutually-exclusive `SegmentedButton` pattern above. */
function PreferenceToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface"
        } border border-border`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-background transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/** Shared look for the segmented selectors — big targets, single accent. */
const DEFAULT_SHOE_COLOR = "#2f6fed";

/** A hand-picked palette instead of the phone's native color wheel — keeps the picker in the app's own visual language rather than dropping into OS chrome. */
const SHOE_COLOR_SWATCHES = [
  "#2f6fed",
  "#eb4d4d",
  "#f5a623",
  "#f7d716",
  "#3ecf6e",
  "#00c2d1",
  "#8b5cf6",
  "#ec4899",
  "#c9ccd1",
  "#11151a",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Real, commonly-run models across the brands runners actually reach for —
 * not exhaustive, just enough that searching "vapor" or "kayano" finds
 * something. Selecting one only pre-fills the plain brand/model/color fields
 * below; there's no separate "preset mode" to fall out of, since typing a
 * model that isn't listed here already works the same way it always did.
 */
const SHOE_PRESETS: ReadonlyArray<{ brand: string; name: string; color: string }> = [
  { brand: "Nike", name: "Pegasus 41", color: "#2f6fed" },
  { brand: "Nike", name: "Vaporfly 3", color: "#f5a623" },
  { brand: "Nike", name: "Alphafly 3", color: "#eb4d4d" },
  { brand: "Nike", name: "Invincible 3", color: "#8b5cf6" },
  { brand: "Adidas", name: "Adizero Boston 12", color: "#3ecf6e" },
  { brand: "Adidas", name: "Adizero Adios Pro 4", color: "#11151a" },
  { brand: "Adidas", name: "Ultraboost 23", color: "#c9ccd1" },
  { brand: "Asics", name: "Gel-Kayano 31", color: "#00c2d1" },
  { brand: "Asics", name: "Novablast 5", color: "#f7d716" },
  { brand: "Asics", name: "Metaspeed Sky Paris", color: "#eb4d4d" },
  { brand: "Hoka", name: "Clifton 9", color: "#ec4899" },
  { brand: "Hoka", name: "Mach 6", color: "#00c2d1" },
  { brand: "Hoka", name: "Bondi 9", color: "#c9ccd1" },
  { brand: "Brooks", name: "Ghost 16", color: "#2f6fed" },
  { brand: "Brooks", name: "Glycerin 22", color: "#8b5cf6" },
  { brand: "New Balance", name: "1080v14", color: "#11151a" },
  { brand: "New Balance", name: "FuelCell SC Elite v4", color: "#eb4d4d" },
  { brand: "Saucony", name: "Ride 17", color: "#f5a623" },
  { brand: "Saucony", name: "Endorphin Speed 4", color: "#3ecf6e" },
  { brand: "Puma", name: "Deviate Nitro 3", color: "#eb4d4d" },
  { brand: "Mizuno", name: "Wave Rider 28", color: "#00c2d1" },
];

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
  const [presetQuery, setPresetQuery] = useState("");

  const presetMatches =
    presetQuery.trim().length > 0
      ? SHOE_PRESETS.filter((preset) =>
          `${preset.brand} ${preset.name}`.toLowerCase().includes(presetQuery.trim().toLowerCase()),
        ).slice(0, 6)
      : [];

  function applyPreset(preset: { brand: string; name: string; color: string }) {
    setDraft((current) => ({ ...current, brand: preset.brand, name: preset.name, color: preset.color }));
    setPresetQuery("");
  }

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
      <label className="relative block space-y-1.5">
        <span className="text-xs font-medium">Buscar tênis (opcional)</span>
        <input
          type="text"
          value={presetQuery}
          onChange={(e) => setPresetQuery(e.target.value)}
          placeholder="Ex.: Pegasus, Kayano, Vaporfly…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {presetMatches.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {presetMatches.map((preset) => (
              <li key={`${preset.brand}-${preset.name}`}>
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-background"
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: preset.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted">{preset.brand}</span> {preset.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-muted">
          Não achou o seu? Digite marca e modelo direto nos campos abaixo.
        </p>
      </label>

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

      <div className="space-y-2">
        <span className="block text-xs font-medium">Cor</span>
        <div className="flex flex-wrap gap-2">
          {SHOE_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Cor ${swatch}`}
              aria-pressed={draft.color.toLowerCase() === swatch}
              onClick={() => setDraft({ ...draft, color: swatch })}
              className={`h-9 w-9 shrink-0 rounded-lg border-2 transition-transform ${
                draft.color.toLowerCase() === swatch
                  ? "scale-105 border-accent"
                  : "border-border hover:border-accent/60"
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-9 w-9 shrink-0 rounded-lg border border-border"
            style={{ backgroundColor: HEX_COLOR_PATTERN.test(draft.color) ? draft.color : "transparent" }}
          />
          <input
            type="text"
            inputMode="text"
            aria-label="Cor personalizada em hexadecimal"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            placeholder="#2f6fed"
            maxLength={7}
            className="w-28 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

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
 * The registered shoe as the floating showcase item — the one place in the
 * app that shows a shoe as an object instead of a row in a list, tinted to
 * the colour it was registered in. Tapping cycles the catalog.
 */
function ShoeHero({
  shoes,
  summaryFor,
  unit,
}: {
  shoes: Shoe[];
  summaryFor: (name: string) => ShoeSummary | undefined;
  unit: DistanceUnit;
}) {
  const [index, setIndex] = useState(0);
  const shoe = shoes[Math.min(index, shoes.length - 1)];
  const totalMeters = summaryFor(shoe.name)?.totalMeters ?? 0;

  return (
    <button
      type="button"
      onClick={() => setIndex((current) => (current + 1) % shoes.length)}
      disabled={shoes.length < 2}
      className="relative mb-4 flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#0b0e11] pb-6 disabled:cursor-default"
    >
      <ShoeShowcase color={shoe.color} className="relative w-[42%]" />

      <span className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-left">
        <span className="min-w-0">
          {shoe.brand && (
            <span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              {shoe.brand}
            </span>
          )}
          <span className="block truncate text-sm font-medium text-white">{shoe.name}</span>
        </span>
        <span className="shrink-0 font-mono text-sm tabular-nums text-white/85">
          {formatDistance(totalMeters, unit)}
          <span className="ml-1 text-[10px] text-white/50">{unitLabel(unit)}</span>
        </span>
      </span>

      {shoes.length > 1 && (
        <span className="absolute top-3 right-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
          toque pra trocar
        </span>
      )}
    </button>
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
    <Card className="pr-enter" style={delay(240)}>
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
        <>
          <ShoeHero shoes={shoes} summaryFor={summaryFor} unit={unit} />
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
        </>
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

export default function PerfilPage() {
  /** Writes immediately — no save button to forget on the way out the door. */
  const [prefs, update] = usePreferences();
  /**
   * Not a real permission grant, not persisted — there's no HealthKit/Health
   * Connect plugin wired up yet (see PROJECT-CONTEXT.md's "Funcionalidades
   * planejadas" for the actual phased plan). This just reveals the mockup
   * card below so the shape of the feature is something to react to before
   * any native permission prompt or data pipeline gets built.
   */
  const [healthDataPreview, setHealthDataPreview] = useState(false);

  return (
    <>
      <ScreenHeader
        title="Perfil"
        subtitle="Preferências que já valem de verdade, e o que ainda é maquete."
      />

      <Screen>
        <AccountCard />

        <SectionLabel delayMs={20}>Aparência</SectionLabel>
        <Card className="pr-enter" style={delay(30)}>
          <CardTitle>Tema</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
            &quot;Sistema&quot; segue o tema do aparelho e muda sozinho se você trocar por lá.
          </p>
          <div className="flex gap-2">
            {THEMES.map((theme) => (
              <SegmentedButton
                key={theme.value}
                selected={prefs.theme === theme.value}
                onClick={() => update({ theme: theme.value })}
              >
                {theme.label}
              </SegmentedButton>
            ))}
          </div>
        </Card>

        <SectionLabel delayMs={40}>Descubra</SectionLabel>
        <Card className="pr-enter" style={delay(50)}>
          <CardTitle aside={<NoticeBadge>São Paulo</NoticeBadge>}>Lugares pra correr</CardTitle>
          <Link href="/lugares" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <PlacesIcon className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
              Parques e rotas avaliados por segurança, percurso, estrutura, iluminação e fluxo — curadoria
              inicial mais nota real de quem já correu lá.
            </p>
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </Card>

        <SectionLabel delayMs={70}>Comunidade</SectionLabel>
        <Card className="pr-enter" style={delay(80)}>
          <CardTitle aside={<NoticeBadge>precisa de conta</NoticeBadge>}>Amigos</CardTitle>
          <Link href="/amigos" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <FriendsIcon className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
              Adicione quem você corre junto pelo @ e responda os convites que chegarem.
            </p>
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(90)}>
          <CardTitle aside={<NoticeBadge>precisa de conta</NoticeBadge>}>Treinador</CardTitle>
          <Link href="/treinador" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <CoachIcon className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
              Conecte com quem te treina ou com quem você treina — e escolha corrida por corrida o que
              compartilhar.
            </p>
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(100)}>
          <CardTitle aside={<NoticeBadge>precisa de conta</NoticeBadge>}>Longão</CardTitle>
          <Link href="/longao" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <LongaoIcon className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
              Crie ou entre numa corrida em grupo com um código — só amigos entram.
            </p>
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        </Card>

        <SectionLabel delayMs={110}>Treino</SectionLabel>
        <Card className="pr-enter" style={delay(120)}>
          <CardTitle aside={<NoticeBadge>salvo neste aparelho</NoticeBadge>}>
            Preferências de corrida
          </CardTitle>

          <fieldset>
            <legend className="text-sm font-medium">Aviso por voz a cada</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Valor inicial da tela de corrida. Dá pra mudar antes de cada treino.
            </p>
            <PillSlider
              className="mt-4"
              min={ANNOUNCE_MIN_METERS}
              max={ANNOUNCE_MAX_METERS}
              step={ANNOUNCE_STEP_METERS}
              value={prefs.announceIntervalMeters}
              onChange={(meters) => update({ announceIntervalMeters: meters })}
              formatValue={announceLabel}
            />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
              <span>{announceLabel(ANNOUNCE_MIN_METERS)}</span>
              <span>{announceLabel(ANNOUNCE_MAX_METERS)}</span>
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

          <fieldset className="mt-6 border-t border-border pt-5">
            <legend className="text-sm font-medium">Estatísticas na tela de corrida</legend>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Além do pace ao vivo, que fica sempre em destaque.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <PreferenceToggle
                label="Pace total"
                hint="média da corrida inteira até agora"
                checked={prefs.showAveragePaceLive}
                onChange={(checked) => update({ showAveragePaceLive: checked })}
              />
              <PreferenceToggle
                label="Pace do km atual"
                hint="desde a última marca de km fechado"
                checked={prefs.showCurrentKmPaceLive}
                onChange={(checked) => update({ showCurrentKmPaceLive: checked })}
              />
            </div>
          </fieldset>

          <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-muted">
            Meta de prova e tempo recente ficam na aba{" "}
            <Link href="/plano" className="text-accent underline underline-offset-2">
              Plano
            </Link>
            , perto de onde eles são usados.
          </p>
        </Card>

        <SectionLabel delayMs={175}>Equipamento</SectionLabel>
        <ShoesCard unit={prefs.distanceUnit} />

        <SectionLabel delayMs={260}>Compartilhar e dados</SectionLabel>
        <Card className="pr-enter" style={delay(270)}>
          <CardTitle>Card pra compartilhar</CardTitle>
          <Link href="/compartilhar" className="block rounded-xl focus:outline-accent">
            <ShareCardTeaser />
            <span className="mt-4 block w-full rounded-full border border-border bg-background px-6 py-3.5 text-center text-sm font-semibold">
              Abrir prévia do card
            </span>
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(290)}>
          <CardTitle>Instagram</CardTitle>
          <a
            href="https://instagram.com/xanthus.oficial"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3"
          >
            {/*
              Icon-only most of the time; the handle periodically slides out
              from behind it like a drawer opening, then pulls back in (see
              .pr-ig-label/.pr-ig-icon in globals.css) — with the label
              already open as the base/reduced-motion state, so it's never
              the only way to learn the handle. `overflow-hidden` on this
              pill is what makes the label's growing `max-width` actually
              read as sliding out rather than just appearing.
            */}
            <span className="flex h-10 shrink-0 items-center overflow-hidden rounded-full bg-accent/12 text-accent">
              <span className="pr-ig-icon flex h-10 w-10 shrink-0 items-center justify-center">
                <InstagramIcon className="h-5 w-5" />
              </span>
              <span className="pr-ig-label shrink-0 pr-3 font-mono text-xs font-semibold tracking-wide">
                @xanthus.oficial
              </span>
            </span>
            <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
              Corridas de quem já usa o app, direto no feed.
            </p>
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </a>
        </Card>

        <Card className="pr-enter" style={delay(300)}>
          <CardTitle aside={<NoticeBadge>em breve</NoticeBadge>}>
            Dados de saúde do smartwatch
          </CardTitle>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
              <HeartbeatIcon className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
              Frequência cardíaca em tempo real, calorias medidas de verdade (em vez da
              estimativa de hoje), passos e os treinos já registrados no seu relógio — lidos do
              HealthKit (iPhone) ou do Health Connect (Android), só dentro do app instalado, nunca
              no navegador.
            </p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted/80 text-pretty">
            Dado de saúde é uma categoria sensível pela LGPD: quando isso ler dados de verdade, vai
            pedir um consentimento próprio, separado de tudo o mais — nada é lido sem ele.
          </p>
          <div className="mt-4 border-t border-border pt-4">
            <PreferenceToggle
              label="Ver como ficaria"
              hint="Ainda não lê nada de verdade — isso só mostra a prévia da tela abaixo"
              checked={healthDataPreview}
              onChange={setHealthDataPreview}
            />
          </div>
          {healthDataPreview && (
            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Essa corrida</span>
                <ExampleBadge />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-muted">FC média</span>
                  <p className="text-metal mt-0.5 font-mono text-xl tabular-nums">
                    152<span className="ml-1 text-xs text-muted">bpm</span>
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-muted">Calorias</span>
                  <p className="text-metal mt-0.5 font-mono text-xl tabular-nums">
                    612<span className="ml-1 text-xs text-muted">kcal</span>
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-muted">Passos</span>
                  <p className="text-metal mt-0.5 font-mono text-xl tabular-nums">8.412</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
                Números fictícios, só pra mostrar o formato — nenhum relógio foi lido pra gerar
                isso.
              </p>
            </div>
          )}
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
