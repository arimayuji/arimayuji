/**
 * HEIC/HEIF (the default photo format on recent Android and iOS cameras —
 * reported live on a Galaxy S24) decodes in exactly zero browsers, this
 * app's Android/iOS WebView included: a plain `<img src="blob:...">` just
 * silently fails or times out on it (see `/compartilhar`'s own
 * `photoLoadFailed` handling). There is no native decode path to fall back
 * to — the only fix is decoding it ourselves, client-side, before handing
 * a file to anything that expects a browser-displayable image.
 */
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

function looksLikeHeic(file: File): boolean {
  if (HEIC_MIME_TYPES.has(file.type.toLowerCase())) return true;
  // Some Android pickers hand back a HEIC file with an empty or generic
  // `type` (`""`, `application/octet-stream`) — the extension is the only
  // signal left at that point.
  return /\.hei[cf]$/i.test(file.name);
}

/**
 * Converts a HEIC/HEIF file to a JPEG, or hands back the original file
 * unchanged for anything that isn't HEIC — meant to wrap every photo pick
 * unconditionally rather than making every caller check first. On
 * conversion failure (a corrupt file, a decoder edge case) it also hands
 * back the original file; whatever already treats a non-decoding image as
 * a load failure downstream still catches that case, this just stops the
 * one specific, common cause of it.
 *
 * `heic2any` (bundles a libheif WASM decoder, ~1.3MB) is dynamically
 * imported so it never loads for the overwhelmingly common case of a
 * plain JPEG/PNG pick.
 */
export async function ensureDecodableImage(file: File): Promise<File> {
  if (!looksLikeHeic(file)) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}
