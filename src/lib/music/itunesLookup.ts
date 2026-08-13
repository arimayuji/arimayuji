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
 * Looks up candidate tracks for `query`. Empty query returns an empty list
 * quietly; a real search that fails (network, non-2xx, malformed JSON)
 * throws instead of swallowing the error — a runner who searched a real
 * song and got told "nada encontrado" because of a connectivity blip mid-run
 * has no way to tell that apart from the song genuinely not existing, so the
 * caller needs to be able to distinguish "zero results" from "search
 * failed" and say so.
 */
export async function searchTracks(query: string, limit = 5): Promise<TrackCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&media=music&entity=song&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);

  const json = await res.json();
  const results: ITunesResult[] = Array.isArray(json?.results) ? json.results : [];

  return results
    .filter((r) => r.trackName && r.artistName)
    .map((r) => ({
      name: r.trackName!,
      artist: r.artistName!,
      artworkUrl: r.artworkUrl100 ? upsizeArtwork(r.artworkUrl100) : "",
    }));
}
