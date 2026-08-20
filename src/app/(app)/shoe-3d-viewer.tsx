"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Real interactive 3D shoe — the "vitrine" upgrade to `ShoeShowcase`'s photo/
 * video loot-item presentation, for the one place that's a deliberate,
 * single-instance showcase rather than a list row (`ShoeHero` on /perfil).
 * Source model: a generic running shoe from Sketchfab (CC-BY-4.0,
 * shyambhanushali3 — credited in /privacidade), ~340k triangles/no textures
 * as downloaded. Optimized once offline with `@gltf-transform/cli optimize
 * --compress meshopt` (weld/simplify/meshopt-encode, no visible geometry
 * loss at this size) — 10.3MB down to ~360KB — and committed as
 * `public/models/xanthus-running-shoe.glb`; nothing in this component
 * re-derives that, it just needs `GLTFLoader.setMeshoptDecoder` to read the
 * result back.
 *
 * Recoloring happens once per material, right after load, by luminance band
 * — the same rule the design reference used, just applied live in Three.js
 * instead of baked into the file, so it can stay theme/athlete-color-aware
 * like every other tinted thing in this app (see BodyModel3D in
 * perfil/dados/page.tsx for the same "read once, re-tint via a ref on
 * prop/theme change without rebuilding the scene" shape this mirrors):
 * - near-black source (outsole rubber) → fixed dark `#14151a`
 * - bright + low-saturation source (laces, midsole foam, lining — anything
 *   left at the GLB's default white) → fixed off-white `#f0eee8`
 * - everything else (the upper — the shoe's dominant surface) → the `color`
 *   prop, so this doubles as this app's per-shoe color personalization
 *   rather than only ever rendering one fixed brand colorway.
 */

const SHOE_MODEL_SRC = "/models/xanthus-running-shoe.glb";

const DARK_LUMINANCE_MAX = 0.16;
const LIGHT_LUMINANCE_MIN = 0.85;
const LIGHT_SATURATION_MAX = 0.12;
const DARK_HEX = "#14151a";
const LIGHT_HEX = "#f0eee8";

function luminance(c: Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
function saturation(c: Color): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
}

export function Shoe3DViewer({
  color,
  className,
  onFailed,
}: {
  /** The shoe's registered color (Shoe.color) — used for every material that isn't classified as the fixed dark/off-white bands above. */
  color: string;
  className?: string;
  /** WebGL unsupported, or the GLB failed to load/parse — caller's cue to fall back to `ShoeShowcase` instead. */
  onFailed?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const colorRef = useRef(color);
  useEffect(() => {
    colorRef.current = color;
  });
  const applyColorRef = useRef<(hex: string) => void>(() => {});

  useEffect(() => {
    const el = mountRef.current;
    const onFailedFn = onFailed;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;

    let disposed = false;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFailedFn?.();
      return;
    }

    const scene = new Scene();
    const camera = new PerspectiveCamera(30, w / h, 0.05, 20);
    camera.position.set(0.85, 0.6, 1.25);

    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    scene.add(new HemisphereLight(0xffffff, 0x1a1d22, 1.2));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new DirectionalLight(0x6a86c9, 0.5);
    fill.position.set(-2, 1, -1.5);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 0.6;
    controls.maxDistance = 2.4;
    controls.target.set(0, 0.03, 0);
    controls.update();

    const primaryMaterials: MeshStandardMaterial[] = [];
    let modelRoot: Group | null = null;
    let autoRotate = true;
    const stopAutoRotate = () => {
      autoRotate = false;
    };
    renderer.domElement.addEventListener("pointerdown", stopAutoRotate);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      SHOE_MODEL_SRC,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;

        // The source mesh's own scale/origin aren't meaningful to this camera rig — normalize to a unit-ish size centered at the target regardless of what the file happens to use.
        const box = new Box3().setFromObject(root);
        const size = new Vector3();
        box.getSize(size);
        const center = new Vector3();
        box.getCenter(center);
        const scale = 1 / (Math.max(size.x, size.y, size.z) || 1);
        root.scale.setScalar(scale);
        root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        root.rotation.y = Math.PI * 0.15;

        root.traverse((obj) => {
          if (!(obj instanceof Mesh)) return;
          const wasArray = Array.isArray(obj.material);
          const sources = (wasArray ? obj.material : [obj.material]) as Material[];
          const recolored = sources.map((source) => {
            const src = source as MeshStandardMaterial;
            const base = src.color ? src.color.clone() : new Color(0xffffff);
            const lum = luminance(base);
            const next = new MeshStandardMaterial({
              metalness: Math.min(0.3, src.metalness ?? 0),
              roughness: Math.max(0.45, src.roughness ?? 1),
              side: src.side,
            });
            if (lum < DARK_LUMINANCE_MAX) {
              next.color.set(DARK_HEX);
            } else if (lum > LIGHT_LUMINANCE_MIN && saturation(base) < LIGHT_SATURATION_MAX) {
              next.color.set(LIGHT_HEX);
            } else {
              next.color.set(colorRef.current);
              primaryMaterials.push(next);
            }
            src.dispose();
            return next;
          });
          obj.material = wasArray ? recolored : recolored[0];
        });

        modelRoot = root;
        scene.add(root);
        setReady(true);
      },
      undefined,
      () => {
        disposed = true;
        onFailedFn?.();
      },
    );

    applyColorRef.current = (hex: string) => {
      primaryMaterials.forEach((m) => m.color.set(hex));
    };

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (autoRotate && modelRoot) modelRoot.rotation.y += 0.006;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", stopAutoRotate);
      controls.dispose();
      applyColorRef.current = () => {};
      scene.traverse((obj) => {
        if (!(obj instanceof Mesh)) return;
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      });
      renderer.dispose();
      el.innerHTML = "";
    };
    // Mount-once, same reasoning as BodyModel3D: `color` is read through
    // applyColorRef so a prop change re-tints the loaded materials instead
    // of reloading/rebuilding the whole GLB scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyColorRef.current(color);
  }, [color]);

  return (
    <div className={className}>
      <div ref={mountRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
          Carregando modelo…
        </div>
      )}
    </div>
  );
}
