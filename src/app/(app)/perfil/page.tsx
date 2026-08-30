"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { firePaceDelayVibration } from "@/lib/tracking/useRunTracker";
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
import { listCompletedRuns, type CompletedRun } from "@/lib/tracking/storage";
import { updateProfile } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { listCoachConnections } from "@/lib/coachRelationships";
import { matchPlaceForRoute } from "@/lib/placeMatch";
import { recordRunAtPlace } from "@/lib/placeLeaderboard";
import { clearMyPresence } from "@/lib/friendPresence";
import type { RunningPlace } from "@/lib/places";
import { ProgressoContent } from "../progresso/progresso-content";

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

/**
 * One dense row inside `DiscoveryCard` below — icon badge, truncating
 * label/caption, a status tag, a chevron. The compact list-row treatment
 * the redesign handoff (Xanthus Perfil.dc.html) uses for every plain
 * "goes to another real screen, nothing else on it" link — as opposed to
 * the health-data preview below, which keeps its own dedicated card
 * because it embeds a real visual, not just a caption.
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

/**
 * A compact horizontal alternative to `PreferenceToggle` for a cluster of
 * independent booleans that would otherwise stack into a tall list of
 * full-width rows (each with its own label + hint line) — same active/
 * inactive pill language the search filters (`/progresso`'s activity feed,
 * `PillTabs`) already use, just multi-select instead of one-at-a-time.
 */
