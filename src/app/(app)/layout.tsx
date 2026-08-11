import { AppShell } from "./app-shell";

/**
 * Route group `(app)`: the four tabbed screens plus the share preview.
 *
 * The parentheses keep the group out of the URL — `/run` is still `/run` —
 * while giving every screen inside it the bottom tab bar. `/` stays outside
 * this layout on purpose: it is the marketing page, not part of the app.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
