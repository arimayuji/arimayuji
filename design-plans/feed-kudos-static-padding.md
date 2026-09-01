# Static (own-post) kudos indicator matches the interactive kudos button's padding

Written against: a8ca743

## Evidence chain

- Surface: `/feed` — `src/app/(app)/feed/page.tsx`, `FeedItemCard`'s footer action row
- Problem: the static kudos indicator shown on the viewer's own post (`:622`, `isOwn` branch) uses `px-2`, while the interactive kudos button shown on a friend's post (`:632`) and the "Comentar" button (`:644`) use `px-3`. Both occupy the same first position in the same footer row, so a column of posts alternating between the viewer's own and a friend's shifts the action row's left edge by 4px depending on which branch renders
- Design evidence: direct contradiction between two mutually-exclusive renderings (`isOwn ? <span…px-2> : <button…px-3>`) of the same visual slot in the same component
- Owner: no shared component — both are inlined in the same conditional in `FeedItemCard`
- Scope and affected surfaces: `feed/page.tsx:622` only
- Uncertainty: none

## Design decision

Set the static kudos indicator's horizontal padding to `px-3`, matching the interactive kudos button it stands in for.

## Reuse

- No new token; aligns to the value already used by the interactive counterpart in the same conditional.
- Exemplar: `feed/page.tsx:632`.

## Changes

1. `feed/page.tsx:622`
   - Change: replace `px-2` with `px-3` in the className
   - Preserve: `h-11`, non-interactive `<span>` (not a `<button>`), icon and text content, unchanged
   - Verify: the action row's left edge sits at the same x-position whether the post is the viewer's own or a friend's

## Scope

- Inherit: every own-post feed card (the `isOwn` branch)
- Verify: a feed containing both own and friends' posts, checking left-edge alignment down the column
- Exclude: the `gap-2` between icon and label, which already matches the interactive button and needs no change

## Validation

- Product: scroll a feed with a mix of own and friends' posts, confirm the kudos/comment row aligns vertically post to post
- Interface: `isOwn` and non-`isOwn` render paths, default viewport
- System: confirm no other static-vs-interactive pair in the footer still disagrees on padding
- Repository: `npx tsc --noEmit && npm run lint && npm run build` → all clean

## Stop conditions

- None expected — single class-value change.

## Design documentation

- None.
