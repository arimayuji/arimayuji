"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { uploadSharedPhoto } from "@/lib/avatar";
import { listFriendConnections } from "@/lib/friendships";
import { listFriendsFeed, parseFeedRoutePoints, toggleRunKudos, type FriendFeedItem } from "@/lib/friendsFeed";
import type { DistanceUnit } from "@/lib/preferences";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { addRunComment, listRunComments, type RunComment } from "@/lib/runComments";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { buildReplayTimeline, replayCursorAt } from "@/lib/tracking/replay";
import type { StoredPoint } from "@/lib/tracking/storage";
import { formatAveragePace, formatDistance, unitLabel } from "@/lib/units";
import { usePreferences } from "@/lib/usePreferences";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { Avatar } from "../avatar";
import { RouteMap } from "../route-map";
import { Card, CardTitle, delay, EmptyState, Screen, ScreenHeader } from "../ui";

/**
 * Mounts `children` only once this element scrolls near the viewport, and
 * never un-mounts it again — a real basemap (`RouteMap`, MapLibre/WebGL) per
 * card is too expensive to give every item in a feed of up to 30 posts for
 * free, but a feed only ever has a couple of cards near the viewport at
 * once, so lazily mounting as the athlete scrolls keeps concurrent WebGL
 * contexts bounded to what's actually on screen instead of every basemap
 * loading (and fighting over network) the instant the feed opens.
 */
function useInView<T extends Element>(rootMargin = "300px"): { ref: (node: T | null) => void; inView: boolean } {
  const [inView, setInView] = useState(false);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = (node: T | null) => {
    nodeRef.current = node;
    observerRef.current?.disconnect();
    if (!node || inView) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin },
    );
    observerRef.current.observe(node);
  };

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, inView };
}

const RETURN_TO = "/feed";

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function FriendsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="8.7" cy="8" r="3" />
      <path d="M2.8 19.5a5.9 5.9 0 0 1 11.8 0" />
      <path d="M15.5 5.3a3 3 0 0 1 0 5.9M18.7 19.5a5.9 5.9 0 0 0-3.4-6.3" />
    </svg>
  );
}

/** Bounces once (`pr-heart-pop`, globals.css) the moment `filled` flips from
 * false to true — confirms the tap registered, same idea as any social app's
 * like button. Never plays on the reverse (removing kudos) or on the initial
 * mount with `filled` already true (a feed refresh showing kudos you gave
 * earlier shouldn't replay the bounce). Gated on `prefers-reduced-motion` —
 * this was the one movement effect on the whole screen not already checking
 * it (an audit finding, 2026-09-01), unlike `RouteBanner` right below it in
 * the same card, which already does. */
