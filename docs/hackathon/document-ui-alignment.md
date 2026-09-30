# UI alignment with original gathering plan — 2026-09-28

Source: user-supplied “多人約飯網站：第一版開發計畫” attachment on this turn. The new request corrects UX against that document; previously explicit English-first Allvailable branding and hackathon multimodal support remain.

## Implemented

- Removed marketing hero, generated cafe image and fictional shared results from home.
- Home centers My gatherings and new gathering / Google sign-in.
- Signed-in list offers All / Hosting / Joined plus Active / Finished; cards show date range, reply deadline, own submitted status and aggregate progress.
- New gathering defaults to tomorrow through the following 13 days, 18:00–22:00, 120 minutes. Latest approved 14-day / 3-recommendation limits retained.
- Detail centers owner's availability editing. Screenshot/voice/synced calendar tools are optional collapsed imports below the editor, not the initial mandatory task.
- Four labeled status brushes, single-day navigation, 30-minute intervals, pointer drag, keyboard click, explicit start/end range fill, day/all fill, undo and submission counts.
- Draft save remains separate from formal submit; unknown submission warning preserved.
- Group progress shows reply status. Results show only candidate-specific person states and displayed score (integer score / 2).
- No other person's full calendar, complete submission grid, title or source image is shown.

## Existing implementation gaps (not claimed completed)

The current backend creates an open invitation directly; it lacks the original pre-publication host draft lifecycle, host-only participation choice, editable priority/visibility controls, manual candidate administration, exit/reopen UI. No placeholder buttons were added for absent server operations. Public invite summary also lacks a host display name. These require coordinated service/schema work.

Later explicit decisions supersede parts of the original source: max 14 days, max 3 recommendations, no joining/editing after deadline, stale snapshots cannot finalize, host may calculate early; preserve these rather than silently rolling back data contracts.

## Verification limits

TypeScript check passed after the initial workflow/editor changes. No live backend is configured, so authenticated host/member workflows cannot yet be claimed verified with real accounts. This is a UI implementation update, not full MVP acceptance.