function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
        checked ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
      }`}
    >
      {label}
    </button>
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
        Seu km por lugar, num ranking público e um entre amigos.
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
                Amigos sempre veem seu nome de verdade.
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

/**
 * "Correr por amigo por perto" opt-in — same shape/reasoning as
 * `PlaceLeaderboardCard` above (`try/finally` around the toggle, same
 * stuck-switch bug class it already fixed once), but much shorter: there's
 * no scan/confirm step here, just a switch. Turning it off calls
 * `clearMyPresence()` so the last known location stops being visible to
 * friends immediately, not just "stops updating."
 */
function NearbyFriendsCard() {
  const { status, account, profile, refresh } = useAuth();
  const [savingToggle, setSavingToggle] = useState(false);
  const [toggleError, setToggleError] = useState(false);
  const optedIn = profile?.nearbyOptIn ?? false;

  async function handleToggle(next: boolean) {
    if (!account || savingToggle) return;
    setSavingToggle(true);
    setToggleError(false);
    try {
      await updateProfile(account.id, { nearbyOptIn: next });
      if (!next) await clearMyPresence();
      await refresh();
    } catch {
      setToggleError(true);
    } finally {
      setSavingToggle(false);
    }
  }

  return (
    <Card className="pr-enter" style={delay(87)}>
      <CardTitle aside={<NoticeBadge>desligado por padrão</NoticeBadge>}>Amigo por perto</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Leitura pontual da localização ao abrir o app — nunca rastreamento contínuo. Só amigos
        aceitos veem isso.
      </p>
      {status !== "signed-in" ? (
        <p className="text-xs text-muted">Precisa de conta pra participar (Google ou Apple, em Conta acima).</p>
      ) : (
        <>
          <PreferenceToggle
            label="Avisar quando um amigo estiver por perto"
            hint="desligar apaga sua última leitura na hora"
            checked={optedIn}
            onChange={handleToggle}
          />
          {toggleError && (
            <p className="mt-2 text-xs leading-relaxed text-bad">
              Não deu pra salvar agora — tenta de novo em instantes.
            </p>
          )}
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
      <div className="mt-3 flex gap-2">
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

type PerfilTab = "ajustes" | "progresso";

const PERFIL_TABS: { id: PerfilTab; label: string }[] = [
  { id: "ajustes", label: "Ajustes" },
  { id: "progresso", label: "Progresso" },
];

export default function PerfilPage() {
  /** Writes immediately — no save button to forget on the way out the door. */
  const [prefs, update] = usePreferences();
  /** Drives the "Testar vibração" button's own label swap — see that button's comment for why it exists. */
  const [vibrateTested, setVibrateTested] = useState(false);
  /**
   * /progresso used to be its own bottom-nav tab; folded in here as a
   * second tab instead (bottom nav down to 3: Corrida, Plano, Perfil — see
   * app-shell.tsx). Defaults to "ajustes" everywhere, including desktop,
   * where the tab switcher itself never renders (`lg:hidden` below) — see
   * ProgressoContent's own `lg:hidden` wrapper for why.
   */
  const [activeTab, setActiveTab] = useState<PerfilTab>("ajustes");

  // A run's "voltar"/"fechar" button (historico/detalhe, historico/video,
  // /progresso/trajeto, /emblemas) links back here with `?tab=progresso` so
  // it lands on the tab it actually came from, not always the default.
  // Read straight off `window.location.search` instead of
  // `useSearchParams()` so this page doesn't need a Suspense boundary just
  // for a value only ever read once, on mount — same pattern /amigos uses.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "progresso") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (the URL), not from other React state; there's nothing to read this from except an effect.
      setActiveTab("progresso");
    }
  }, []);

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
          <PillTabs tabs={PERFIL_TABS} active={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "progresso" ? (
          <div className="flex flex-col gap-5 lg:hidden">
            <ProgressoContent />
          </div>
        ) : (
        <>
        <div className="lg:hidden">
          <AppModeCard />
        </div>

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
          <NearbyFriendsCard />
        </div>

        <div className="lg:hidden">
          <SectionLabel delayMs={110}>Treino</SectionLabel>
          <Card className="pr-enter" style={delay(120)}>
            <CardTitle>Preferências de corrida</CardTitle>

            <fieldset>
              <legend className="text-sm font-medium">Aviso de parcial a cada</legend>
              <PillSlider
                className="mt-3"
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

            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="text-sm font-medium">Unidade de distância</legend>
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

            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="text-sm font-medium">Estatísticas na tela de corrida</legend>
              <div className="mt-3 flex gap-2">
                <ToggleChip
                  label="Pace total"
                  checked={prefs.showAveragePaceLive}
                  onChange={(checked) => update({ showAveragePaceLive: checked })}
                />
                <ToggleChip
                  label="Pace do km atual"
                  checked={prefs.showCurrentKmPaceLive}
                  onChange={(checked) => update({ showCurrentKmPaceLive: checked })}
                />
              </div>
            </fieldset>

            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="text-sm font-medium">Vibração</legend>
              {/*
                Isolates "o toggle não vibra durante a corrida" into two
                separate questions someone can answer without waiting 20s
                atrasado no meio de uma corrida de verdade: aperta aqui —
                se não vibrar, o problema é o aparelho/plugin (modo
                silencioso bloqueando o motor, permissão negada, etc.), não
                a lógica de atraso de ritmo em si; se vibrar aqui mas nunca
                durante uma corrida, o problema é a condição de disparo
                (meta não é "Ritmo", ou nunca ficou 20s atrasado de verdade).
              */}
              <div className="mt-3 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PreferenceToggle
                    label="Vibrar quando atrasar do ritmo"
                    hint="só com meta de ritmo, ao passar 20s do alvo"
                    checked={prefs.vibrateOnPaceDelay}
                    onChange={(checked) => update({ vibrateOnPaceDelay: checked })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVibrateTested(true);
                    firePaceDelayVibration();
                    window.setTimeout(() => setVibrateTested(false), 2000);
                  }}
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition-colors active:text-foreground"
                >
                  {vibrateTested ? "Vibrou?" : "Testar"}
                </button>
              </div>
            </fieldset>

            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="text-sm font-medium">Lembrete de gel de carboidrato</legend>
              <div className="mt-3">
                <PreferenceToggle
                  label="Lembrar de tomar gel"
                  hint="baseado no tempo de corrida, silencioso em corridas curtas"
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
        </>
        )}

        {/* Always the real hosted domain, on purpose — opens in the system
            browser (target="_blank") rather than an in-app screen, and the
            canonical public URL is what belongs there regardless of which
            host happens to be serving this page (xanthus.app.br in
            production, but also the .workers.dev host or localhost in dev). */}
        <a
          href="https://xanthus.app.br/privacidade"
          target="_blank"
          rel="noopener noreferrer"
          className="pr-enter block py-2 text-center text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
        >
          Política de privacidade
        </a>

      </Screen>
    </>
  );
}