function HeartIcon({ className, filled }: { className?: string; filled: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [pulse, setPulse] = useState(false);
  const wasFilled = useRef(filled);
  useEffect(() => {
    if (filled && !wasFilled.current && !reducedMotion) setPulse(true);
    wasFilled.current = filled;
  }, [filled, reducedMotion]);

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} ${pulse ? "animate-[pr-heart-pop_300ms_cubic-bezier(0.23,1,0.32,1)]" : ""}`}
      onAnimationEnd={() => setPulse(false)}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.3s-7.5-4.6-9.8-9.1C.7 8 2.1 4.6 5.4 3.8a5 5 0 0 1 6.6 2.2A5 5 0 0 1 18.6 3.8c3.3.8 4.7 4.2 3.2 7.4C19.5 15.7 12 20.3 12 20.3Z" />
    </svg>
  );
}

/** Same silhouette as `PrBadge`'s trophy in run-detail.tsx — reused here so a "new record" reads the same way in both places. */
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M7 4h10v3.5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5a2 2 0 0 0 0 4H7M17 5h2.5a2 2 0 0 1 0 4H17" />
      <path d="M12 12.5v3M9 19.5h6M9.5 19.5c0-2 .8-2.7 2.5-3.5 1.7.8 2.5 1.5 2.5 3.5" />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17" cy="16" r="2.5" />
      <path d="M9 18V6.5L19.5 4v11.5" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

/** A whistle — the same "coach" association `treinador/page.tsx` already uses elsewhere in the app, so a "supervisionada" badge reads as coach-related at a glance, not a generic checkmark. */
function WhistleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 12.5a3 3 0 0 1 3-3h5.5l6-4v9l-6-2.5H6a3 3 0 0 1-3 3Z" />
      <circle cx="16.5" cy="16.5" r="3" />
    </svg>
  );
}

/** A peak line — the same "ganho de elevação" idea `run-detail.tsx` gives a commissioned badge, drawn as a plain stroked icon here because this is a 11px meta line, not a stat tile. */
function ElevationIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 19h18L14.5 7 11 13l-2-3-6 9Z" />
    </svg>
  );
}

/** How long the route takes to draw itself once, the first time a card scrolls into view. */
const FEED_DRAW_MS = 7000;

/**
 * The GPS trace on the app's real basemap (`RouteMap`, MapLibre + Protomaps —
 * same component /historico's detail screen and live tracking already use),
 * not a bare flattened line on blank background. A first pass here drew just
 * the line via `projectRoute` (same math as `matched-runs-card.tsx`'s 56px
 * corner thumbnail) — fine at icon size, but blown up to a full-width hero
 * with nothing around it, a route with no geography reads as a random
 * scribble, not a place ("esse risco aí na tela nada a ver, tudo perdido",
 * reported 2026-08-31 looking at exactly this card). Lazily mounted via
 * `useInView` — a live WebGL map per feed card is real cost a flat SVG
 * never was, so only cards actually near the viewport get one.
 * Edge to edge — and since the post itself now spans the full width of the
 * screen (see `FeedItemCard`), that means the real screen edges, the way
 * media sits in a LinkedIn or Instagram post. This used to bleed only to the
 * edges of an inset card, which is what read as a hard-edged rectangle cut
 * through a rounded card ("os cantos / integração com o card", 2026-09-01).
 *
 * Draws itself with the same `replay` cursor `RouteReplay`'s scrubber drives
 * — asked for directly ("o mapa tem que ser o gif lá da rota sendo completada
 * e não estático", 2026-09-01) — so a card scrolling into view shows the run
 * being run rather than a frozen line. It draws **once** and then holds the
 * finished trace, instead of looping forever: an endless loop meant every
 * visible card was animating at the same time, next to the numbers the
 * viewer is trying to read, which is exactly the kind of ambient motion
 * that competes with content instead of explaining it. No controls
 * (play/pause/scrub) render here — this is a passive reveal, not the
 * interactive player `run-detail.tsx` already gives its own screen.
 * Respects reduced-motion by holding the finished trace from the start.
 */
function RouteBanner({ points }: { points: StoredPoint[] }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reducedMotion = usePrefersReducedMotion();
  const timeline = useMemo(() => buildReplayTimeline(points), [points]);
  /** `null` means "no cursor" — the finished route, drawn whole. That's both the state before this card has ever been on screen and the state it rests in once the reveal has played out. */
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!inView || !timeline || reducedMotion) return;
    let raf: number;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = (now - start) / FEED_DRAW_MS;
      if (elapsed >= 1) {
        setProgress(null);
        return;
      }
      setProgress(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, timeline, reducedMotion]);

  if (points.length < 2) return null;
  const cursor = timeline && progress !== null && !reducedMotion ? replayCursorAt(timeline, progress) : null;

  return (
    <div ref={ref} className="-mx-5 h-40 w-[calc(100%+2.5rem)] overflow-hidden bg-background lg:mx-0 lg:w-full">
      {inView && <RouteMap points={points} replay={cursor} square={false} rounded={false} className="h-40 w-full" />}
    </div>
  );
}

/**
 * One "label above, big value below" stat. The numeral is the card's
 * headline, not a caption-sized aside — in a running app the distance *is*
 * the news, and at the old 18px it was lighter on the page than the
 * athlete's own free-text line right above it (an inverted hierarchy, flagged
 * 2026-09-01). The unit rides along as a small suffix rather than part of the
 * numeral, both because that's how a number wants to be set and because it
 * keeps "10.05 km" inside a third of a phone-width card without truncating.
 */
function StatBlock({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="truncate font-mono text-3xl leading-none font-semibold tabular-nums lg:tracking-[-0.02em]">
        {value}
        {suffix && <span className="ml-0.5 align-baseline text-sm font-semibold text-muted">{suffix}</span>}
      </p>
    </div>
  );
}

/** "Hoje às 08:30" / "Ontem às 08:30" / "24 ago às 08:30" — Strava shows both day and time-of-day on its feed cards; the previous version here only showed the date. */
function formatFeedTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dayDiff = Math.round((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dayDiff === 0) return `Hoje às ${time}`;
  if (dayDiff === 1) return `Ontem às ${time}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} às ${time}`;
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M20 12.2c0 3.8-3.6 6.9-8 6.9a9.3 9.3 0 0 1-2.7-.4L4 20.3l1.4-3.6A6.5 6.5 0 0 1 4 12.2c0-3.8 3.6-6.9 8-6.9s8 3.1 8 6.9Z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
    </svg>
  );
}

/** One row in the comment list — pulled out so the "recent" and "older"
 * lists in `CommentsSection` render identical markup without duplicating it. */
function CommentRow({ comment }: { comment: RunComment }) {
  return (
    <li className="flex items-start gap-2">
      <Avatar name={comment.displayName} avatarUrl={comment.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        {comment.text && (
          <p className="text-xs leading-relaxed text-pretty">
            <span className="font-semibold">{comment.displayName}</span> {comment.text}
          </p>
        )}
        {!comment.text && <p className="text-xs font-semibold">{comment.displayName}</p>}
        {comment.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- an Appwrite Storage URL, not a local asset.
          <img src={comment.photoUrl} alt="" className="mt-1.5 max-h-40 rounded-xl object-cover" />
        )}
      </div>
    </li>
  );
}

/**
 * Comments on a shared run — asked for directly ("tem que poder conseguir
 * comentar... anexar foto... igual strava", 2026-09-01). Visible to whoever
 * can already see the post itself (main.js's canAccessRun), never a smaller
 * circle — same audience as the kudos row above it, not a separate,
 * stricter one. A comment can be text, a photo, or both; the photo uploads
 * to the shared `avatars` Storage bucket before the comment row is created
 * (see uploadSharedPhoto in src/lib/avatar.ts) — the object-URL preview
 * below is only ever local until that upload actually succeeds.
 */
function CommentsSection({
  comments,
  open,
  onSubmit,
}: {
  comments: RunComment[];
  /** The composer only exists once the viewer asks for it (the "Comentar" action below the map). A feed of 30 posts used to mount 30 live text inputs, and every card ended on an empty box — which reads as an unfinished screen, not an invitation. */
  open: boolean;
  onSubmit: (text: string, photo: File | null) => Promise<boolean>;
}) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Opening the composer is always a deliberate tap on "Comentar", so the
  // keyboard should already be up by the time the field appears — one tap to
  // comment, not two.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const clearPhoto = () => {
    setPhoto(null);
    setPhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setPhoto(file);
    setPhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !photo) return;
    setPosting(true);
    setFailed(false);
    const ok = await onSubmit(trimmed, photo);
    setPosting(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setText("");
    clearPhoto();
  };

  if (comments.length === 0 && !open) return null;

  // Newest two by default (the list arrives oldest-first) — a card in a feed
  // shows that a conversation exists, it isn't the place to read all of it.
  // Split rather than one `visible` slice so only the block that's newly
  // revealed by "Ver todos" gets an entrance animation — the two always-shown
  // recent comments never replay it.
  const recentCount = Math.min(2, comments.length);
  const recent = comments.slice(comments.length - recentCount);
  const older = showAll ? comments.slice(0, comments.length - recentCount) : [];

  return (
    <div className="flex flex-col gap-2.5">
      {older.length === 0 && comments.length > recentCount && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="pr-press flex min-h-11 w-fit items-center text-xs font-semibold text-muted hover:text-accent active:scale-95"
        >
          Ver todos os {comments.length} comentários
        </button>
      )}

      {older.length > 0 && (
        <ul className="pr-panel-in flex flex-col gap-2.5">
          {older.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {recent.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      {open && (
      <form onSubmit={handleSubmit} className="pr-panel-in flex flex-col gap-2">
        {photoPreviewUrl && (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an Appwrite/next/image asset. */}
            <img src={photoPreviewUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <button
              type="button"
              onClick={clearPhoto}
              aria-label="Remover foto"
              className="pr-press absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-bad text-white hover:opacity-90 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickPhoto}
            className="hidden"
          />
          <label
            htmlFor={fileInputId}
            aria-label="Anexar foto"
            className="pr-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:border-accent hover:text-accent active:scale-95"
          >
            <CameraIcon className="h-5 w-5" />
          </label>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Comentar…"
            maxLength={500}
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={posting || (!text.trim() && !photo)}
            aria-label="Enviar comentário"
            className="pr-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            <SendIcon className="h-4.5 w-4.5" />
          </button>
        </div>
        {failed && <p className="text-xs text-bad">Não deu pra comentar agora — tenta de novo.</p>}
      </form>
      )}
    </div>
  );
}

/**
 * One shared run in the friends feed — no link to a detail screen (see
 * `friendsFeed.ts`'s own comment: v1 only ever shows this aggregate
 * summary, never a friend's splits), but everything the sharer's own
 * device already knew about the run: the route, new records it set, and
 * whatever track was logged playing. `Avatar` here takes
 * `displayName`/`avatarUrl` straight off the Function's already-resolved
 * response, not another profile lookup.
 */
function FeedItemCard({
  item,
  unit,
  busy,
  isOwn,
  onToggleKudos,
  comments,
  onAddComment,
  enterDelayMs,
}: {
  item: FriendFeedItem;
  unit: DistanceUnit;
  busy: boolean;
  isOwn: boolean;
  onToggleKudos: () => void;
  comments: RunComment[];
  onAddComment: (text: string, photo: File | null) => Promise<boolean>;
  /** Staggers this card's entrance behind the ones above it — capped by the
   * caller so a feed of 30 posts doesn't grow an ever-longer tail of delay
   * for cards already below the fold. */
  enterDelayMs: number;
}) {
  const pace = formatAveragePace(item.distanceMeters, item.movingSeconds, unit);
  const track = item.tracks[0];
  const routePoints = useMemo(() => parseFeedRoutePoints(item.points), [item.points]);
  /** Collapsed by default — a full-height photo on every card made the feed
   * read as "muito extenso"/"grotesco" (2026-09-01); showing a photo is now
   * an optional reveal (tap "Ver foto"), not something every card is forced
   * to spend its tallest block of space on whether the viewer wants it or
   * not. */
  const [showPhoto, setShowPhoto] = useState(false);
  /** Same reasoning one level up: the comment field is an action the viewer opts into from the footer, not a permanent fixture at the bottom of all 30 cards. */
  const [composerOpen, setComposerOpen] = useState(false);
  /** A real `<button>` that explains itself on tap, not a control that silently does nothing — reported directly ("cara não consegui salvar meu próprio kudos", 2026-09-02): the static kudos indicator on your own post looked tappable but never was (the server rejects self-kudos, see toggle-run-kudos), and tapping it gave zero feedback either way. */
  const [showKudosHint, setShowKudosHint] = useState(false);

  return (
    // Full width of the screen, not an inset rounded island — the shape a
    // post has on LinkedIn, Instagram and Facebook, and what got asked for
    // directly ("nas redes sociais o post é largura full da tela",
    // 2026-09-01). Negative margin cancels `Screen`'s own `px-5`, and the
    // side border and corner radius go with it: a band that reaches the
    // screen edge has no side to round. `Screen`'s `gap-5` between cards
    // becomes the separation between posts, the same way a feed separates
    // them with background rather than with a frame around each one.
    <Card
      className="pr-enter -mx-5 flex w-[calc(100%+2.5rem)] flex-col gap-3 rounded-none border-x-0 lg:mx-0 lg:w-full lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none first:lg:border-t-0"
      style={delay(enterDelayMs)}
    >
      <div className="flex items-start gap-3">
        <Avatar name={item.displayName} avatarUrl={item.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{isOwn ? "Você" : item.displayName}</p>
          <p className="truncate text-xs text-muted">
            {formatFeedTimestamp(item.startedAt)}
            {item.shoeName ? ` · ${item.shoeName}` : ""}
          </p>
        </div>
      </div>

      {/* One quiet context line, not a row of competing chips. These four
          facts (onde, quanto subiu, treinador vendo, o que tocava) are
          secondary by definition — the previous version gave each its own
          pill in two visual styles, so the song title carried the same
          weight as a personal record. Only the record gets an accent
          treatment now (its own strip below the numbers); everything here
          stays muted so there is exactly one thing shouting per card. */}
      {(item.placeName || (item.elevationGainMeters ?? 0) > 0 || item.coachSupervised || track) && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {item.placeName && (
            <span className="flex min-w-0 items-center gap-1">
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.placeName}</span>
            </span>
          )}
          {(item.elevationGainMeters ?? 0) > 0 && (
            <span className="flex shrink-0 items-center gap-1">
              <ElevationIcon className="h-3.5 w-3.5 shrink-0" />
              {Math.round(item.elevationGainMeters ?? 0)} m
            </span>
          )}
          {item.coachSupervised && (
            <span className="flex shrink-0 items-center gap-1">
              <WhistleIcon className="h-3.5 w-3.5 shrink-0" />
              Treinador
            </span>
          )}
          {track && (
            <span className="flex min-w-0 items-center gap-1">
              <MusicIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {track.name} — {track.artist}
              </span>
            </span>
          )}
        </div>
      )}

      {/* The closest thing this app has to Strava's activity title — the athlete's own free-text line, never generated (see FriendFeedItem.caption's own comment) — styled as a real headline instead of a small quoted aside, so the card has the same anchor a named activity gives Strava's. */}
      {item.caption && (
        <p className="-mt-1 text-lg font-semibold text-balance lg:leading-[1.2] lg:tracking-[-0.01em]">{item.caption}</p>
      )}

      {/* A real photo of the post itself ("a foto não só no comentário mas
          também do autor do post", 2026-09-01) — distinct from a photo on
          a *comment* below. Collapsed behind a toggle by default ("acho
          que poderia ser opcional ter fotos, aí seria 'escondido' a parte
          de visualizar imagens", same day): the map banner already covers
          the mandatory hero visual, so a photo is an optional extra the
          viewer opts into, not another full-height block every card pays
          for whether it's wanted or not. */}
      {item.photoUrl && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowPhoto((current) => !current)}
            className="pr-press flex h-11 w-fit items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-muted hover:border-accent hover:text-accent active:scale-95"
          >
            <CameraIcon className="h-4 w-4" />
            {showPhoto ? "Ocultar foto" : "Ver foto"}
          </button>
          {showPhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- an Appwrite Storage URL, not a local asset.
            <img
              src={item.photoUrl}
              alt=""
              className="-mx-5 h-64 w-[calc(100%+2.5rem)] object-cover lg:mx-0 lg:w-full"
            />
          )}
        </div>
      )}

      {/* Three columns, full width, never four — elevation moved up to the
          meta line because a fourth stat orphaned onto a second row and
          broke the rhythm, and because the flattened-route thumbnail that
          used to sit here drew the exact same trace the map below already
          draws, 100px apart. One route per card; the map is the real one. */}
      <div className="grid grid-cols-3 gap-3">
        <StatBlock label="Distância" value={formatDistance(item.distanceMeters, unit)} suffix={unitLabel(unit)} />
        <StatBlock label="Ritmo" value={pace} suffix={`/${unitLabel(unit)}`} />
        <StatBlock label="Tempo" value={formatElapsed(item.movingSeconds)} />
      </div>

      {/* The one emotional fact on the card gets to look like it. As an
          11px pill in the badge row it competed with the name of whatever
          song happened to be playing; here it is the single accent moment
          between the numbers it belongs to and the map. */}
      {item.achievements.length > 0 && (
        <div className="flex w-fit max-w-full items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-accent">
          <TrophyIcon className="h-4 w-4 shrink-0" />
          <p className="min-w-0 truncate text-xs font-semibold">
            Novo recorde{item.achievements.length > 1 ? "s" : ""}: {item.achievements.join(", ")}
          </p>
        </div>
      )}

      <RouteBanner points={routePoints} />

      {/* Only the kudos/comments engagement footer lives below the map
          ("deixar somente abaixo do mapa percorrido a seção de
          comentários", 2026-09-01) — every fact about the run itself is
          above it. Both actions are 44pt tall and sit together at the
          start of the row: they are a pair of equal-weight things you can
          do to this post, not one lonely control pushed to the far edge. */}
      <div className="flex items-center gap-2 border-t border-border pt-2">
        {isOwn ? (
          // Own post: kudos is something friends give you, not something
          // you toggle on yourself (the server rejects self-kudos anyway,
          // see toggle-run-kudos) — but a tap still needs an answer instead
          // of silence, so this is a real button that explains itself
          // rather than a static, dead-looking count.
          <button
            type="button"
            onClick={() => setShowKudosHint(true)}
            className="pr-press flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold text-muted hover:text-foreground active:scale-95"
          >
            <HeartIcon className="h-5 w-5" filled={item.kudosCount > 0} />
            {item.kudosCount > 0 ? item.kudosCount : "Bora"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onToggleKudos}
            aria-pressed={item.kudosGivenByMe}
            className={`pr-press flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold active:scale-95 disabled:opacity-60 ${
              item.kudosGivenByMe ? "bg-accent/10 text-accent hover:bg-accent/15" : "text-muted hover:bg-foreground/[0.04]"
            }`}
          >
            <HeartIcon className="h-5 w-5" filled={item.kudosGivenByMe} />
            {item.kudosCount > 0 ? item.kudosCount : "Bora"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setComposerOpen((current) => !current)}
          aria-expanded={composerOpen}
          className={`pr-press flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold active:scale-95 ${
            composerOpen ? "bg-accent/10 text-accent hover:bg-accent/15" : "text-muted hover:bg-foreground/[0.04]"
          }`}
        >
          <CommentIcon className="h-5 w-5" />
          {comments.length > 0 ? comments.length : "Comentar"}
        </button>
      </div>

      {showKudosHint && (
        <p className="pr-panel-in -mt-1 text-xs text-muted">
          O Bora vem dos seus amigos — não dá pra dar na própria corrida.
        </p>
      )}

      <CommentsSection comments={comments} open={composerOpen} onSubmit={onAddComment} />
    </Card>
  );
}

/**
 * One skeleton `Card`, shaped like a real `FeedItemCard` (avatar, name
 * lines, stat row, map banner) rather than one flat pulsing rectangle — the
 * previous version ("percebi que não tem skeleton loading aqui", 2026-09-01)
 * read as a generic loading box with no relation to what was about to
 * appear, not an actual preview of the feed's shape.
 */
function FeedItemSkeleton({ enterDelayMs }: { enterDelayMs: number }) {
  return (
    <Card
      className="pr-enter -mx-5 flex w-[calc(100%+2.5rem)] animate-pulse flex-col gap-4 rounded-none border-x-0 lg:mx-0 lg:w-full lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none first:lg:border-t-0"
      style={delay(enterDelayMs)}
    >
      <div className="flex items-start gap-3">
        <div className="h-13 w-13 shrink-0 rounded-full bg-background" />
        <div className="min-w-0 flex-1 space-y-2 py-1">
          <div className="h-3.5 w-28 rounded bg-background" />
          <div className="h-3 w-36 rounded bg-background" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="h-11 rounded bg-background" />
        <div className="h-11 rounded bg-background" />
        <div className="h-11 rounded bg-background" />
      </div>
      <div className="-mx-5 h-40 w-[calc(100%+2.5rem)] bg-background lg:mx-0 lg:w-full" />
    </Card>
  );
}

/**
 * Module-level cache, shared by every mounted `FeedPage` — same
 * stale-while-revalidate pattern `useAuth.ts` already uses for the account
 * check. Before this, `feedItems` started at `null` on every mount, so
 * leaving the tab and coming back (or any remount at all) blanked the whole
 * feed back to the loading skeleton and re-fetched from scratch every time —
 * reported directly ("fica toda hora mudando... verificou 1 vez a gente
 * deveria fazer algum cache", 2026-09-01). Now the first mount's fetch result
 * is kept around: a later mount renders the last-known feed immediately and
 * only silently refreshes it in the background, instead of flashing back to
 * skeletons the visitor already scrolled past.
 */
let cachedFeedItems: FriendFeedItem[] | null = null;
let cachedFriendCount: number | null = null;
/** Comments, keyed by `runRowId` — fetched in one batched `list-run-comments`
 * call right after the feed items themselves resolve, same cache lifetime
 * as `cachedFeedItems`. */
let cachedFeedComments: Record<string, RunComment[]> | null = null;

/** Module-level, not inline in the component — the lint rule that flags a
 * component reassigning an outer variable during render can't see a plain
 * function call, only an assignment expression lexically inside the
 * component body. Same reason `useAuth.ts`'s cache exposes `notify()`
 * rather than assigning `cachedState` directly from inside `useAuth()`. */
function setCachedFeedItems(items: FriendFeedItem[]) {
  cachedFeedItems = items;
}
function setCachedFriendCount(count: number) {
  cachedFriendCount = count;
}
function setCachedFeedComments(byRun: Record<string, RunComment[]>) {
  cachedFeedComments = byRun;
}

/**
 * Feed's own top-level tab (bottom nav: Corrida, Feed, Plano, Perfil) —
 * used to live as a tab inside /amigos, promoted out on request ("tem q
 * ser um feed como foco principal para nao ser uma tela so de coisa
 * pessoal, no strava a primeira tela é feed"). /amigos itself went back
 * to being just Amigos/Convites (managing who you're connected to); this
 * screen links there via the header badge for that management surface,
 * same relationship Strava has between its feed and its "find friends"
 * screen.
 *
 * Each item is its own full-width `Card` (route banner, achievement/track
 * badges, kudos) rather than rows packed into one shared list — asked for
 * directly ("nao tem nem mostrando mapa, conquistas, playlist escutada
 * etc, tem que ser bem dopamina"), same visual weight Strava gives each
 * activity in its own feed.
 */
export default function FeedPage() {
  const { status, account } = useAuth();
  const [{ distanceUnit: unit }] = usePreferences();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [feedItems, setFeedItems] = useState<FriendFeedItem[] | null>(cachedFeedItems);
  const [feedComments, setFeedComments] = useState<Record<string, RunComment[]>>(cachedFeedComments ?? {});
  const [kudosBusyId, setKudosBusyId] = useState<string | null>(null);
  /**
   * Synchronous guard against a run being toggled twice in the same tap —
   * `kudosBusyId`'s `disabled` only takes effect on the *next* render, which
   * is too late for a near-simultaneous second call (a ghost/duplicate
   * click event from the WebView, or an eager double-tap). Without this, the
   * exact symptom reported (2026-08-31): the heart flashes filled, then
   * reverts a moment later — the toggle fired twice (give, then take back)
   * before the button had actually become `disabled`.
   */
  const kudosInFlightRef = useRef<Set<string>>(new Set());
  /** Only used to tell "no friends yet" apart from "friends, but nobody's shared a run" in the empty state below. */
  const [friendCount, setFriendCount] = useState<number | null>(cachedFriendCount);

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    // Runs on every mount, cache or no cache — this is the "revalidate" half
    // of stale-while-revalidate. What changed is that a cache hit already
    // rendered real content before this fetch even starts, so a fast
    // network never shows a loading state at all, and a slow one keeps
    // showing what was there rather than blanking out while it waits.
    listFriendsFeed().then((items) => {
      if (cancelled) return;
      setCachedFeedItems(items);
      setFeedItems(items);
      if (items.length === 0) return;
      listRunComments(items.map((item) => item.runRowId)).then((byRun) => {
        if (cancelled) return;
        const asObject = Object.fromEntries(byRun);
        setCachedFeedComments(asObject);
        setFeedComments(asObject);
      });
    });
    listFriendConnections("accepted").then((rows) => {
      if (cancelled) return;
      setCachedFriendCount(rows.length);
      setFriendCount(rows.length);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleToggleKudos = async (runRowId: string) => {
    if (kudosInFlightRef.current.has(runRowId)) return;
    kudosInFlightRef.current.add(runRowId);
    setKudosBusyId(runRowId);
    const result = await toggleRunKudos(runRowId);
    kudosInFlightRef.current.delete(runRowId);
    setKudosBusyId(null);
    if (result.ok) {
      const updated = (cachedFeedItems ?? []).map((item) =>
        item.runRowId === runRowId
          ? { ...item, kudosCount: result.kudosCount, kudosGivenByMe: result.kudosGivenByMe }
          : item,
      );
      setCachedFeedItems(updated);
      setFeedItems(updated);
    }
  };

  const handleAddComment = async (runRowId: string, text: string, photo: File | null): Promise<boolean> => {
    let photoUrl: string | undefined;
    if (photo) {
      const uploaded = await uploadSharedPhoto(photo);
      if (!uploaded) return false;
      photoUrl = uploaded;
    }
    const created = await addRunComment(runRowId, text, photoUrl);
    if (!created) return false;
    const updated = { ...(cachedFeedComments ?? {}) };
    updated[runRowId] = [...(updated[runRowId] ?? []), created];
    setCachedFeedComments(updated);
    setFeedComments(updated);
    return true;
  };

  return (
    <>
      {/* hideTitle: the bottom nav tab right below already reads "Feed" — repeating it as a heading is redundant (2026-08-31). The Amigos badge stays, it's a real link, not a label. */}
      <ScreenHeader
        title="Feed"
        hideTitle
        badge={
          <Link
            href="/amigos"
            className="pr-press flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-foreground active:scale-95"
          >
            <FriendsIcon className="h-4 w-4" />
            Amigos
          </Link>
        }
      />

      <Screen>
        {status === "loading" && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {status === "signed-out" && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
            <CardTitle>Entra pra ver o feed</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              O feed mostra as corridas que seus amigos escolheram compartilhar — amizade é entre
              duas contas, é a única parte disso que precisa de login.
            </p>
            <button
              type="button"
              onClick={() => setShowAccountPrompt(true)}
              className="pr-press mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent hover:bg-accent/10 active:scale-[0.98]"
            >
              Entrar
            </button>
          </Card>
        )}

        {status === "needs-handle" && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
            <CardTitle>Falta escolher seu @</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Seu @ é como as pessoas te acham aqui.{" "}
              <Link href="/perfil" className="pr-press underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra ver o feed dos seus amigos.
            </p>
          </Card>
        )}

        {status === "signed-in" &&
          (feedItems === null ? (
            <>
              <FeedItemSkeleton enterDelayMs={0} />
              <FeedItemSkeleton enterDelayMs={40} />
              <FeedItemSkeleton enterDelayMs={80} />
            </>
          ) : feedItems.length === 0 ? (
            <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(40)}>
              {friendCount === 0 ? (
                <EmptyState size="screen"
                  title="Você ainda não tem amigos aceitos"
                  description={
                    <>
                      <Link href="/amigos" className="pr-press text-accent underline underline-offset-2 hover:text-accent/80">
                        Adicione pelo @
                      </Link>{" "}
                      pra ver as corridas deles aqui.
                    </>
                  }
                />
              ) : (
                <EmptyState size="screen"
                  title="Nada por aqui ainda"
                  description="Aparece quando um amigo compartilhar uma corrida."
                />
              )}
            </Card>
          ) : (
            feedItems.map((item, index) => (
              <FeedItemCard
                key={item.runRowId}
                item={item}
                unit={unit}
                busy={kudosBusyId === item.runRowId}
                isOwn={item.userId === account?.id}
                onToggleKudos={() => handleToggleKudos(item.runRowId)}
                comments={feedComments[item.runRowId] ?? []}
                onAddComment={(text, photo) => handleAddComment(item.runRowId, text, photo)}
                enterDelayMs={Math.min(index, 5) * 40}
              />
            ))
          ))}
      </Screen>

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo={RETURN_TO} />}
    </>
  );
}
