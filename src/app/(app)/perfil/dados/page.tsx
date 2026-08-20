"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";
import { PillSlider } from "../../pill-slider";
import { ModalPortal } from "../../modal-portal";
import { useEffectiveColorScheme } from "@/lib/theme";
import {
  listPainCheckIns,
  reportPain,
  type PainCheckIn,
  type PainSeverity,
} from "@/lib/tracking/storage";
import { activePainSignal } from "@/lib/plan";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import type { RunnerProfile } from "@/lib/runnerProfile";

/**
 * Split out of `/perfil` on request: weight and pain are properties of the
 * athlete, not app settings, and sitting between "unidade de distância" and
 * "meus tênis" made the main screen read as one long undifferentiated list
 * ("tem muita coisa na aba de perfil"). This page is reached from the
 * "Conta" card rather than the bottom nav — it has no destination of its
 * own beyond editing these two things.
 */

const PAIN_SEVERITY_OPTIONS: { value: PainSeverity; label: string; hint: string }[] = [
  { value: "leve", label: "Leve", hint: "incômodo, dá pra rodar" },
  { value: "moderada", label: "Moderada", hint: "atrapalha o pace" },
  { value: "forte", label: "Forte", hint: "melhor não treinar" },
];

const PAIN_SEVERITY_LABEL: Record<PainSeverity, string> = {
  leve: "leve",
  moderada: "moderada",
  forte: "forte",
};

