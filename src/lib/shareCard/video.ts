/**
 * Turning the canvas card into a real video file the OS share sheet can hand
 * to WhatsApp or Instagram.
 *
 * `canvas.captureStream()` gives a live MediaStream of one canvas element's
 * pixels; `MediaRecorder` encodes that stream into a Blob. The catch that
 * shapes everything below is that the capture is *live*: it records whatever
 * is on the canvas at the moment each frame is pulled, on the wall clock. So
 * the first frame has to be painted before `captureStream()` is ever called
 * (a canvas still at its default transparent state records as a blank video
 * that throws no error at all), the animation has to run in real time, and the
 * last frame needs a beat on screen before the recorder stops or the ending
 * gets cut off mid-fade.
 */

import {
  SHARE_CARD_DURATION_MS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  drawShareCardFrame,
  shareCardFontSpecs,
  type ShareCardScene,
} from "./renderer";

const FPS = 30;
const BITS_PER_SECOND = 5_000_000;

/**
 * MP4 first, and not as a nicety: every messaging app on Android accepts
 * H.264 in MP4, while WebM support varies by app even though the platform
 * decodes it. Chrome only started offering MP4 out of `MediaRecorder`
 * relatively recently, so WebM stays as the fallback rather than the target.
 */
const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E"',
  "video/mp4",
  'video/webm;codecs="vp9"',
  'video/webm;codecs="vp8"',
  "video/webm",
];

export function shareVideoMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

/** Whether this browser can produce a video at all — checked before showing any "gerando vídeo" state, so the text share stays instant where it can't. */
export function canRecordShareVideo(): boolean {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") return false;
  if (typeof HTMLCanvasElement === "undefined") return false;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return false;
  return shareVideoMimeType() !== null;
}

export function shareVideoFileName(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "corrida-xanthus.mp4" : "corrida-xanthus.webm";
}

/**
 * `MediaRecorder` hands back a type with the codec parameters attached
 * (`video/mp4;codecs="avc1.42e01e"`). Android routes a shared file to apps by
 * matching its MIME against intent filters written as `video/*`, and a
 * parameterised type is not what those match on — so the file that leaves the
 * app carries the bare type, even though the blob was recorded with the full
 * one.
 */
export function shareVideoBaseMime(mimeType: string): string {
  return mimeType.split(";")[0].trim();
}

/** Canvas substitutes a missing face silently, so the card would render in a proportional fallback if this were skipped. */
async function ensureFontsLoaded(scene: ShareCardScene): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all(shareCardFontSpecs(scene).map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch {
    // A face that refuses to load still renders in the fallback mono — worse
    // looking, not broken, and not a reason to abandon the video.
  }
}

export interface RecordedShareVideo {
  blob: Blob;
  mimeType: string;
}

export async function recordShareCardVideo(
  scene: ShareCardScene,
  {
    onProgress,
    durationMs = SHARE_CARD_DURATION_MS,
  }: { onProgress?: (fraction: number) => void; durationMs?: number } = {},
): Promise<RecordedShareVideo | null> {
  const mimeType = shareVideoMimeType();
  if (!mimeType) return null;

  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  await ensureFontsLoaded(scene);
  drawShareCardFrame(ctx, scene, 0, durationMs);

  let stream: MediaStream;
  let recorder: MediaRecorder;
  try {
    stream = canvas.captureStream(FPS);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITS_PER_SECOND });
  } catch {
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => resolve();
  });

  try {
    recorder.start();

    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const step = (now: number) => {
        const elapsed = Math.min(now - startedAt, durationMs);
        drawShareCardFrame(ctx, scene, elapsed, durationMs);
        onProgress?.(elapsed / durationMs);
        if (elapsed < durationMs) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    // The held final frame, given long enough to actually be captured.
    await new Promise((resolve) => setTimeout(resolve, 260));
    recorder.stop();
    await Promise.race([
      finished,
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ]);
  } catch {
    return null;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }

  if (chunks.length === 0) return null;
  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) return null;
  return { blob, mimeType };
}

/** The recorded card as a `File`. Null for every failure, which the caller reads as "fall back to text". */
export async function buildShareCardVideoFile(
  scene: ShareCardScene,
  options: { onProgress?: (fraction: number) => void; durationMs?: number } = {},
): Promise<File | null> {
  if (!canRecordShareVideo()) return null;

  const recorded = await recordShareCardVideo(scene, options);
  if (!recorded) return null;

  const file = new File([recorded.blob], shareVideoFileName(recorded.mimeType), {
    type: shareVideoBaseMime(recorded.mimeType),
  });
  // Checked against the real recorded bytes, not a zero-byte stand-in taken
  // before recording even started — some browsers' `canShare` reads an empty
  // probe file as unshareable regardless of its declared type, which made
  // this reject every device capable of sharing a real one.
  if (typeof navigator.canShare !== "function") return file;
  return navigator.canShare({ files: [file] }) ? file : null;
}
