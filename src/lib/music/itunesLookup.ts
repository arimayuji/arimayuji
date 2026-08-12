/**
 * Manual track lookup via Apple's public iTunes Search API — no key, no
 * auth, CORS-enabled. Lets a runner tag what was playing during a run
 * without connecting any account.
 */

export interface TrackCandidate {
  name: string;
  artist: string;
  artworkUrl: string;
}

function upsizeArtwork(url: string): string {
  return url.replace("100x100", "300x300");
}

interface ITunesResult {
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

/**
 * Looks up candidate tracks for `query`. Degrades to an empty list on any
 * failure (network, non-2xx, malformed JSON) or empty query — this is a
 * nice-to-have lookup, not something that should ever surface an error to
 * the runner.
 */
export async function searchTracks(query: string, limit = 5): Promise<TrackCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&media=music&entity=song&limit=${limit}`,
    );
    if (!res.ok) return [];

    const json = await res.json();
    const results: ITunesResult[] = Array.isArray(json?.results) ? json.results : [];

    return results
      .filter((r) => r.trackName && r.artistName)
      .map((r) => ({
        name: r.trackName!,
        artist: r.artistName!,
        artworkUrl: r.artworkUrl100 ? upsizeArtwork(r.artworkUrl100) : "",
      }));
  } catch {
    return [];
  }
}
