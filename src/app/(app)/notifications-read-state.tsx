/**
 * Read/dismiss bookkeeping for the app-update notification — the one
 * notification type in the system that actually has a "read" state of its
 * own. Friend requests and coach invites don't: they're either pending
 * (still need a yes/no) or already gone (accepted/declined elsewhere), so
 * there's nothing honest to mark "read" on them short of literally acting
 * on the request. Shared between `NotificationBell` (badge count) and
 * `/notificacoes` (the row itself) so both agree on what counts as seen.
 */

const DISMISSED_KEY = "xanthus:update-dismissed-version";
/**
 * Separate from `DISMISSED_KEY` on purpose: tapping the row to go look at
 * it (download the update) used to also permanently dismiss it, so a
 * notification you'd only glanced at vanished from the list. Reading no
 * longer removes anything; only the explicit "marcar como lido" action
 * writes to `DISMISSED_KEY`.
 */
const READ_KEY = "xanthus:update-read-version";

export function wasDismissed(versionCode: number): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === String(versionCode);
  } catch {
    return false;
  }
}

export function dismissUpdate(versionCode: number) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(versionCode));
  } catch {
    // Storage disabled: the item just reappears next open, harmless.
  }
}

export function wasRead(versionCode: number): boolean {
  try {
    return localStorage.getItem(READ_KEY) === String(versionCode);
  } catch {
    return false;
  }
}

export function markUpdateRead(versionCode: number) {
  try {
    localStorage.setItem(READ_KEY, String(versionCode));
  } catch {
    // Storage disabled: it just counts as unread again next open, harmless.
  }
}
