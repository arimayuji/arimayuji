"use client";

import Link from "next/link";
import { useNotificationSummary } from "@/lib/notifications";
import { wasDismissed, wasRead } from "./notifications-read-state";

function BellIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Every "something changed, you might want to look" signal in one place —
 * a newer build available, incoming friend requests, incoming coach
 * invites. Used to open its own anchored dropdown; now just a badge that
 * links to the dedicated `/notificacoes` screen (Xanthus Notificacoes.dc.html),
 * the same move the design handoff makes elsewhere for anchored popovers
 * (date picker, sort sheet) — one real screen instead of a second UI to
 * keep in sync with it.
 *
 * `InstallPrompt` deliberately stays outside this — "install the app" is an
 * onboarding nudge, not a "something happened" notification, and belongs
 * back where it already is.
 */
export function NotificationBell() {
  const { update, pendingFriendRequests, pendingCoachInvites } = useNotificationSummary();

  const updateUnread = update !== null && !wasDismissed(update.versionCode) && !wasRead(update.versionCode);
  const unreadCount = (updateUnread ? 1 : 0) + pendingFriendRequests + pendingCoachInvites;

  return (
    <Link
      href="/notificacoes"
      aria-label={unreadCount > 0 ? `Notificações (${unreadCount} novas)` : "Notificações"}
      className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/16 text-white lg:bg-surface lg:text-muted lg:hover:text-foreground"
    >
      <BellIcon className="h-4.5 w-4.5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border border-white/30 bg-bad px-1 font-mono text-[10px] font-semibold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
