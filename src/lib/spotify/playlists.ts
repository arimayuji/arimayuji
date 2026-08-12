import { getValidAccessToken } from "./auth";

/**
 * Turns the tracks captured during a run into a real, private Spotify
 * playlist. Accessory feature layered on top of the run summary screen: any
 * failure here (network, auth, API errors) resolves to `{ ok: false }`
 * instead of throwing, so it can never break that screen.
 */

let cachedUserId: string | null = null;

/** The connected account's Spotify user id, cached in memory for the session. */
export async function getCurrentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;

  const token = await getValidAccessToken();
  if (!token) return null;

  let res: Response;
  try {
    res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  try {
    const json = await res.json();
    if (typeof json?.id !== "string") return null;
    cachedUserId = json.id;
    return cachedUserId;
  } catch {
    return null;
  }
}

export type CreatePlaylistResult =
  | { ok: true; playlistUrl: string }
  | { ok: false; reason: string };

/**
 * Creates a private playlist named `name` and adds every track in
 * `trackUris` (already-`spotify:track:...` URIs — anything without one was
 * filtered out by the caller). `undefined` entries are filtered here too, as
 * a safety net.
 */
export async function createPlaylistFromRun(
  name: string,
  description: string,
  trackUris: (string | undefined)[],
): Promise<CreatePlaylistResult> {
  const uris = trackUris.filter((uri): uri is string => Boolean(uri));
  if (uris.length === 0) return { ok: false, reason: "no_track_uris" };

  const token = await getValidAccessToken();
  if (!token) return { ok: false, reason: "not_connected" };

  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, reason: "no_user_id" };

  let createRes: Response;
  try {
    createRes = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, description, public: false }),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }
  if (!createRes.ok) return { ok: false, reason: `create_playlist_${createRes.status}` };

  let playlist: { id?: string; external_urls?: { spotify?: string } };
  try {
    playlist = await createRes.json();
  } catch {
    return { ok: false, reason: "invalid_playlist_response" };
  }
  const playlistId = playlist.id;
  const playlistUrl = playlist.external_urls?.spotify;
  if (!playlistId || !playlistUrl) return { ok: false, reason: "invalid_playlist_response" };

  let addRes: Response;
  try {
    addRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris }),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }
  if (!addRes.ok) return { ok: false, reason: `add_tracks_${addRes.status}` };

  return { ok: true, playlistUrl };
}
