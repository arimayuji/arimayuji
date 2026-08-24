/**
 * Fixed allowlist of Appwrite account IDs let into the internal content
 * panel (`/interno/conteudo`) — not a public app feature, just the
 * project owner and, later, teammates. Unlike every other relationship in
 * this app (friends, coach/student), access here isn't something two
 * accounts negotiate — it's a short list only the project owner edits by
 * hand.
 *
 * This is a UI-side courtesy, not the real security boundary: the app is
 * a static export with no server or middleware (see next.config.ts), so
 * any client-side check here only runs after the JS bundle loads. The
 * actual boundary is the `content_ideas` table's own permissions
 * (scripts/appwrite-setup.ts), which grant read/create/update/delete only
 * to `Role.user(id)` for each id below. That list is deliberately
 * duplicated there rather than imported — the same reasoning already
 * documented at the top of appwrite-setup.ts for why that script never
 * imports from `src/`.
 *
 * Keep the two lists in sync by hand when adding someone.
 */
export const INTERNAL_TEAM_ACCOUNT_IDS: string[] = [
  // Preencher com o Appwrite `$id` real de cada conta (Appwrite Console →
  // Auth → Users, ou `(await getCurrentAccount())?.id` numa sessão
  // logada). Vazio por padrão: ninguém entra até isso ser preenchido —
  // e o array espelhado em scripts/appwrite-setup.ts precisa ser
  // atualizado e o script re-rodado pra valer no Appwrite também.
];
