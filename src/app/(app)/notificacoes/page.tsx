"use client";

import { useState } from "react";
import Link from "next/link";
import { delay, Screen, ScreenHeader } from "../ui";
import { useNotificationSummary } from "@/lib/notifications";
import { markUpdateRead, wasDismissed, wasRead } from "../notifications-read-state";
import type { FriendConnection } from "@/lib/friendships";
import type { CoachConnection, MyCoachRole } from "@/lib/coachRelationships";

/**
 * Every "something changed" signal in one place (Xanthus Notificacoes.dc.html)
 * — a newer build, incoming friend requests, incoming coach invites. Was
 * previously the bell's own anchored dropdown; that only ever showed
 * aggregate counts ("3 pedidos de amizade"), where this real screen lists
 * each one by who and when, same as the mock. No invented notification
 * types (a new PR, a finished plan week, a synced watch) — those aren't
 * backed by any real "you haven't seen this yet" state in the app today,
 * so adding them here would mean fabricating rows instead of showing real
 * ones.
 */

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function UpdateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

function FriendRequestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.9 5.9 0 0 1 11 0" />
      <path d="M17 8h4M19 6v4" />
    </svg>
  );
}

function CoachInviteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3.5 10.3v3.9h2.5l7.3 3.9V6.4l-7.3 3.9H3.5Z" />
      <path d="M16.6 7.3a7.6 7.6 0 0 1 0 10.9" />
    </svg>
  );
}

/** "2h" / "1d" — the compact age format the mock uses, distinct from `sinceLabel`'s spelled-out "há 2 dias" used on `/perfil/dados`, which reads better for a single sentence than a dense list of rows. */
function compactAge(iso: string, now = Date.now()): string {
  const hours = Math.floor((now - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "agora";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Mirror of the same helper in `/treinador` — what the *other* person's role is, from my point of view. */
function otherCoachRoleLabel(myRole: MyCoachRole): string {
  return myRole === "coach" ? "seu aluno" : "seu treinador";
}

function NotificationCard({
  icon,
  title,
  detail,
  age,
  unread,
  href,
  external,
  onNavigate,
  delayMs,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  age?: string;
  unread: boolean;
  href: string;
  external?: boolean;
  onNavigate?: () => void;
  delayMs: number;
}) {
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {age && <span className="shrink-0 font-mono text-[11px] text-muted">{age}</span>}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted text-pretty">{detail}</span>
      </span>
      {unread && <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-bad" />}
    </>
  );

  const className =
    "pr-enter flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left";

  if (external) {
    return (
      <a href={href} onClick={onNavigate} className={className} style={delay(delayMs)}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onNavigate} className={className} style={delay(delayMs)}>
      {content}
    </Link>
  );
}

function friendRequestDetail(connection: FriendConnection): string {
  return connection.profile ? `@${connection.profile.handle} quer te adicionar.` : "Quer te adicionar.";
}

function coachInviteDetail(connection: CoachConnection): string {
  const who = connection.profile ? `@${connection.profile.handle}` : "Alguém";
  return `${who} quer ser ${otherCoachRoleLabel(connection.myRole)}.`;
}

export default function NotificacoesPage() {
  const { update, friendRequests, coachInvites } = useNotificationSummary();
  const [, setTick] = useState(0);

  const updateVisible = update !== null && !wasDismissed(update.versionCode);
  const updateUnread = updateVisible && !wasRead(update.versionCode);
  const total = (updateVisible ? 1 : 0) + friendRequests.length + coachInvites.length;

  return (
    <>
      <ScreenHeader
        title="Notificações"
        badge={
          updateUnread ? (
            <button
              type="button"
              onClick={() => {
                if (update) markUpdateRead(update.versionCode);
                setTick((t) => t + 1);
              }}
              className="text-sm font-semibold text-accent"
            >
              Marcar tudo como lido
            </button>
          ) : undefined
        }
      />

      <Screen>
        {total === 0 ? (
          <p className="pr-enter py-10 text-center text-sm text-muted" style={delay(40)}>
            Nada novo por enquanto.
          </p>
        ) : (
          <>
            {updateVisible && update && (
              <NotificationCard
                icon={<UpdateIcon className="h-5 w-5" />}
                title="Nova versão disponível"
                detail={`Versão ${update.versionName} — toque pra baixar`}
                unread={updateUnread}
                href={update.url}
                external
                onNavigate={() => {
                  markUpdateRead(update.versionCode);
                  setTick((t) => t + 1);
                }}
                delayMs={40}
              />
            )}

            {friendRequests.map((connection, index) => (
              <NotificationCard
                key={connection.friendship.$id}
                icon={<FriendRequestIcon className="h-5 w-5" />}
                title="Novo convite de amizade"
                detail={friendRequestDetail(connection)}
                age={compactAge(connection.friendship.$createdAt)}
                unread
                href="/amigos"
                delayMs={60 + index * 15}
              />
            ))}

            {coachInvites.map((connection, index) => (
              <NotificationCard
                key={connection.relationship.$id}
                icon={<CoachInviteIcon className="h-5 w-5" />}
                title="Novo convite de treinador"
                detail={coachInviteDetail(connection)}
                age={compactAge(connection.relationship.$createdAt)}
                unread
                href="/treinador"
                delayMs={60 + (friendRequests.length + index) * 15}
              />
            ))}
          </>
        )}

        <Link
          href="/perfil"
          className="pr-enter flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground"
          style={delay(60 + total * 15 + 20)}
        >
          Voltar pro perfil
        </Link>
      </Screen>
    </>
  );
}
