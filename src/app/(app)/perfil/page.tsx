"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ANNOUNCE_MAX_METERS,
  ANNOUNCE_MIN_METERS,
  ANNOUNCE_STEP_METERS,
  announceLabel,
  CARB_REMINDER_MAX_MINUTES,
  CARB_REMINDER_MIN_MINUTES,
  CARB_REMINDER_STEP_MINUTES,
  type DistanceUnit,
  type ThemeMode,
} from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import {
  Card,
  CardTitle,
  delay,
  NoticeBadge,
  PillTabs,
  PreferenceToggle,
  Screen,
  ScreenHeader,
  SegmentedButton,
} from "../ui";
import { AccountCard } from "../account-card";
import { PillSlider } from "../pill-slider";
import { ShareCardTeaser } from "../share-card";
import { Shoe3DViewer } from "../shoe-3d-viewer";
import { ShoeShowcase } from "../shoe-showcase";
import {
  createShoe,
  deleteShoe,
  listCompletedRuns,
  listShoes,
  summarizeShoes,
  updateShoe,
  type CompletedRun,
  type Shoe,
  type ShoeSummary,
} from "@/lib/tracking/storage";
import { formatDistance, unitLabel } from "@/lib/units";
import { updateProfile } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { listCoachConnections } from "@/lib/coachRelationships";
import { matchPlaceForRoute } from "@/lib/placeMatch";
import { recordRunAtPlace } from "@/lib/placeLeaderboard";
import { parsePlaylists, resolvePlaylistCover, serializePlaylists, type PlaylistEntry } from "@/lib/playlistLink";
import type { RunningPlace } from "@/lib/places";

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

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
  { id: "system", label: "Sistema" },
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
 * One dense row inside `DiscoveryCard` below — icon badge, truncating
 * label/caption, a status tag, a chevron. The compact list-row treatment
 * the redesign handoff (Xanthus Perfil.dc.html) uses for every plain
 * "goes to another real screen, nothing else on it" link — as opposed to
 * `ShareCardTeaser`/the health-data preview below, which keep their own
 * dedicated cards because they embed a real visual, not just a caption.
 */
