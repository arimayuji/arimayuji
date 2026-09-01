# Feed posts restore the documented desktop panel at `lg:`

Written against: a8ca743

## Evidence chain

- Surface: `/feed` — `src/app/(app)/feed/page.tsx`, `FeedItemCard` (`:501`) and `FeedItemSkeleton` (`:668`)
- Problem: at `lg:` (desktop web), the post has a rounded corner with no side border to close it, and the full-bleed map/photo overflow 4px past the post's own edge on each side
- Design evidence: `Card` (`src/app/(app)/ui.tsx:328-349`) applies `lg:rounded-lg lg:p-4` as a documented default — every `Card` should read as a desktop panel at that width (`ui.tsx:315-327`). Measured at 1280px viewport: post `borderRadius: 8px`, `borderLeftWidth: 0px`, `padding: 16px`; map child at x=424/496px vs. post box at x=428/488px
- Owner: `Card` component contract in `ui.tsx`
- Scope and affected surfaces: `feed/page.tsx` only — `FeedItemCard`'s `Card` (`:501`), `FeedItemSkeleton`'s `Card` (`:668`), and the three full-bleed children that key off the post's own edge: `RouteBanner`'s wrapper (`:214`), the post-photo `<img>` (`:579`), `FeedItemSkeleton`'s map placeholder (`:683`)
- Uncertainty: none

## Design decision

The full-width, borderless, square-cornered treatment is scoped to below `lg:` only. At `lg:` the post reverts to the `Card` default it already inherits everywhere else in the app (`lg:rounded-lg`, bordered on all sides, `lg:p-4`), and the full-bleed children stop bleeding past a box that no longer extends to the screen edge.

## Reuse

- `Card`'s own `lg:rounded-lg lg:p-4 border` — already the default; this plan removes the override that currently cancels it at `lg:`, rather than introducing a new panel style.
- Exemplar: any other `Card` consumer in the app (e.g. `account-card.tsx`) already renders correctly at `lg:` with no override.

## Changes

1. `feed/page.tsx:501` (`FeedItemCard`'s `Card`)
   - Change: append `lg:mx-0 lg:w-full lg:rounded-lg lg:border-x` to the className so the mobile override (`-mx-5 w-[calc(100%+2.5rem)] rounded-none border-x-0`) is cancelled at `lg:`
   - Preserve: the full-width, borderless, square-corner treatment below `lg:`
   - Verify: at 1280px, post `borderRadius` is `8px` with a real left/right border; post box width equals `SCREEN_WIDTH_PANEL`'s column, not the viewport
2. `feed/page.tsx:668` (`FeedItemSkeleton`'s `Card`)
   - Change: same `lg:mx-0 lg:w-full lg:rounded-lg lg:border-x` addition, so loading and loaded states match at `lg:`
   - Preserve: mobile skeleton shape
   - Verify: visually identical corner/border treatment to a loaded post at `lg:`
3. `feed/page.tsx:214` (`RouteBanner` wrapper), `:579` (post-photo `<img>`), `:683` (skeleton map placeholder)
   - Change: append `lg:mx-0 lg:w-full` to each, cancelling `-mx-5 w-[calc(100%+2.5rem)]` at `lg:`
   - Preserve: full-bleed-to-post-edge behavior below `lg:`
   - Verify: at 1280px, each element's bounding box x/width exactly matches the parent post's content box (no overflow, no gap)

## Scope

- Inherit: every rendered feed post and skeleton, mobile and desktop
- Verify: the two-post desktop screenshot used during the audit; no other screen uses this full-width-post pattern to check for a parallel convention
- Exclude: the mobile (`<lg`) treatment, which is the one explicitly requested by the product owner and stays as-is

## Validation

- Product: visit `/feed` at a desktop browser width and confirm each post reads as a bordered, rounded panel with no overhanging media
- Interface: check both a post with a route map and a post with a photo, at `lg` breakpoint boundary (1024px) and a wide desktop width (1280px+); confirm mobile (`390px`) is pixel-identical to before
- System: confirm no new radius/border value is introduced — only `Card`'s existing `lg:` defaults are allowed to take effect
- Repository: `npx tsc --noEmit && npm run lint && npm run build` → all clean

## Stop conditions

- Stop if `Card`'s `lg:` treatment has itself changed since a8ca743 (re-read `ui.tsx:328-349` before applying).

## Design documentation

- None — this restores an existing documented default rather than establishing a new one.
