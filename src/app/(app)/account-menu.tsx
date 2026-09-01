"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { Avatar } from "./avatar";
import { AccountCard } from "./account-card";
import { ModalPortal } from "./modal-portal";

/**
 * Desktop-only entry point for account settings — the native app has a
 * whole "Perfil" tab for this because tab bars are how mobile apps work;
 * a dedicated sidebar destination for it on desktop just restages that
 * same mobile pattern in a wider window. Real desktop products (Vercel,
 * Linear, Notion) put account behind a small header trigger instead, so
 * this renders in `AppHeader` next to the notification bell — see
 * `app-shell.tsx` — and the sidebar's own "Perfil" entry was removed
 * (`DESKTOP_TABS`) once this replaced it.
 */
export function AccountMenuButton({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { status, profile } = useAuth();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Conta"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="hidden shrink-0 items-center justify-center lg:flex"
      >
        {status === "signed-in" && profile ? (
          <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size="sm" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8.25" r="3.75" />
              <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <ModalPortal>
          <div
            role="presentation"
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-6 pt-28"
            onClick={() => onOpenChange(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Conta"
              className="w-full max-w-md border border-border bg-background p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <AccountCard />
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
