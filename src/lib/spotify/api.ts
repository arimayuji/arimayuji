import { getValidAccessToken } from "./auth";

export interface NowPlaying {
  name: string;
  artist: string;
  isPlaying: boolean;
  uri?: string;
}

/**
 * Reads what's currently playing. Returns null when there's nothing to show:
 * not connected, nothing playing (204), or the read itself failed — this
 * feature is a nice-to-have layered on top of the run, so any failure here
 * degrades to "no track", never to a broken run screen.
 */
export async function getCurrentlyPlaying(): Promise<NowPlaying | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  let res: Response;
  try {
    res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null; // offline, or Spotify unreachable
  }

  if (res.status === 204 || res.status === 404) return null; // nothing playing right now
  if (!res.ok) return null;

  try {
    const json = await res.json();
    const item = json?.item;
    if (!item?.name) return null;
    const artist = Array.isArray(item.artists)
      ? item.artists.map((a: { name: string }) => a.name).join(", ")
      : "";
    return {
      name: item.name,
      artist,
      isPlaying: Boolean(json.is_playing),
      uri: typeof item.uri === "string" ? item.uri : undefined,
    };
  } catch {
    return null;
  }
}
