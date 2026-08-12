"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders straight into `document.body`, bypassing whatever ancestor DOM
 * the caller happens to sit inside. A plain `fixed inset-0` breaks the
 * moment any ancestor has a `transform` — including a finished CSS
 * animation like `.pr-enter` — because that ancestor becomes the
 * containing block for `position: fixed` instead of the viewport, and the
 * "full-screen overlay" ends up sized and positioned to that ancestor's
 * box instead. A portal sidesteps the whole class of bug rather than
 * requiring every modal's caller to remember not to nest it in anything
 * animated.
 *
 * Returns null on the server/first paint (`document` doesn't exist yet
 * during the static render) — this is a client-only component regardless,
 * so a one-frame delay before it appears is invisible in practice.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // The canonical SSR-safe-mount check: whether `document` exists can only
  // ever be known inside an effect (server and first client paint must
  // render identically, or React logs a hydration mismatch), so there is
  // no derivation that avoids this setState.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
