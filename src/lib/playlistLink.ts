/**
 * Resolves a cover image for a running-playlist link, so /perfil can show
 * the actual album art instead of a bare URL. Spotify only for now — its
 * public oEmbed endpoint (https://open.spotify.com/oembed?url=...) returns
 * a `thumbnail_url` and, verified directly, already sends
 * `Access-Control-Allow-Origin: *`, so this runs straight from the browser
 * with no server hop through client-actions. Apple Music's own embed
 * endpoint doesn't return JSON (it's an HTML player shell), and Deezer/
 * YouTube Music links are uncommon enough here that a plain link with no
 * cover is an acceptable fallback for everything non-Spotify — the link
 * itself still works either way.
 */

const SPOTIFY_URL_PATTERN = /^https:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?(track|album|playlist|artist)\//;

export function isSpotifyLink(url: string): boolean {
  return SPOTIFY_URL_PATTERN.test(url.trim());
}

/**
 * Returns the cover art URL for a Spotify link, or `null` for anything else
 * (not a Spotify link, oEmbed lookup failed, or no thumbnail in the
 * response). Never throws — a playlist link is a nice-to-have, not
 * something worth surfacing an error for.
 */
export async function resolvePlaylistCover(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!isSpotifyLink(trimmed)) return null;

  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { thumbnail_url?: string };
    return body.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

export interface PlaylistEntry {
  url: string;
  coverUrl: string | null;
}

/**
 * `profiles.playlists` stores each entry as its own JSON string (an Appwrite
 * string array column) rather than two parallel `url`/`coverUrl` arrays —
 * keeping the pair together means there's no index to keep in sync if a
 * write ever fails partway, or a future migration reorders one array but
 * not the other. Any entry that fails to parse (or has no string `url`) is
 * dropped rather than surfaced — same "never throw over a nice-to-have"
 * reasoning as `resolvePlaylistCover`.
 */
export function parsePlaylists(raw: string[] | undefined | null): PlaylistEntry[] {
  if (!raw) return [];
  const entries: PlaylistEntry[] = [];
  for (const item of raw) {
    try {
      const parsed = JSON.parse(item) as { url?: unknown; coverUrl?: unknown };
      if (typeof parsed.url === "string" && parsed.url) {
        entries.push({ url: parsed.url, coverUrl: typeof parsed.coverUrl === "string" && parsed.coverUrl ? parsed.coverUrl : null });
      }
    } catch {
      // Skip a malformed entry rather than losing every other playlist to it.
    }
  }
  return entries;
}

export function serializePlaylists(entries: PlaylistEntry[]): string[] {
  return entries.map((entry) => JSON.stringify({ url: entry.url, coverUrl: entry.coverUrl ?? "" }));
}