function sinceLabel(timestamp: number, now = Date.now()): string {
  const days = Math.floor((now - timestamp) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

interface BodyZone {
  id: string;
  label: string;
  side?: "E" | "D";
}

/** The running-specific injury sites a tap-to-select diagram actually needs — shoulders down to ankles, the same list a physio would ask about after an overuse complaint. Ids double as the actual `Mesh.name` values `BodyModel3D` raycasts against below. */
const BODY_ZONES: BodyZone[] = [
  { id: "ombro-e", label: "Ombro", side: "E" },
  { id: "ombro-d", label: "Ombro", side: "D" },
  { id: "lombar", label: "Lombar" },
  { id: "quadril", label: "Quadril" },
  { id: "coxa-e", label: "Coxa", side: "E" },
  { id: "coxa-d", label: "Coxa", side: "D" },
  { id: "joelho-e", label: "Joelho", side: "E" },
  { id: "joelho-d", label: "Joelho", side: "D" },
  { id: "canela-e", label: "Canela", side: "E" },
  { id: "canela-d", label: "Canela", side: "D" },
  { id: "tornozelo-e", label: "Tornozelo", side: "E" },
  { id: "tornozelo-d", label: "Tornozelo", side: "D" },
];

type BodyZoneId = string;

function zoneLabel(zone: BodyZone): string {
  return zone.side ? `${zone.label} ${zone.side}` : zone.label;
}

/**
 * 3D body model for tap-to-select pain location — replaces the flat SVG
 * silhouette with a real WebGL scene the athlete can rotate (drag) and tap,
 * mirroring `Xanthus Dor 3D.dc.html`/`Xanthus Corpo 3D.html`. Colors come
 * from `--muted`/`--accent` read live off the document at mount and again
 * on every theme change, the same "follow the app's own tokens instead of
 * the mock's hardcoded ones" rule the old `BodyDiagram` comment stated —
 * `--accent` in particular isn't the same hex in light vs. dark mode here.
 *
 * The reference prototype's mesh only names 17 generic body parts (head,
 * neck, torso, hips, arms, hands, feet) — no separate shoulder, knee,
 * ankle, or lower-back object at all, just continuous limb capsules. This
 * app's own pain check-in needs exactly those four instead (the actual
 * common running-injury sites), so small extra marker meshes are added at
 * those joints on top of the prototype's own geometry — everything else
 * (head/neck/torso/arms/forearms/hands/feet) renders for a recognizable
 * silhouette but isn't a hit target, since none of it is in `BODY_ZONES`.
 */
function BodyModel3D({
  zoneId,
  onSelect,
}: {
  zoneId: BodyZoneId | null;
  onSelect: (id: BodyZoneId | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const isDarkMode = useEffectiveColorScheme() === "dark";

  const zoneIdRef = useRef(zoneId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    zoneIdRef.current = zoneId;
    onSelectRef.current = onSelect;
  });
  /** Populated by the mount effect below; the theme-change effect calls through these instead of rebuilding the whole scene just to swap two colors. */
  const applyHighlightRef = useRef<((name: string | null) => void) | null>(null);
  const readColorsRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;

    const scene = new Scene();
    const camera = new PerspectiveCamera(32, w / h, 0.1, 10);
    camera.position.set(0, 1.0, 2.6);
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    scene.add(new HemisphereLight(0xffffff, 0x222233, 1.1));
    const key = new DirectionalLight(0xffffff, 1.3);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new DirectionalLight(0x6a86c9, 0.4);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    const colors = { base: new Color(0x8a8f99), accent: new Color(0x4a78e0) };
    const readColors = () => {
      const styles = getComputedStyle(document.documentElement);
      const muted = styles.getPropertyValue("--muted").trim();
      const accent = styles.getPropertyValue("--accent").trim();
      if (muted) colors.base.set(muted);
      if (accent) colors.accent.set(accent);
    };
    readColors();
    readColorsRef.current = readColors;

    const inertMaterial = new MeshStandardMaterial({ color: colors.base, roughness: 0.6, metalness: 0.15, side: DoubleSide });
    const materials: Record<string, MeshStandardMaterial> = {};
    const matFor = (name: string) => {
      if (!materials[name]) {
        materials[name] = new MeshStandardMaterial({ color: colors.base, roughness: 0.6, metalness: 0.15, side: DoubleSide });
      }
      return materials[name];
    };

    const group = new Group();

    // --- silhouette only, not selectable: head, neck, torso, arms, hands, feet ---
    const head = new Mesh(new SphereGeometry(0.11, 24, 24), inertMaterial);
    head.position.set(0, 1.62, 0);
    group.add(head);

    const neck = new Mesh(new CapsuleGeometry(0.045, 0.06, 6, 12), inertMaterial);
    neck.position.set(0, 1.48, 0);
    group.add(neck);

    const torsoPts = [
      [0.0, 0.85], [0.16, 0.85], [0.15, 0.92], [0.17, 1.02], [0.2, 1.2], [0.19, 1.35], [0.16, 1.45], [0.0, 1.48],
    ].map(([x, y]) => new Vector2(x, y - 0.85));
    const torso = new Mesh(new LatheGeometry(torsoPts, 32), inertMaterial);
    torso.position.y = 0.85;
    group.add(torso);

    ([-1, 1] as const).forEach((side) => {
      const shoulderX = side * 0.21;
      const upperArm = new Mesh(new CapsuleGeometry(0.045, 0.28, 6, 12), inertMaterial);
      upperArm.position.set(shoulderX * 1.05, 1.22, 0);
      upperArm.rotation.z = side * 0.18;
      group.add(upperArm);

      const lowerArm = new Mesh(new CapsuleGeometry(0.038, 0.26, 6, 12), inertMaterial);
      lowerArm.position.set(shoulderX * 1.18, 0.92, 0);
      lowerArm.rotation.z = side * 0.06;
      group.add(lowerArm);

      const hand = new Mesh(new SphereGeometry(0.04, 12, 12), inertMaterial);
      hand.position.set(shoulderX * 1.22, 0.76, 0);
      group.add(hand);

      const foot = new Mesh(new BoxGeometry(0.08, 0.045, 0.16), inertMaterial);
      foot.position.set(side * 0.095, 0.01, 0.03);
      group.add(foot);
    });

    // --- selectable zones — BODY_ZONES ids become the actual Mesh.name raycast targets ---
    const hipsPts = [[0, 0.82], [0.13, 0.82], [0.155, 0.9], [0.16, 1.0], [0, 1.0]].map(
      ([x, y]) => new Vector2(x, y),
    );
    const hips = new Mesh(new LatheGeometry(hipsPts, 32), matFor("quadril"));
    hips.name = "quadril";
    group.add(hips);

    // A short horizontal bar low on the back of the torso — the prototype's mesh has no lower-back object at all. Pushed well past the hips' own back surface (z ≈ -0.155 at this height) so the ray hits it before it hits the hips mesh behind it.
    const lombar = new Mesh(new CapsuleGeometry(0.1, 0.12, 6, 12), matFor("lombar"));
    lombar.name = "lombar";
    lombar.rotation.x = Math.PI / 2;
    lombar.position.set(0, 0.95, -0.22);
    group.add(lombar);

    ([-1, 1] as const).forEach((side) => {
      // Pushed past both the torso's own radius at this height (~0.19) and the upper arm's (0.045), or it'd sit half-buried inside one or the other from the camera's side.
      const shoulderId = side < 0 ? "ombro-e" : "ombro-d";
      const shoulder = new Mesh(new SphereGeometry(0.075, 16, 16), matFor(shoulderId));
      shoulder.name = shoulderId;
      shoulder.position.set(side * 0.25, 1.38, 0.04);
      group.add(shoulder);

      const hipX = side * 0.095;
      const thighId = side < 0 ? "coxa-e" : "coxa-d";
      const thigh = new Mesh(new CapsuleGeometry(0.075, 0.38, 6, 12), matFor(thighId));
      thigh.name = thighId;
      thigh.position.set(hipX, 0.55, 0);
      group.add(thigh);

      // Sits in the overlap between thigh and shin (their capsule caps already interpenetrate there). The forward offset (0.09) has to clear the thigh's own radius (0.075) — anything less and the thigh's front surface is still closer to the camera than this marker at the same x/y, so the ray hits the thigh first.
      const kneeId = side < 0 ? "joelho-e" : "joelho-d";
      const knee = new Mesh(new SphereGeometry(0.07, 16, 16), matFor(kneeId));
      knee.name = kneeId;
      knee.position.set(hipX, 0.355, 0.09);
      group.add(knee);

      const shinId = side < 0 ? "canela-e" : "canela-d";
      const shin = new Mesh(new CapsuleGeometry(0.055, 0.36, 6, 12), matFor(shinId));
      shin.name = shinId;
      shin.position.set(hipX, 0.19, 0);
      group.add(shin);

      // Same reasoning as the knee marker — clears the shin's own radius (0.055) and the foot's front edge.
      const ankleId = side < 0 ? "tornozelo-e" : "tornozelo-d";
      const ankle = new Mesh(new SphereGeometry(0.06, 16, 16), matFor(ankleId));
      ankle.name = ankleId;
      ankle.position.set(hipX, 0.0, 0.08);
      group.add(ankle);
    });

    group.position.y = -0.82;
    scene.add(group);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 3.6;
    controls.target.set(0, 0, 0);
    controls.update();

    const raycaster = new Raycaster();
    const pointer = new Vector2();

    const applyHighlight = (name: string | null) => {
      inertMaterial.color.copy(colors.base);
      Object.entries(materials).forEach(([n, m]) => m.color.copy(n === name ? colors.accent : colors.base));
    };
    applyHighlightRef.current = applyHighlight;
    applyHighlight(zoneIdRef.current);

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(group.children).find((h) => materials[h.object.name]);
      if (!hit) return;
      const name = hit.object.name;
      const next = zoneIdRef.current === name ? null : name;
      applyHighlight(next);
      onSelectRef.current(next);
    };
    renderer.domElement.addEventListener("click", onClick);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      applyHighlightRef.current = null;
      inertMaterial.dispose();
      Object.values(materials).forEach((m) => m.dispose());
      group.traverse((obj) => {
        if (obj instanceof Mesh) obj.geometry.dispose();
      });
      renderer.dispose();
      el.innerHTML = "";
    };
    // Intentionally mount-once: `zoneId`/`onSelect` are read through the refs above so this never has to tear down and rebuild the whole WebGL scene just because the selection changed.
  }, []);

  // Selection changed for a reason other than this component's own click handler (e.g. cleared after a successful submit) — just re-tint, no scene rebuild.
  useEffect(() => {
    applyHighlightRef.current?.(zoneId);
  }, [zoneId]);

  // Theme toggled — re-read --muted/--accent and re-tint with the new values.
  useEffect(() => {
    readColorsRef.current();
    applyHighlightRef.current?.(zoneIdRef.current);
  }, [isDarkMode]);

  return (
    <div className="relative h-[300px] w-full overflow-hidden rounded-2xl bg-background">
      <div ref={mountRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          Carregando modelo…
        </div>
      )}
    </div>
  );
}

