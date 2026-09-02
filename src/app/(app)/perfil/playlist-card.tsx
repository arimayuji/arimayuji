"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { parsePlaylists, resolvePlaylistCover, serializePlaylists, type PlaylistEntry } from "@/lib/playlistLink";
import { Card, CardTitle, delay, NoticeBadge } from "../ui";

/** Fallback tile for a playlist link this app can't resolve cover art for (anything non-Spotify) — same glyph `/perfil/ver` shows a friend. */
function PlaylistNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

/**
 * Links to the account's running playlists, shown here for editing and on
 * /perfil/ver for a friend viewing them. Cover art only resolves for Spotify
 * links (see src/lib/playlistLink.ts's own comment for why) — anything else
 * still saves and still shows as a tile, just with a generic note icon
 * instead of real art. Each tile is the whole clickable target (no URL text
 * under it) — with several playlists side by side, the art itself is what
 * tells them apart.
 */
export function PlaylistCard() {
  const { status, account, profile, refresh } = useAuth();
  const entries = parsePlaylists(profile?.playlists);
  const [newUrl, setNewUrl] = useState("");
  const [resolvingCover, setResolvingCover] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function save(next: PlaylistEntry[]) {
    if (!account) return;
    setSaveError(false);
    try {
      await updateProfile(account.id, { playlists: serializePlaylists(next) });
      await refresh();
    } catch {
      setSaveError(true);
    }
  }

  async function handleAdd() {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    setResolvingCover(true);
    try {
      const coverUrl = await resolvePlaylistCover(trimmed);
      await save([...entries, { url: trimmed, coverUrl }]);
      setNewUrl("");
    } finally {
      setResolvingCover(false);
    }
  }

  async function handleRemove(index: number) {
    await save(entries.filter((_, i) => i !== index));
  }

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
      style={delay(90)}
    >
      <CardTitle aside={<NoticeBadge>opcional</NoticeBadge>}>Playlists pra corrida</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Amigos que veem seu perfil conseguem abrir direto.
      </p>

      {status !== "signed-in" ? (
        <p className="text-xs text-muted">Precisa de conta pra salvar (Google ou Apple, em Conta acima).</p>
      ) : (
        <>
          {entries.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3">
              {entries.map((entry, index) => (
                <div key={`${entry.url}-${index}`} className="relative">
                  <a href={entry.url} target="_blank" rel="noreferrer noopener" className="block">
                    {entry.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- an external cover URL, next/image's optimizer isn't available in a static export anyway.
                      <img
                        src={entry.coverUrl}
                        alt="Capa da playlist"
                        className="h-20 w-20 rounded-xl border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-background text-muted">
                        <PlaylistNoteIcon />
                      </div>
                    )}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    aria-label="Remover playlist"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-bad"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="block space-y-2">
            <span className="text-xs font-medium">Adicionar playlist</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder="https://open.spotify.com/playlist/..."
                className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newUrl.trim() || resolvingCover}
                className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </label>
          {resolvingCover && <p className="mt-1.5 text-[11px] text-muted">Buscando a capa…</p>}
          {saveError && <p className="mt-1.5 text-[11px] text-bad">Não deu pra salvar agora — tenta de novo.</p>}
        </>
      )}
    </Card>
  );
}
