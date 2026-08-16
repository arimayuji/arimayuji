/**
 * Real WebGL 3D for the registered shoe on the share card — a genuine
 * rotating, lit object instead of the 2D fake (a flat photo squashed +
 * sheared + gradient-shaded to suggest depth, still in `renderer.ts`'s
 * history if this needs rolling back).
 *
 * Deliberately NOT a shoe-shaped 3D mesh: modelling a recognizable sneaker
 * from scratch (no licensed asset to source/verify in this environment) is
 * a much harder version of the same problem hand-drawn 2D vector attempts
 * already failed at repeatedly. Instead, the real collectible-art photo —
 * the thing that actually reads as "the real shoe" — is applied undistorted
 * as a texture on a flat plane. A flat plane in a real 3D scene still gets
 * everything that makes rotation read as 3D and not a slideshow: correct
 * perspective foreshortening as it turns (a real camera looking at a real
 * turning plane, not a faked horizontal squash), and a real directional
 * light sweeping across it as the surface normal rotates relative to the
 * light (not a hand-tuned gradient standing in for one).
 *
 * One renderer/scene/mesh, reused across every draw call and every shoe —
 * only the texture and rotation change per frame. Creating a fresh
 * WebGLRenderer per call would both be slow (context setup isn't free) and
 * risk hitting the browser's per-page WebGL context limit once more than a
 * few template thumbnails want to draw a shoe at once.
 */

import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from "three";

const RENDER_SIZE = 320;

interface Shoe3DContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  mesh: Mesh;
  material: MeshStandardMaterial;
}

let ctx: Shoe3DContext | null = null;
const textureCache = new Map<string, Texture>();

function ensureContext(): Shoe3DContext | null {
  if (ctx) return ctx;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = RENDER_SIZE;
  canvas.height = RENDER_SIZE;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null; // WebGL unavailable — caller falls back to not drawing a shoe this frame
  }
  renderer.setSize(RENDER_SIZE, RENDER_SIZE, false);
  renderer.setPixelRatio(1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.1, 10);
  camera.position.set(0, 0, 4.4);

  scene.add(new AmbientLight(0xffffff, 0.6));
  const key = new DirectionalLight(0xffffff, 1.15);
  key.position.set(1.6, 1.8, 2.4);
  scene.add(key);
  const rim = new DirectionalLight(0x88aaff, 0.45);
  rim.position.set(-1.8, -0.7, -1.6);
  scene.add(rim);

  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.05,
    transparent: true,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  scene.add(mesh);

  ctx = { renderer, scene, camera, mesh, material };
  return ctx;
}

type TextureSource = HTMLImageElement | HTMLCanvasElement;

function sourceSize(source: TextureSource): { width: number; height: number } {
  return "naturalWidth" in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

/**
 * `cacheKey` is explicit rather than read off the source, because the real
 * texture here is a tinted `HTMLCanvasElement` (see `getTintedShoeImage` in
 * `renderer.ts` — desaturate-then-recolour to the shoe's registered colour,
 * done once on the CPU) which has no `.src` of its own to key on the way an
 * `<img>` would.
 */
function getTexture(source: TextureSource, cacheKey: string): Texture {
  let tex = textureCache.get(cacheKey);
  if (!tex) {
    tex = new Texture(source);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    textureCache.set(cacheKey, tex);
  }
  return tex;
}

/**
 * Renders one frame of the shoe as a real lit, rotating 3D plane and
 * returns the canvas it was drawn to — the caller `drawImage`s that onto
 * the card's own 2D canvas, same as it already does for the photo/video
 * background. `turnRad`/`tiltRad` are real `mesh.rotation` values, not a
 * faked transform. Returns null before WebGL is ready or available; the
 * caller already tolerates a not-yet-ready shoe (same pattern as the photo
 * loader it replaces).
 */
export function renderShoe3DFrame(
  source: TextureSource,
  cacheKey: string,
  turnRad: number,
  tiltRad: number,
): HTMLCanvasElement | null {
  const c = ensureContext();
  if (!c) return null;
  const { width, height } = sourceSize(source);
  if (!width || !height) return null;

  const texture = getTexture(source, cacheKey);
  if (c.material.map !== texture) {
    c.material.map = texture;
    c.material.needsUpdate = true;
  }

  const aspect = width / height;
  // Fits inside the camera's visible frustum at the plane's z=0 distance
  // (2 * cameraZ * tan(fov/2) ≈ 2.03 units, both axes, since the camera's
  // own aspect is 1) — sized by whichever axis the photo is wider on, or a
  // landscape shoe photo (this one is ~1.9:1) would run past the frame's
  // sides long before it filled the height. Y-axis rotation only ever
  // *shrinks* the projected width (foreshortening), so sizing for the
  // unrotated, widest pose is always safe.
  const maxSpan = 1.9;
  const planeWidth = aspect >= 1 ? maxSpan : maxSpan * aspect;
  const planeHeight = aspect >= 1 ? maxSpan / aspect : maxSpan;
  const geometry = c.mesh.geometry as PlaneGeometry;
  if (geometry.parameters.width !== planeWidth || geometry.parameters.height !== planeHeight) {
    c.mesh.geometry.dispose();
    c.mesh.geometry = new PlaneGeometry(planeWidth, planeHeight);
  }

  c.mesh.rotation.y = turnRad;
  c.mesh.rotation.x = tiltRad;
  c.renderer.render(c.scene, c.camera);
  return c.renderer.domElement;
}