function DiscoveryRow({
  href,
  external,
  icon,
  label,
  caption,
  tag,
}: {
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  label: string;
  caption: string;
  tag: string;
}) {
  const linkProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Link
      href={href}
      {...linkProps}
      className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted">{caption}</span>
      </span>
      <span className="shrink-0 rounded-full border border-border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
        {tag}
      </span>
      <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
    </Link>
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
              className="rounded-full border border-bad px-3 py-1.5 text-xs font-semibold text-bad disabled:opacity-60"
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
function ShoesCard({ unit }: { unit: DistanceUnit }) {
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

/**
 * Opt-in card for the "ranking de lugares" leaderboard — off by default,
 * one master toggle (`Profile.leaderboardOptIn`) that gates whether this
 * account's km ever shows on any place's leaderboard at all. The actual
 * per-run confirmation prompt lives in `/run` (right after a run that
 * matches a known place finishes); this card only handles the toggle
 * itself, the optional public name, and retroactively scanning runs
 * recorded before the toggle was ever turned on.
 */
function PlaceLeaderboardCard() {
  const { status, account, profile, refresh } = useAuth();
  const [savingToggle, setSavingToggle] = useState(false);
  const [publicName, setPublicName] = useState(profile?.publicDisplayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ place: RunningPlace; runs: CompletedRun[] }[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [scanDone, setScanDone] = useState(false);

  const optedIn = profile?.leaderboardOptIn ?? false;
  const [toggleError, setToggleError] = useState(false);

  /**
   * `finally` here isn't decoration — `updateProfile` throws straight from
   * the Appwrite SDK on a permission error (no try/catch of its own), and
   * without this, that throw would skip `setSavingToggle(false)` entirely:
   * the switch stays visually off (never refreshed) *and* every future tap
   * becomes a no-op forever, since `savingToggle` never clears. That's
   * exactly what a real 2026-08-22 report ("toggle não funciona") turned
   * out to be — surfaced as an unrecoverable stuck switch instead of a
   * visible error, from a rowSecurity gap on the profiles table (see
   * appwrite-setup.ts's "tighten LGPD finding #12" block for the actual
   * fix) rather than anything wrong in this handler. Keeping the
   * try/finally regardless: any future failure here should degrade to "try
   * again", never to "this button is dead now".
   */
  async function handleToggle(next: boolean) {
    if (!account || savingToggle) return;
    setSavingToggle(true);
    setToggleError(false);
    try {
      await updateProfile(account.id, { leaderboardOptIn: next });
      await refresh();
    } catch {
      setToggleError(true);
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleNameBlur() {
    if (!account || savingName) return;
    const trimmed = publicName.trim();
    if (trimmed === (profile?.publicDisplayName ?? "")) return;
    setSavingName(true);
    try {
      await updateProfile(account.id, { publicDisplayName: trimmed });
      await refresh();
    } catch {
      // Reverts to whatever /perfil already had on the next render — no
      // separate error UI for a field this low-stakes, same reasoning
      // handleToggle's own comment explains for why this can't be silent
      // in a way that leaves `savingName` stuck instead.
    } finally {
      setSavingName(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanDone(false);
    const runs = await listCompletedRuns();
    const grouped = new Map<string, { place: RunningPlace; runs: CompletedRun[] }>();
    for (const run of runs) {
      const place = matchPlaceForRoute(run.points);
      if (!place) continue;
      const entry = grouped.get(place.id) ?? { place, runs: [] };
      entry.runs.push(run);
      grouped.set(place.id, entry);
    }
    setScanResult(Array.from(grouped.values()));
    setScanning(false);
  }

  async function handleConfirmScan() {
    if (!scanResult) return;
    setConfirming(true);
    for (const group of scanResult) {
      for (const run of group.runs) {
        await recordRunAtPlace(group.place.id, run.distanceMeters);
      }
    }
    setConfirming(false);
    setScanResult(null);
    setScanDone(true);
  }

  return (
    <Card className="pr-enter" style={delay(85)}>
      <CardTitle aside={<NoticeBadge>desligado por padrão</NoticeBadge>}>Ranking de lugares</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Quanto de km você já correu em cada lugar cadastrado, num ranking público e um só entre
        amigos. Fica desligado até você ligar — e mesmo ligado, cada corrida só entra depois de
        você confirmar que foi ali.
      </p>

      {status !== "signed-in" ? (
        <p className="text-xs text-muted">Precisa de conta pra participar (Google ou Apple, em Conta acima).</p>
      ) : (
        <>
          <PreferenceToggle
            label="Participar do ranking"
            hint="seu km total por lugar fica visível pra quem você deixar"
            checked={optedIn}
            onChange={handleToggle}
          />
          {toggleError && (
            <p className="mt-2 text-xs leading-relaxed text-bad">
              Não deu pra salvar agora — tenta de novo em instantes.
            </p>
          )}

          {optedIn && (
            <div className="mt-4 border-t border-border pt-4">
              <label className="block space-y-2">
                <span className="text-xs font-medium">Nome público (opcional)</span>
                <input
                  type="text"
                  value={publicName}
                  onChange={(e) => setPublicName(e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder="Como aparecer pra quem não é seu amigo"
                  maxLength={60}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                No ranking público, aparece esse nome (ou seu @, se deixar em branco) — nunca seu
                nome de conta. Pra amigos, sempre mostra seu nome de verdade.
              </p>

              <div className="mt-4 border-t border-border pt-4">
                {scanResult ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs leading-relaxed text-muted">
                      {scanResult.length === 0
                        ? "Nenhuma corrida antiga bateu com um lugar cadastrado."
                        : `Encontramos corrida em ${scanResult.length} lugar${scanResult.length > 1 ? "es" : ""}: ${scanResult
                            .map((g) => `${g.place.name} (${g.runs.length})`)
                            .join(", ")}.`}
                    </p>
                    <div className="flex gap-2">
                      {scanResult.length > 0 && (
                        <button
                          type="button"
                          onClick={handleConfirmScan}
                          disabled={confirming}
                          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {confirming ? "Contando…" : "Confirmar e contar"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setScanResult(null)}
                        className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleScan}
                    disabled={scanning}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold disabled:opacity-60"
                  >
                    {scanning ? "Escaneando…" : scanDone ? "Escanear de novo" : "Escanear corridas antigas"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Fallback tile for a playlist link this app can't resolve cover art for (anything non-Spotify) — same glyph `/perfil/ver` shows a friend. */
function PlaylistNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

/**
 * Links to the account's running playlists, shown here for editing and on
 * /perfil/ver for a friend viewing them. Cover art only resolves for Spotify
 * links (see src/lib/playlistLink.ts's own comment for why) — anything else
 * still saves and still shows as a tile, just with a generic note icon
 * instead of real art. Each tile is the whole clickable target (no URL text
 * under it) — with several playlists side by side, the art itself is what
 * tells them apart.
 */
function PlaylistCard() {
  const { status, account, profile, refresh } = useAuth();
  const entries = parsePlaylists(profile?.playlists);
  const [newUrl, setNewUrl] = useState("");
  const [resolvingCover, setResolvingCover] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function save(next: PlaylistEntry[]) {
    if (!account) return;
    setSaveError(false);
    try {
      await updateProfile(account.id, { playlists: serializePlaylists(next) });
      await refresh();
    } catch {
      setSaveError(true);
    }
  }

  async function handleAdd() {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    setResolvingCover(true);
    try {
      const coverUrl = await resolvePlaylistCover(trimmed);
      await save([...entries, { url: trimmed, coverUrl }]);
      setNewUrl("");
    } finally {
      setResolvingCover(false);
    }
  }

  async function handleRemove(index: number) {
    await save(entries.filter((_, i) => i !== index));
  }

  return (
    <Card className="pr-enter" style={delay(90)}>
      <CardTitle aside={<NoticeBadge>opcional</NoticeBadge>}>Playlists pra corrida</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Cole o link de uma ou mais playlists (Spotify, Apple Music, o que for) — amigos que veem seu
        perfil conseguem abrir elas direto.
      </p>

      {status !== "signed-in" ? (
        <p className="text-xs text-muted">Precisa de conta pra salvar (Google ou Apple, em Conta acima).</p>
      ) : (
        <>
          {entries.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3">
              {entries.map((entry, index) => (
                <div key={`${entry.url}-${index}`} className="relative">
                  <a href={entry.url} target="_blank" rel="noreferrer noopener" className="block">
                    {entry.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- an external cover URL, next/image's optimizer isn't available in a static export anyway.
                      <img
                        src={entry.coverUrl}
                        alt="Capa da playlist"
                        className="h-20 w-20 rounded-xl border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background text-muted">
                        <PlaylistNoteIcon />
                      </div>
                    )}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    aria-label="Remover playlist"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-bad"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="block space-y-2">
            <span className="text-xs font-medium">Adicionar playlist</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder="https://open.spotify.com/playlist/..."
                className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newUrl.trim() || resolvingCover}
                className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </label>
          {resolvingCover && <p className="mt-1.5 text-[11px] text-muted">Buscando a capa…</p>}
          {saveError && <p className="mt-1.5 text-[11px] text-bad">Não deu pra salvar agora — tenta de novo.</p>}
        </>
      )}
    </Card>
  );
}

/**
 * A toggle between the "atleta" and "treinador" home — renders nothing at
 * all unless this account actually coaches at least one accepted student,
 * since for everyone else (almost everyone) there's no second mode to
 * switch into. Changing it only swaps which tab leads the bottom nav (see
 * app-shell.tsx) and where a native launch lands (see standalone-gate.tsx)
 * — every other screen works exactly the same either way, and "atleta"
 * stays the default even for a coach: nobody expects the app they use to
 * log their own runs to suddenly open into someone else's dashboard the
 * first time they accept a student.
 */
function AppModeCard() {
  const { status } = useAuth();
  const [prefs, update] = usePreferences();
  const [coachesSomeone, setCoachesSomeone] = useState(false);

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listCoachConnections("accepted").then((rows) => {
      if (!cancelled) setCoachesSomeone(rows.some((c) => c.myRole === "coach"));
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!coachesSomeone) return null;

  return (
    <Card className="pr-enter" style={delay(25)}>
      <CardTitle>Modo do app</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Você treina outras pessoas — escolha o que abre primeiro quando você entra no app.
      </p>
      <div className="flex gap-2">
        <SegmentedButton selected={prefs.appMode === "atleta"} onClick={() => update({ appMode: "atleta" })}>
          Atleta
        </SegmentedButton>
        <SegmentedButton selected={prefs.appMode === "treinador"} onClick={() => update({ appMode: "treinador" })}>
          Treinador
        </SegmentedButton>
      </div>
    </Card>
  );
}

export default function PerfilPage() {
  /** Writes immediately — no save button to forget on the way out the door. */
  const [prefs, update] = usePreferences();

  return (
    <>
      <ScreenHeader compactOnWide title="Perfil" />

      <Screen panel>
        {/* `lg:pt-8`: makes up for `compactOnWide` collapsing ScreenHeader's
            own breathing room above — otherwise Conta would sit flush
            against the fixed top bar with zero gap on the desktop surface. */}
        <div className="lg:pt-8">
          <AccountCard />
        </div>

        {/*
          Everything below Conta/Aparência either reads local device state
          (IndexedDB run history, HealthKit/Health Connect) or configures a
          native-only screen (`/run`'s voice/vibration/live-stats settings) —
          none of it produces anything real in a desktop browser tab, where
          there's no device-local run history and no native APIs to read
          from. `lg:hidden` on each of those instead of trying to make them
          "work" there: the coach's desktop surface (see app-shell.tsx's
          DESKTOP_TABS) is meant to be its own product, not the native app's
          screens stretched wider — see PROJECT-CONTEXT.md. Conta and
          Aparência survive because they're plain account/device
          preferences that mean the same thing on any surface.
        */}
        <div className="lg:hidden">
          <AppModeCard />
        </div>

        <SectionLabel delayMs={20}>Aparência</SectionLabel>
        <Card className="pr-enter lg:rounded-lg lg:p-4" style={delay(30)}>
          <CardTitle>Tema</CardTitle>
          <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
            &quot;Sistema&quot; segue o tema do aparelho e muda sozinho se você trocar por lá.
          </p>
          {/* Mobile keeps the touch-sized pill track every other screen uses
              (PillTabs, shared) — at `lg:` this swaps for a tighter row of
              square-cornered buttons instead, same reasoning as AccountCard's
              own `lg:` overrides just above: a settings control, not a
              touch target. Not done by restyling `PillTabs` itself, since
              that component is reused by several mobile-only screens
              (/treinador, /amigos, /longao…) that should keep their current
              look untouched. */}
          <div className="lg:hidden">
            <PillTabs tabs={THEMES} active={prefs.theme} onChange={(theme) => update({ theme })} />
          </div>
          <div className="hidden gap-1.5 lg:flex">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={prefs.theme === t.id}
                onClick={() => update({ theme: t.id })}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  prefs.theme === t.id
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted hover:border-accent hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        <div className="lg:hidden">
          <SectionLabel delayMs={40}>Descubra e conecte</SectionLabel>
          <Card className="pr-enter" style={delay(50)}>
            <DiscoveryRow
              href="/lugares"
              icon={<PlacesIcon className="h-4.5 w-4.5" />}
              label="Lugares pra correr"
              caption="Parques e rotas avaliados por quem já correu lá"
              tag="São Paulo"
            />
            <DiscoveryRow
              href="/amigos"
              icon={<FriendsIcon className="h-4.5 w-4.5" />}
              label="Amigos"
              caption="Adicione quem você corre junto pelo @"
              tag="precisa de conta"
            />
            <DiscoveryRow
              href="/treinador"
              icon={<CoachIcon className="h-4.5 w-4.5" />}
              label="Treinador"
              caption="Conecte com quem te treina ou com quem você treina"
              tag="precisa de conta"
            />
            <DiscoveryRow
              href="/longao"
              icon={<LongaoIcon className="h-4.5 w-4.5" />}
              label="Longão"
              caption="Corrida em grupo com código — só amigos entram"
              tag="precisa de conta"
            />
            <DiscoveryRow
              href="https://instagram.com/xanthus.oficial"
              external
              icon={<InstagramIcon className="h-4.5 w-4.5" />}
              label="Instagram"
              caption="@xanthus.oficial · corridas de quem já usa o app"
              tag="conectar"
            />
          </Card>
        </div>

        <div className="lg:hidden">
          <PlaceLeaderboardCard />
        </div>
        <div className="lg:hidden">
          <PlaylistCard />
        </div>

        <div className="lg:hidden">
          <SectionLabel delayMs={110}>Treino</SectionLabel>
          <Card className="pr-enter" style={delay(120)}>
            <CardTitle>Preferências de corrida</CardTitle>

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
              <div className="mt-3">
                <PillTabs
                  tabs={UNITS.map((unit) => ({ id: unit.value, label: unit.label }))}
                  active={prefs.distanceUnit}
                  onChange={(value) => update({ distanceUnit: value })}
                />
                <p className="mt-1.5 font-mono text-[10px] text-muted">
                  {UNITS.find((unit) => unit.value === prefs.distanceUnit)?.hint}
                </p>
              </div>
            </fieldset>

            <fieldset className="mt-6 border-t border-border pt-5">
              <legend className="text-sm font-medium">Estatísticas na tela de corrida</legend>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Além do pace ao vivo, que fica sempre em destaque.
              </p>
              <div className="mt-3 flex flex-col gap-3.5">
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

            <fieldset className="mt-6 border-t border-border pt-5">
              <legend className="text-sm font-medium">Vibração</legend>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Só com meta de &quot;Ritmo&quot; — vibra quando você atrasa 20s do alvo.
              </p>
              <div className="mt-3">
                <PreferenceToggle
                  label="Vibrar quando atrasar do ritmo"
                  hint="silencioso o resto do tempo, mesmo com meta de ritmo ativa"
                  checked={prefs.vibrateOnPaceDelay}
                  onChange={(checked) => update({ vibrateOnPaceDelay: checked })}
                />
              </div>
            </fieldset>

            <fieldset className="mt-6 border-t border-border pt-5">
              <legend className="text-sm font-medium">Lembrete de gel de carboidrato</legend>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Aviso por voz baseado no tempo de corrida.{" "}
                <Link href="/estudos" className="text-accent underline underline-offset-2">
                  Ver o estudo
                </Link>
                .
              </p>
              <div className="mt-3">
                <PreferenceToggle
                  label="Lembrar de tomar gel"
                  hint="silencioso em corridas curtas — só dispara depois do primeiro intervalo"
                  checked={prefs.carbReminderEnabled}
                  onChange={(checked) => update({ carbReminderEnabled: checked })}
                />
              </div>
              {prefs.carbReminderEnabled && (
                <div className="mt-4">
                  <PillSlider
                    min={CARB_REMINDER_MIN_MINUTES}
                    max={CARB_REMINDER_MAX_MINUTES}
                    step={CARB_REMINDER_STEP_MINUTES}
                    value={prefs.carbReminderIntervalMinutes}
                    onChange={(minutes) => update({ carbReminderIntervalMinutes: minutes })}
                    formatValue={(minutes) => `a cada ${minutes} min`}
                  />
                  <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
                    <span>{CARB_REMINDER_MIN_MINUTES} min</span>
                    <span>{CARB_REMINDER_MAX_MINUTES} min</span>
                  </div>
                </div>
              )}
            </fieldset>

            <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-muted">
              Meta de prova e tempo recente ficam na aba{" "}
              <Link href="/plano" className="text-accent underline underline-offset-2">
                Plano
              </Link>
              , perto de onde eles são usados.
            </p>
          </Card>
        </div>

        <div className="lg:hidden">
          <SectionLabel delayMs={175}>Equipamento</SectionLabel>
          <ShoesCard unit={prefs.distanceUnit} />
        </div>

        <div className="lg:hidden">
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
        </div>

        <div className="lg:hidden">
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
        </div>

      </Screen>
    </>
  );
}
