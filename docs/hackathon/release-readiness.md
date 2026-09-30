# Current release gate — September 30, 2026

Live Nebius/NVIDIA web integration and final code checks are complete; see [measured evidence](live-evidence-20260930.md). Cloudflare OAuth has been prepared with only account/user read, Workers Scripts Write and background access; explicit consent is pending. GitHub CLI is authenticated. No paid service has been activated. The older tranche-specific constraints below are historical, not a statement that today’s live tests did not occur.

# Release readiness and handoff

## Completed without credits

- Development-only interactive synthetic review page using production cards and shared validation/calculation.
- Local persistence, isolated reset, one-shot failure simulation, and a 390px embedded viewport.
- Recording cancellation/cleanup, card focus changes, all-skipped messaging and full time/timezone display.
- English root README, preserved broader project guide, rehearsal instructions and evidence-gated 2:45 storyboard.

## Publication candidates

Generate an inventory without staging or publishing:

```sh
node scripts/release-inventory.mjs
```

The JSON lists the current tracked and nonignored untracked regular files, their sizes, and any unsafe or missing entries. An unsafe entry makes the command fail. Git history must be scanned separately. This is a publication candidate list, not an automatic approval of all unrelated work.

| Group | Purpose |
| --- | --- |
| Root README, LICENSE, package/lock files, framework configuration, build/ plugin source | Reproducible licensed application |
| app/, components/, lib/, public/ | Web source, assets, shared logic and tests |
| scripts/, tests/, supabase/ | Setup, isolated CLI workflow, verification and migration history |
| docs/ | Architecture, scope, limits, acceptance records and submission drafts |
| mobile/ source and platform configuration | Existing companion implementation; distinguish it from verified web behavior |

`.env.local`, independent CLI token state, raw calendar/voice media, outputs, dependency folders and generated native build caches are excluded. `.env.example` contains placeholders only. Preserve existing uncommitted work and do not mass-stage the working tree. Review the inventory again immediately before publication.

## Remaining gates, in order

| Gate | Codex work after it is available | Evidence required |
| --- | --- | --- |
| Nebius credit/account access and dedicated local API key | Verify catalog, select models, run live text/image cases and record human accuracy; check audio separately | Real request/model/latency plus reviewed output |
| Scoped Wrangler authorization | Configure secrets, publish, verify production OAuth and hosted flow | Accessible HTTPS demo and hosted acceptance |
| GitHub CLI authentication | Review final inventory/history, create and push public licensed repository | Accessible repository and fresh setup instructions |
| Consenting friends on phones | Facilitate the three-person scenario and resolve device issues | Real shared interval, privacy and microphone results |
| Verified working demo | Final English narration/cut, actual tool feedback and submission fields | Public YouTube under 3 minutes; no mock claims |

No deployment, public push, model credit consumption, microphone permission or external account change is part of this local work tranche.

## Scan and verification record — 2026-09-28

- Inventory: 422 regular candidate files; no unsafe paths or missing files. Generated reports and screenshots remain under ignored `outputs/hackathon-release/`.
- `gitleaks dir <temporary-candidate-copy> --redact --no-banner`: no leaks found. Only inventory files were copied; `.env.local` and generated caches were excluded.
- `gitleaks git . --redact --no-banner`: 12 commits scanned, no leaks found.
- 103 tests / 21 files, TypeScript, repository lint, production build and diff whitespace checks passed. Local production `/preview`: HTTP 404.
- The public PNG at `public/images/together.png` is an existing design asset; the inventory/secret scan does not establish rights for every asset or replace final publication review.