/**
 * Whether the athlete is dealing with pain, read from an append-only log
 * (see `PainCheckIn`) instead of a single toggle. Feeds `/plano` through
 * `activePainSignal`: a reported check-in cuts and holds the volume ramp
 * instead of the plan quietly climbing through it, which is the single
 * biggest complaint in competitor reviews of AI training-plan apps — the
 * plan doesn't react when the athlete says something hurts.
 */
function PainCard() {
  const [checkIns, setCheckIns] = useState<PainCheckIn[] | null>(null);
  const [zoneId, setZoneId] = useState<BodyZoneId | null>(null);
  const [severityIndex, setSeverityIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => listPainCheckIns().then(setCheckIns), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = checkIns ? activePainSignal(checkIns) : null;
  const selected = PAIN_SEVERITY_OPTIONS[severityIndex];
  const selectedZone = BODY_ZONES.find((zone) => zone.id === zoneId) ?? null;

  const submit = async () => {
    setBusy(true);
    await reportPain({ severity: selected.value, region: selectedZone ? zoneLabel(selectedZone) : undefined });
    setZoneId(null);
    setSeverityIndex(0);
    setBusy(false);
    await refresh();
  };

  const clear = async () => {
    setBusy(true);
    await reportPain({ severity: "recuperado" });
    setBusy(false);
    await refresh();
  };

  return (
    <Card className="pr-enter" style={delay(60)}>
      <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Como você está</CardTitle>

      {checkIns === null ? (
        <div className="h-12 animate-pulse rounded-lg bg-background" />
      ) : active ? (
        <>
          <p className="text-sm leading-relaxed text-pretty">
            Dor <strong>{PAIN_SEVERITY_LABEL[active.severity]}</strong> sinalizada{" "}
            {sinceLabel(active.reportedAt)}
            {active.region ? ` — ${active.region}` : ""}. O <Link href="/plano" className="underline underline-offset-2">plano</Link> reduziu o volume dessa semana e segura a
            progressão por um tempo antes de voltar a subir.
          </p>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="mt-4 min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-accent disabled:opacity-60"
          >
            Voltei a treinar sem dor
          </button>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Sentindo alguma dor ou desconforto? Sinalizar aqui reduz o volume da semana no plano em
            vez de ignorar e seguir subindo.
          </p>
          <div className="mb-4">
            <BodyModel3D zoneId={zoneId} onSelect={setZoneId} />
            <p
              className={`mt-1 text-center text-sm font-bold ${selectedZone ? "text-foreground" : "text-muted font-semibold"}`}
            >
              {selectedZone ? zoneLabel(selectedZone) : "Toque no local da dor (opcional)"}
            </p>
          </div>

          <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
            Intensidade
          </span>
          <PillSlider
            min={0}
            max={PAIN_SEVERITY_OPTIONS.length - 1}
            step={1}
            value={severityIndex}
            onChange={setSeverityIndex}
            formatValue={(value) => PAIN_SEVERITY_OPTIONS[value].label}
            tickCount={PAIN_SEVERITY_OPTIONS.length}
          />
          <p className="mt-2 min-h-8 text-xs leading-relaxed text-muted text-pretty">{selected.hint}</p>

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {busy ? "Sinalizando…" : `Sinalizar dor ${selected.label.toLowerCase()}`}
          </button>
        </>
      )}
    </Card>
  );
}

const WEIGHT_MIN_KG = 30;
const WEIGHT_MAX_KG = 150;
const WEIGHT_DEFAULT_KG = 70;

/**
 * The stepper sheet mirrors the design handoff's bottom-sheet weight picker
 * (same shell `GoalDatePicker`/`SortSheet` use) rather than the old inline
 * slider — a modal makes sense here because setting weight is a rare,
 * deliberate edit, not something glanced at inline like the pain intensity
 * pills above.
 *
 * Keeps the "never invents a number" rule from the old copy: with no weight
 * saved yet, this shows a prompt rather than a sheet already parked on some
 * value that would read as a real, if never-touched, answer.
 */
function WeightCard({
  profile,
  updateProfile,
}: {
  profile: RunnerProfile;
  updateProfile: (patch: Partial<RunnerProfile>) => void;
}) {
  const hasWeight = profile.weightKg != null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(profile.weightKg ?? WEIGHT_DEFAULT_KG);

  const openSheet = () => {
    setDraft(profile.weightKg ?? WEIGHT_DEFAULT_KG);
    setOpen(true);
  };

  const save = () => {
    updateProfile({ weightKg: draft });
    setOpen(false);
  };

  return (
    <Card className="pr-enter" style={delay(90)}>
      <CardTitle aside={<NoticeBadge>opcional</NoticeBadge>}>Peso</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Só usado pra estimar calorias gastas em cada corrida (≈1 kcal/kg/km, mais o custo
        real de subida). Sem peso cadastrado, o app simplesmente não mostra a estimativa —
        nunca inventa um número em cima de um peso chutado.
      </p>

      {hasWeight ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-metal font-mono text-2xl tabular-nums">
              {profile.weightKg}
              <span className="ml-1 text-sm text-muted">kg</span>
            </p>
            <button
              type="button"
              onClick={openSheet}
              className="shrink-0 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent"
            >
              Editar
            </button>
          </div>
          <button
            type="button"
            onClick={() => updateProfile({ weightKg: undefined })}
            className="mt-3 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
          >
            Remover peso cadastrado
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold hover:border-accent"
        >
          Definir peso
        </button>
      )}

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Definir peso"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-background p-5 pb-8 text-foreground sm:rounded-3xl"
            >
              <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-border" />
              <p className="mb-6 text-center text-base font-bold">Definir peso</p>
              <div className="mb-7 flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={() => setDraft((value) => Math.max(WEIGHT_MIN_KG, value - 1))}
                  aria-label="Diminuir peso"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl font-bold hover:border-accent"
                >
                  –
                </button>
                <p className="min-w-28 text-center font-mono text-4xl font-extrabold tabular-nums">
                  {draft}
                  <span className="ml-1 text-base font-semibold text-muted">kg</span>
                </p>
                <button
                  type="button"
                  onClick={() => setDraft((value) => Math.min(WEIGHT_MAX_KG, value + 1))}
                  aria-label="Aumentar peso"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl font-bold hover:border-accent"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={save}
                className="min-h-12 w-full rounded-full bg-accent px-4 py-3 text-sm font-bold text-accent-foreground"
              >
                Salvar
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </Card>
  );
}

export default function DadosPessoaisPage() {
  const [profile, updateProfile] = useRunnerProfile();

  return (
    <>
      <ScreenHeader title="Dados pessoais" subtitle="Peso e dores — propriedades suas, não do app." />

      <Screen>
        <PainCard />

        <WeightCard profile={profile} updateProfile={updateProfile} />

        <Link
          href="/perfil"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(120)}
        >
          Voltar pro perfil
        </Link>
      </Screen>
    </>
  );
}
