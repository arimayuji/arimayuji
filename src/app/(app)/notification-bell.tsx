"use client";

import { useState } from "react";
import Link from "next/link";
import { useNotificationSummary } from "@/lib/notifications";
import { ModalPortal } from "./modal-portal";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const DISMISSED_KEY = "xanthus:update-dismissed-version";
/**
 * Separate from `DISMISSED_KEY` on purpose: tapping a notification to go
 * look at it (download the update, in this case) used to also permanently
 * dismiss it, so a row you'd only glanced at vanished from the panel —
 * conflating "I've seen this" with "I'm done with this, throw it away".
 * Reading no longer removes anything; only the explicit clear button (the
 * broom icon below) writes to `DISMISSED_KEY`.
 */
const READ_KEY = "xanthus:update-read-version";

function wasDismissed(versionCode: number): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === String(versionCode);
  } catch {
    return false;
  }
}

function dismissUpdate(versionCode: number) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(versionCode));
  } catch {
    // Storage disabled: the item just reappears next open, harmless.
  }
}

function wasRead(versionCode: number): boolean {
  try {
    return localStorage.getItem(READ_KEY) === String(versionCode);
  } catch {
    return false;
  }
}

function markUpdateRead(versionCode: number) {
  try {
    localStorage.setItem(READ_KEY, String(versionCode));
  } catch {
    // Storage disabled: it just counts as unread again next open, harmless.
  }
}

function BellIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** One row in the open panel — a title, a short detail line, and whatever gets tapped (a route, or the APK download link). Tapping the row itself never removes it: only the broom (`onClear`) does. */
function NotificationRow({
  title,
  detail,
  href,
  unread = false,
  onClear,
  onNavigate,
}: {
  title: string;
  detail: string;
  href: string;
  /** A small dot next to the title — the only visual difference from "read"; the row stays put either way until cleared. */
  unread?: boolean;
  onClear?: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <Link href={href} onClick={onNavigate} className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {unread && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
          {title}
        </p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </Link>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar"
          className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" {...STROKE}>
            <path d="M4 20h16M6 20l1-11h10l1 11M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M5 9h14" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Every "something changed, you might want to look" signal in one place —
 * a newer build available, incoming friend requests, incoming coach
 * invites. These used to be three separate surfaces: an always-visible
 * inline banner for updates that pushed every screen's content down, and
 * two pending-counts that only existed inside their own screens (amigos,
 * treinador) — invisible unless you happened to already be there. A fixed
 * bell with a badge is the one place to check instead.
 *
 * `InstallPrompt` deliberately stays outside this — "install the app" is an
 * onboarding nudge, not a "something happened" notification, and belongs
 * back where it already is.
 */
export function NotificationBell() {
  const { update, pendingFriendRequests, pendingCoachInvites } = useNotificationSummary();
  const [open, setOpen] = useState(false);
  // Forces a re-render after marking read/clearing an update without waiting
  // for the next route change to re-run useNotificationSummary's effect —
  // the value itself is never read, only bumping it matters.
  const [, setTick] = useState(0);

  const updateVisible = update !== null && !wasDismissed(update.versionCode);
  const updateUnread = updateVisible && !wasRead(update.versionCode);
  // Drives the panel's empty state — everything not yet cleared, read or not.
  const visibleCount = (updateVisible ? 1 : 0) + pendingFriendRequests + pendingCoachInvites;
  // Drives the badge number on the bell itself — only what's actually new.
  const unreadCount = (updateUnread ? 1 : 0) + pendingFriendRequests + pendingCoachInvites;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Notificações (${unreadCount} novas)` : "Notificações"}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/92 text-foreground shadow-sm backdrop-blur-md"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-bad px-1 font-mono text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setOpen(false)}>
            <div
              className="absolute right-4 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
              style={{ top: "calc(env(safe-area-inset-top) + 3.25rem)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Notificações</p>
                <div className="flex items-center gap-1">
                  {/* The one clear action for the whole panel — only the update
                      notification is ever dismissable (friend/coach rows track
                      real pending state and clear themselves once acted on
                      elsewhere), so this only needs to show up for that case. */}
                  {updateVisible && (
                    <button
                      type="button"
                      onClick={() => {
                        if (update) dismissUpdate(update.versionCode);
                        setTick((t) => t + 1);
                      }}
                      aria-label="Limpar notificação de atualização"
                      className="rounded-full p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" {...STROKE}>
                        <path d="M4 20h16M6 20l1-11h10l1 11M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M5 9h14" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar"
                    className="rounded-full p-1 text-muted hover:text-foreground"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" {...STROKE}>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>

              {visibleCount === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted">Nada novo por enquanto.</p>
              ) : (
                <div className="divide-y divide-border">
                  {updateVisible && update && (
                    <NotificationRow
                      title="Nova versão disponível"
                      detail={`Versão ${update.versionName} — toque pra baixar`}
                      href={update.url}
                      unread={updateUnread}
                      onNavigate={() => {
                        markUpdateRead(update.versionCode);
                        setTick((t) => t + 1);
                        setOpen(false);
                      }}
                    />
                  )}
                  {pendingFriendRequests > 0 && (
                    <NotificationRow
                      title={
                        pendingFriendRequests === 1 ? "1 pedido de amizade" : `${pendingFriendRequests} pedidos de amizade`
                      }
                      detail="toque pra ver"
                      href="/amigos"
                      unread
                      onNavigate={() => setOpen(false)}
                    />
                  )}
                  {pendingCoachInvites > 0 && (
                    <NotificationRow
                      title={
                        pendingCoachInvites === 1 ? "1 convite de treinador" : `${pendingCoachInvites} convites de treinador`
                      }
                      detail="toque pra ver"
                      href="/treinador"
                      unread
                      onNavigate={() => setOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
