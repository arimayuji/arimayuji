# "Ver foto" pill matches the other 44pt action pills' text size

Written against: a8ca743

## Evidence chain

- Surface: `/feed` — `src/app/(app)/feed/page.tsx`, `FeedItemCard`
- Problem: three pills share the same height, shape, and role (a toggleable or actionable control at 44pt) but "Ver foto" (`:569`) sets `text-xs` while kudos (`:632`) and "Comentar" (`:644`) set `text-sm`
- Design evidence: all three are `flex h-11 … rounded-full … font-semibold`, i.e. the same component-level recipe repeated three times in the same post; two of three agree on `text-sm`
- Owner: no shared component — each pill is inlined in `FeedItemCard`, so the contradiction is direct (two of three identical-role elements disagree)
- Scope and affected surfaces: `feed/page.tsx:569` only
- Uncertainty: none

## Design decision

Set "Ver foto" to `text-sm`, matching the other two 44pt pills in the same post.

## Reuse

- No new token; aligns to the majority value (`text-sm`) already used by the sibling pills in the same component.
- Exemplar: kudos button, `feed/page.tsx:632`.

## Changes

1. `feed/page.tsx:569`
   - Change: replace `text-xs` with `text-sm` in the className
   - Preserve: pill shape, icon size, border, hover state, all unchanged
   - Verify: "Ver foto"/"Ocultar foto" renders at the same text size as "Kudos"/"Comentar" in the same post

## Scope

- Inherit: every feed post with a photo attached
- Verify: none beyond this one element — it has no other consumer
- Exclude: the icon size (`h-4 w-4`), which is unrelated to this contradiction

## Validation

- Product: open a feed post with a photo, compare "Ver foto" against the kudos/comment pills below it
- Interface: default (no photo shown) and expanded (photo visible, label reads "Ocultar foto") states
- System: confirm no other pill in the feed still disagrees on text size after this change
- Repository: `npx tsc --noEmit && npm run lint && npm run build` → all clean

## Stop conditions

- None expected — single class-value change.

## Design documentation

- None.
