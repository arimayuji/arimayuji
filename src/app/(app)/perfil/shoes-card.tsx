"use client";

import { useCallback, useEffect, useState } from "react";
import type { DistanceUnit } from "@/lib/preferences";
import { Card, CardTitle, delay, NoticeBadge } from "../ui";
import { Shoe3DViewer } from "../shoe-3d-viewer";
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
  { brand: "Nike", name: "Structure 25", color: "#2f6fed" },
  { brand: "Nike", name: "Pegasus Trail 5", color: "#f5a623" },
  { brand: "Nike", name: "Zoom Fly 5", color: "#eb4d4d" },
  { brand: "Nike", name: "Winflo 11", color: "#8b5cf6" },
  { brand: "Adidas", name: "Adizero Boston 12", color: "#3ecf6e" },
  { brand: "Adidas", name: "Adizero Adios Pro 4", color: "#11151a" },
  { brand: "Adidas", name: "Ultraboost 23", color: "#c9ccd1" },
  { brand: "Adidas", name: "Adizero SL", color: "#3ecf6e" },
  { brand: "Adidas", name: "Supernova Rise", color: "#00c2d1" },
  { brand: "Adidas", name: "Duramo Speed", color: "#c9ccd1" },
  { brand: "Asics", name: "Gel-Kayano 31", color: "#00c2d1" },
  { brand: "Asics", name: "Novablast 5", color: "#f7d716" },
  { brand: "Asics", name: "Metaspeed Sky Paris", color: "#eb4d4d" },
  { brand: "Asics", name: "Gel-Nimbus 26", color: "#11151a" },
  { brand: "Asics", name: "Gel-Cumulus 26", color: "#ec4899" },
  { brand: "Asics", name: "Superblast", color: "#f7d716" },
  { brand: "Hoka", name: "Clifton 9", color: "#ec4899" },
  { brand: "Hoka", name: "Mach 6", color: "#00c2d1" },
  { brand: "Hoka", name: "Bondi 9", color: "#c9ccd1" },
  { brand: "Hoka", name: "Speedgoat 6", color: "#2f6fed" },
  { brand: "Hoka", name: "Rincon 4", color: "#f5a623" },
  { brand: "Hoka", name: "Arahi 7", color: "#eb4d4d" },
  { brand: "Brooks", name: "Ghost 16", color: "#2f6fed" },
  { brand: "Brooks", name: "Glycerin 22", color: "#8b5cf6" },
  { brand: "Brooks", name: "Adrenaline GTS 24", color: "#8b5cf6" },
  { brand: "Brooks", name: "Hyperion Max", color: "#3ecf6e" },
  { brand: "New Balance", name: "1080v14", color: "#11151a" },
  { brand: "New Balance", name: "FuelCell SC Elite v4", color: "#eb4d4d" },
  { brand: "New Balance", name: "880v14", color: "#00c2d1" },
  { brand: "New Balance", name: "Fresh Foam X More v5", color: "#c9ccd1" },
  { brand: "New Balance", name: "Rebel v4", color: "#11151a" },
  { brand: "Saucony", name: "Ride 17", color: "#f5a623" },
  { brand: "Saucony", name: "Endorphin Speed 4", color: "#3ecf6e" },
  { brand: "Saucony", name: "Triumph 22", color: "#ec4899" },
  { brand: "Saucony", name: "Kinvara 15", color: "#f7d716" },
  { brand: "Puma", name: "Deviate Nitro 3", color: "#eb4d4d" },
  { brand: "Puma", name: "Velocity Nitro 3", color: "#2f6fed" },
  { brand: "Mizuno", name: "Wave Rider 28", color: "#00c2d1" },
  { brand: "Mizuno", name: "Wave Rebellion Pro", color: "#f5a623" },
  { brand: "Altra", name: "Torin 7", color: "#eb4d4d" },
  { brand: "Altra", name: "Rivera 3", color: "#8b5cf6" },
  { brand: "Altra", name: "Lone Peak 8", color: "#3ecf6e" },
  { brand: "On", name: "Cloudmonster", color: "#00c2d1" },
  { brand: "On", name: "Cloudsurfer", color: "#c9ccd1" },
  { brand: "On", name: "Cloudstratus", color: "#11151a" },
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
  savingLabel,
  onSubmit,
  onCancel,
}: {
  initial: ShoeDraft;
  submitLabel: string;
  /** Shown in place of `submitLabel` while `onSubmit`'s own write is in flight — distinct per caller ("Salvando…" for an edit, "Adicionando…" for a new shoe) since `saving` alone used to just dim the button with no word telling you which thing it was doing. */
  savingLabel: string;
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
      className="mt-3 flex flex-col gap-3.5 rounded-xl border border-border bg-background p-3"
    >
      <label className="relative block space-y-2">
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

      <label className="block space-y-2">
        <span className="text-xs font-medium">Marca</span>
        <input
          type="text"
          value={draft.brand}
          onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
          placeholder="Ex.: Nike"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="block space-y-2">
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

      <div className="space-y-2.5">
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
          {saving ? savingLabel : submitLabel}
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

const SHOE_GLYPH_SRC = "/shoe/shoe-glyph-3d.png";

/**
 * Generic shoe silhouette, tinted to this specific shoe's own colour — same
 * grayscale-then-mix-blend-color recipe `ShoeHero` uses for its own photo
 * fallback, just a plain small swatch instead of a floating loot item. This
 * is the fallback for a shoe with no personal photo yet: a real, if
 * generic, running-shoe shape instead of a flat colour dot, without ever
 * trying to depict an actual branded model.
 *
 * A flat side-profile render of the same GLB model `ShoeHero`'s 3D viewer
 * uses (see shoe-3d-viewer.tsx), not the old `shoe-side.png` stock photo —
 * that photo was a real, different shoe, so the small list icon and the big
 * 3D hero above it were two unrelated shapes side by side. Rendered once
 * offline (Three.js + GLTFLoader, orthographic-ish side angle, transparent
 * background) with the "everything else" luminance band set to a neutral
 * mid-gray instead of an athlete colour — this <img>'s own `grayscale(1)`
 * filter below erases any baked-in hue anyway, so the mask/tint recipe here
 * re-derives the same dark-sole/light-laces/coloured-upper look this file's
 * `Shoe3DViewer` gets live, just cheaply, without a WebGL context per row.
 */
function ShoeGlyph({
  color,
  className = "",
  "data-testid": dataTestId,
}: {
  color: string;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      className={`relative inline-block overflow-hidden ${className}`}
      aria-hidden="true"
      data-testid={dataTestId}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
      <img
        src={SHOE_GLYPH_SRC}
        alt=""
        className="h-full w-full object-contain"
        style={{ filter: "grayscale(1) brightness(1.08) contrast(1.05)" }}
      />
      <span
        className="absolute inset-0 mix-blend-color"
        style={{
          backgroundColor: color,
          WebkitMaskImage: `url(${SHOE_GLYPH_SRC})`,
          maskImage: `url(${SHOE_GLYPH_SRC})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </span>
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
  deleting,
  onEdit,
  onDelete,
}: {
  shoe: Shoe;
  summary: ShoeSummary | undefined;
  unit: DistanceUnit;
  /** True while this row's own `deleteShoe` + refresh is in flight — the row itself doesn't optimistically disappear until the list actually reloads, so the confirm button needs its own busy word instead of just sitting there tappable again. */
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const runCount = summary?.runCount ?? 0;

  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        {shoe.photoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from the athlete's own file, nothing Next's <Image> optimizer can handle.
          <img
            src={shoe.photoDataUrl}
            alt={`Foto de ${shoe.name}`}
            className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
            data-testid="shoe-swatch"
          />
        ) : (
          <ShoeGlyph color={shoe.color} className="h-11 w-11 shrink-0 rounded-lg border border-border bg-background" data-testid="shoe-swatch" />
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
              disabled={deleting}
              onClick={onDelete}
              className="rounded-full bg-bad px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {deleting ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full bg-bad px-3 py-1.5 text-xs font-semibold text-white"
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
  const [use3D, setUse3D] = useState(true);
  const shoe = shoes[Math.min(index, shoes.length - 1)];
  const totalMeters = summaryFor(shoe.name)?.totalMeters ?? 0;

  return (
    <button
      type="button"
      onClick={() => setIndex((current) => (current + 1) % shoes.length)}
      disabled={shoes.length < 2}
      className="relative mb-4 flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#0b0e11] pb-6 disabled:cursor-default"
    >
      {use3D ? (
        // Real interactive model, drag-to-rotate — falls back to the photo/
        // video showcase below if WebGL or the GLB load ever fails (a
        // sluggish/unsupported WebView, a blocked asset request), same
        // "best available, never a dead end" shape ShoeShowcase itself
        // already uses internally for its own video-vs-photo fallback.
        <Shoe3DViewer color={shoe.color} className="relative h-full w-[70%]" onFailed={() => setUse3D(false)} />
      ) : (
        <ShoeShowcase color={shoe.color} className="relative w-[42%]" />
      )}

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
export function ShoesCard({ unit }: { unit: DistanceUnit }) {
  const [shoes, setShoes] = useState<Shoe[] | null>(null);
  const [summaries, setSummaries] = useState<ShoeSummary[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        <div className="text-center">
          <div className="mx-auto mb-4 h-32 w-full max-w-[220px] overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
            <img
              src="/perfil-tenis-empty.png"
              alt="Ilustração de um tênis de corrida esperando num caminho"
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-xs leading-relaxed text-muted">Nenhum tênis registrado ainda.</p>
        </div>
      ) : (
        <>
          <ShoeHero shoes={shoes} summaryFor={summaryFor} unit={unit} />
          <ul className="flex flex-col gap-3.5">
            {shoes.map((shoe) =>
              editingId === shoe.id ? (
                <li key={shoe.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <ShoeForm
                    initial={shoe}
                    submitLabel="Salvar"
                    savingLabel="Salvando…"
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
                  deleting={deletingId === shoe.id}
                  onEdit={() => {
                    setAdding(false);
                    setEditingId(shoe.id);
                  }}
                  onDelete={async () => {
                    setDeletingId(shoe.id);
                    await deleteShoe(shoe.id);
                    await refresh();
                    setDeletingId(null);
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
          savingLabel="Adicionando…"
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
