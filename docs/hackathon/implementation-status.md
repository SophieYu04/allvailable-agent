> October 2 update: browser voice is connected to Cloudflare Whisper followed by Nebius Nemotron; hosted WAV and MP4/AAC tests passed. See [measured evidence](voice-evidence-20261002.md). Earlier dated entries below describe their original state.

# Latest verified web release — 2026-09-30

The web homepage now calls the real Nebius-backed proposal endpoint, fills a reviewable invitation draft and preserves missing values for human completion. Screenshot import uses vision OCR followed by NVIDIA Nemotron Super and literal OCR grounding. Unknown model notes no longer make review impossible. 123 tests / 24 files, full lint, TypeScript and production build pass. Three-account hosted-backend acceptance passes; public deployment is awaiting scoped Cloudflare OAuth consent. See [live evidence](live-evidence-20260930.md) for actual model IDs, measurements and remaining gates. Browser audio remains unavailable.

The entries below are historical snapshots; their earlier missing-key status is superseded by the entry above.

# Implementation status — 2026-09-30

## Promotional credit and local planning agent

On September 30, Nebius confirmed a $25 promotional adjustment. The account had an existing linked card and was set to continue paid usage after trial. It is now saved as **Stop usage after trial**; the provider describes that option as never charging the card, with projects and API keys stopping when trial access ends. The promo code and account identifiers are excluded from this repository. No card top-up or inference request was made. A dedicated API key remains pending explicit authorization.

`lib/ai/planning-agent.ts` adds a bounded workflow around the existing coordination parser and scoring tools. It asks about missing conditions, waits for all participants to submit, and returns at most three common intervals for review. Model parsing receives the invitation text and prior proposal only; participant IDs and availability remain local. No invitation, calendar entry, message or booking is written. The runner accepts user-provided submissions locally and does not claim to authenticate those assertions against the hosted backend.

`npm run agent:demo` passed with three synthetic people and returned October 3, 20:00–21:00 Asia/Taipei. `npm run agent:live-demo` is prepared but has not been run against Nebius. Coordination parsing now has a 6,000-character input limit, a 2,048-token output cap and no automatic request retries. The shared provider caps other chat outputs at 4,096 tokens and rejects truncated results. These bounds control requests, not billing authorization.

Validation: **118 tests across 22 files passed**, TypeScript, targeted ESLint and `git diff --check` passed. Live model correctness, screenshot recognition and public deployment remain unverified. Earlier dated sections below record their original evidence and limitations.

## Independent local acceptance completed — 2026-09-28

- `/preview` now mounts the production ImportPanel through an injectable transport and uses shared clarification, date validation and preview/half-hour logic. Fixed fixtures, drafts and reviewed progress use only `allvailable.synthetic-import.v1`; reset invalidates pending fixture operations. Preview navigation disables real account controls and account lookups.
- Production defaults still use fetch and authenticated APIs. No mock header, query parameter or backend bypass was added. A locally served production build returned HTTP **404** for `/preview`.
- Fixed recording lifecycle: permission-pending and recording states block conflicting actions; explicit cancellation, unmount and the 60-second limit release tracks. Late/stale stop callbacks cannot affect a new recording. Six fake-media tests cover this; real speech and microphone behavior remain unverified.
- Improved keyboard focus after clarification/card transitions/preview and when returning to input; all-skipped feedback explicitly says the grid is unchanged. Long names/zone identifiers wrap inside the card. These changes build on the earlier complete time/timezone display fix.
- CUA checked English and Traditional Chinese, desktop and an actual **390px inner viewport** (after fixing a 388px border-width issue), with no horizontal overflow observed. Verified failed upload/retry, retained typed time after failed clarification, skip/confirm, reload persistence, cancel-preview with zero writes, exact three busy cells, all-skipped/close, keyboard activation, and double-click save preserving an unchecked existing available cell. This is browser/synthetic acceptance, not a physical-phone or live-model result.
- Final checks: **103 tests / 21 files passed**, TypeScript, repository lint, production build and `git diff --check` passed. Build retains Vinext route-classification/plugin-timing notices and Node's module.register deprecation notice.
- English README now leads with hackathon scope; previous material remains in `docs/legacy-project-guide.md`. Added local acceptance and release-readiness instructions, publication inventory script, and evidence gates in the 2:45 storyboard/Devpost draft.
- Gitleaks with `--redact --no-banner` found no leaks in the 422-file Git-visible candidate copy or 12-commit history. This is a secrets scan, not an exhaustive security audit. Inventory lists no unsafe paths or missing files. No staging, commit, public push, deployment, migration, AI call or new credential was performed.


## Review-card clarity while credit is pending — 2026-09-28

- Web review cards now show the source timezone, both dates for overnight/multi-day items, and an explicit all-day label. Missing timezone/end dates remain visibly unresolved.
- An uncertain item's confirmation button explicitly says it confirms busy time, matching the existing server behavior. Reminder items are labelled as reminders. Copy explains that saving occurs after preview.
- TypeScript, targeted component ESLint and `git diff --check` passed. No new model call or device/browser acceptance was performed; Nebius credit and API configuration remain pending.

## Screenshot-review agent continuation — 2026-09-28

- Hardening follow-up: each event's user confirmation is now persisted in the owner-only import extraction. Text/vision model parsing forcibly marks all rows unconfirmed; preview generation blocks open questions or any unconfirmed row, including direct API calls. The review card writes the confirmation before moving on, skips remain deletions, and confirming a spoken-availability row preserves its availability intent. Full Vitest: 88 tests / 19 files passed; TypeScript and targeted ESLint passed.
- Full repository ESLint and production build passed after this change; `git diff --check` is clean. The build retains the existing Vinext route-classification notice.
- Credit check: Devpost's official kickoff update advertises `$25` Token Factory credit with `NEBIUS-DEVPOST-GLOBAL26`. The signed-in dashboard was on its existing `$1` trial; applying the official code through **Top up → With promo code** returned `Invalid promo code`. Billing transactions still show $0 account balance, no new consumption, and no promo-credit grant. Builders Program credit remains unconfirmed; no paid top-up or endpoint was created.

- Latest full Vitest after the deployment-environment changes: **85 tests / 19 files passed**. Repository ESLint, TypeScript and production build also passed (build retains the existing Vinext route-classification notice).
- Latest mobile verification: **36 Flutter tests passed** and `flutter build ios --simulator --no-codesign` passed. This verifies the simulator build only; no physical iPhone/Safari speech, microphone or three-friend mobile acceptance is claimed.
- Deployment subprocesses now receive a sanitized environment: the build keeps only public Supabase browser configuration; Wrangler dry-run strips credentials; publish strips them from the process environment and passes runtime settings through the explicit secrets file. The environment regression suite passes (2 tests), with TypeScript and targeted ESLint passing. Wrangler was not invoked because its account authorization is still pending.
- Official Token Factory vision example accepts an image in chat completions with the same API key and base URL used for text; the app provider and smoke harness now support that arrangement. A separately keyed vision endpoint remains an optional override; a vision model must still be explicitly selected.
- Added a regression test for shared Token Factory authentication and a separate check that no text model is substituted when a vision model is missing. Deploy preflight now requires a configured Nemotron text model, a selected vision model and the shared API key; audio remains optional and independently configured.
- Missing event names now become a per-item clarification question, answerable with the same text/voice path; explicit availability statements do not need a title. Clarification status now uses the newly derived question list, so answering a date while time/timezone are still missing cannot incorrectly mark the import ready.
- These are configuration changes only. The account catalog's public endpoint/model availability, paid/free balance eligibility, real screenshot response and Chinese accuracy are not yet verified; no endpoint was created and no inference call was made.
- Focused verification: **25 tests / 4 files passed** (provider fallback, import question sequencing, per-card draft edits, and API clarification/confirmation/skip behavior); TypeScript `--noEmit --incremental false`, targeted ESLint and `git diff --check` passed. These mock/local checks are not live inference evidence.
- Public-release hygiene: Gitleaks scanned the current tracked diff and the complete hackathon documentation directory with full redaction; no leaks found. Ignored `.env.local` was not included in output or public artifacts.

## Hosted acceptance rerun — 2026-09-28

- Re-ran `scripts/verify-hosted-coordination.mjs` against the dedicated Allvailable Supabase project and the local HTTP API. Synthetic draft/publish/code resolution, two additional account joins, owner-only drafts, cross-account isolation, nonhost denial, deployed calculation, exact shared-hour score, finalization and reopen/history checks all passed. The script exited successfully and cleaned its temporary gathering and three synthetic auth users.
- This remains synthetic backend acceptance. Real friends' phone interaction, real model inference, and public deployment remain outstanding.

## Implemented in codex/nvidia-hackathon

- English-first home separates hosted/joined invitations, deadlines, submission status and progress. Creation saves a draft; publishing enables sharing and explicit joining.
- Private availability editor: four states, day/range/all painting, pointer and keyboard input, undo, local recovery, save, summary and explicit resubmission. Screenshot/voice import remains optional and applies only to a draft after preview.
- Host controls: participation, visibility, priority guests, settings, candidate add/remove, recalculation, finalization and reopening with a new deadline. Members can leave while open. History is retained; changed ranges trim drafts and require submission reconfirmation.
- Versioned/idempotent lifecycle RPC and API. Hidden recommendation conditions are stripped in the server projection. Complete drafts/submissions remain owner-only. Raw snapshot reads and priority column reads are denied to clients.
- Explicit modality configuration and provider errors; no silent model fallback. Unknown and tentative states are never treated as confirmed availability.
- Deployment/environment/OAuth guidance, English submission draft, video script and feedback/evidence templates are prepared. Existing work remains preserved; no remote publication occurred.

## Verification actually executed

- TypeScript: passed; repository ESLint: passed; production build: passed (existing Vinext route-classification notice).
- Vitest: **76 tests / 17 files passed**. Includes deterministic ten-person scoring and mocked provider/privacy failures.
- Fresh local PostgreSQL: **19 migrations / 3 SQL suites passed**. Includes ten-person save/submit, capacity, owner isolation, hidden conditions, host enforcement, revision conflict, idempotent publish/finalize, reopen/history, range intersection, exit and elapsed-deadline locks.
- Browser development preview: slot click and Enter, undo, fill day, save draft, next day, explicit submit/resubmit state checked at a mobile viewport. Preview uses synthetic data and local state only.
- Local dev server recovered and serving on port 5173. Browser pointer compatibility issue corrected.

## Limits and outstanding external acceptance

SQL tests execute real PostgreSQL role checks with a local auth bootstrap; they are not hosted Supabase Auth or HTTP multi-account E2E. The SQL snapshot fixture is synthetic; ranking is separately covered by deterministic unit tests. Real device Safari/touch/microphone, authenticated host-page browser workflow, real Chinese model quality and latency, public deployment and three-person acceptance remain unverified until the dedicated accounts/fixtures are configured.

Run `npm run test:database` to reproduce isolated SQL checks. See [Sophie setup](sophie-setup.md) for the single dependency list. No fabricated model measurements, credits, demo URL or submission claims.

## Hosted backend acceptance — 2026-09-28

- Dedicated project: `allvailable` / `mccbaouodyprmqplxeav` (Mumbai), confirmed ACTIVE_HEALTHY. This replaces the earlier pasted project reference.
- Independent CLI login uses `SUPABASE_HOME` through `scripts/supabase-allvailable.sh`. Credentials remain ignored and separate from the existing plugin account.
- 21 migrations applied remotely, including hosted pgcrypto search-path compatibility and anonymous RPC privilege hardening.
- `calculate-results` deployed with JWT verification enabled. Web recalculation forwards the verified host session and publishable API key, rather than comparing a separately issued service JWT with the Edge environment's key.
- Existing project URL, publishable key and server key saved in ignored `.env.local`; local server restarted.
- Hosted synthetic three-account acceptance passed: draft has no code, publish assigns six digits, code resolution, explicit joining, private drafts, cross-account read rejection, nonhost mutation rejection, real deployed calculation of the expected shared hour, finalization and reopen with history.
- Repeated acceptance through the localhost recalculation API also passed. Temporary accounts and gathering removed in cleanup. No friends' data or live AI inference was used.
- Security advisor: no remaining anonymous SECURITY DEFINER or mutable search-path notices. 24 authenticated SECURITY DEFINER notices remain; these RPCs intentionally execute after authentication with per-function authorization. This is not a claim of an exhaustive security audit.
- TypeScript, lint and 76 tests passed after integration.
- This early checkpoint was superseded by the Google OAuth setup and successful local browser round trip recorded immediately below. Real friends' device acceptance, real AI inference and public deployment remain pending.

## Google OAuth setup — 2026-09-28

- Created Google Cloud project `metal-air-510004-g4` (Allvailable), external testing Auth application and Web OAuth client `Allvailable Supabase Login`, following user confirmations.
- Callback: `https://mccbaouodyprmqplxeav.supabase.co/auth/v1/callback`.
- Saved credentials only in ignored `.env.local` and dedicated Supabase Google provider.
- Verified Auth settings endpoint HTTP 200, `external.google=true`.
- Still pending: Supabase local callback allowlist/site URL, Google test audience as needed, and complete browser Google login round trip. Safari became unavailable (`noWindowsAvailable`) after provider save, so these are not claimed complete.

## Release preparation — 2026-09-28

- Real Google sign-in as project owner completed in browser and returned to authenticated My gatherings. Local callback round trip is now verified.
- Browser created and published a labelled synthetic demo invitation; six-digit joining code and half-hour editor rendered. Submission interaction was interrupted by a browser-control timeout and is not claimed passed.
- Production build and Cloudflare deploy dry-run passed. Added explicit `--publish` deployment script, whitelisted runtime secrets, and configurable hosted acceptance origin.
- Generated synthetic Chinese screenshot and synthesized speech fixtures; no inference performed yet.
- External gates pending user responses: scoped persistent Cloudflare Workers CLI authorization (automatic approval review rejected the initial request pending specific consent) and Nebius dedicated API key / existing trial-credit usage. No public deployment or real inference claimed.

## Local follow-up — 2026-09-28

- Corrected the development-only synthetic editor fixture from 2035 to the intended October 2026 dates; the local browser now exposes 2026-10-03 and 2026-10-04 slot labels.
- Re-ran Vitest: 76 tests / 17 files passed; TypeScript, ESLint and production build passed. The build retains the existing Vinext route-classification notice.
- No new inference or public deployment was performed. Nebius API keys are absent from `.env.local`; Cloudflare CLI is still unauthenticated.

## Model evidence tooling — 2026-09-28

- Updated `scripts/hackathon-smoke.mjs` to attempt text, vision and audio independently. A missing vision/audio key no longer prevents collecting Nemotron text evidence once its key is configured.
- Ran `node scripts/hackathon-smoke.mjs --text`; it reported `NEBIUS_API_KEY` missing and made no inference call.
- Checked the current [Token Factory API index](https://docs.tokenfactory.nebius.com/llms.txt): it lists chat and vision APIs, but no audio transcription API. The configured `/audio/transcriptions` route remains unverified; do not claim that Nebius voice transcription works until an authorized endpoint is confirmed and tested.

## Dated task-list review agent — 2026-09-28

- Image extraction now accepts a clearly dated day-planner/task-list layout and instructs the model to keep each visible row separate. Missing exact times stay unresolved; explicit deadlines/reminders cannot become schedulable intervals.
- Import UI reviews one candidate per card. Skip removes the owner-scoped import candidate before server preview. Incomplete date/time/timezone blocks confirmation. User-confirmed uncertain candidates become busy intervals; deterministic grid calculation remains authoritative.
- After each clarification answer the server derives the next missing date/time/timezone question, so date-only candidates no longer dead-end.
- Added synthetic `dated-tasks.png` and a truth manifest under ignored `outputs/hackathon-fixtures`; it contains a deadline, a date-only dinner and a task row. No model inference has run.
- Added a repeatable three-person / mobile acceptance case for this fixture: per-row cards, spoken exact-time correction, deadline skips, exact expected busy cells, unknown date/timezone locks and cross-account privacy checks.
- Added tests for question sequencing, unknown-time non-writing, explicit confirmation to exact half-hour busy cells, skipped-candidate removal, credential stripping from Wrangler's environment, and Web audio capability reporting only when all independent settings exist. Full Vitest: **81 tests / 19 files passed**; TypeScript, targeted ESLint, `git diff --check`, and production build passed (with the existing Vinext route-classification notice). Real vision/audio quality, public deployment and three-person phone acceptance remain unverified.
- Gitleaks: 12-commit history, pre-commit diff, root release/config files and source/documentation directories scanned with full redaction; no leaks found. Generated Flutter/Xcode build caches were intentionally excluded after the initial whole-tree scan proved too expensive.
- Public deployment now fails closed unless Nebius is enabled, Nemotron is selected for text, and independently keyed text/vision HTTPS paths are present. Web recording is hidden unless its separate optional audio path is fully configured; iOS has a native speech-recognition-to-Nemotron correction path. Neither optional audio route has real-device/runtime evidence. This guard is not evidence of successful inference; live smoke tests and human review remain required. Dry-run remains available without provider keys.
- Wrangler receives only a sanitized process environment; credential-named variables (including Supabase service keys, Nebius keys, Google secrets and CLI tokens) are supplied only through the explicit runtime secret allowlist. Eleven sanitizer assertions passed; a publish simulation confirmed missing model endpoints are rejected before build/deploy. No Cloudflare request was made.

## Mobile and official submission check — 2026-09-28

- Flutter widget/repository suite: **37 tests passed**. Coverage includes import-preview cancellation, explicit confirmation before calendar writes, and permission-denial draft retention.
- `flutter build ios --simulator --no-codesign`: passed; produced `mobile/build/ios/iphonesimulator/Runner.app`. No iPhone or configured simulator was available in the device inventory; real-device speech and three-person mobile acceptance remain pending.
- `flutter analyze` reports 103 info-severity style suggestions, zero warnings and zero errors; its exit status is nonzero, so the analyzer is not fully clean.
- Rechecked the [official Devpost requirements](https://nebiusglobalaihackathon.devpost.com/) and [rules](https://nebiusglobalaihackathon.devpost.com/rules): deadline is Oct 30, 2026 at 10:00 PDT (Oct 31, 01:00 Taipei); the public YouTube demo must be under 3 minutes, show the project working on its intended device, and include audio explaining Token Factory and the NVIDIA open model. The one-minute working-modules clause applies to Physical AI; this app voluntarily reserves a continuous 1:05 product walkthrough. A working demo, public licensed repository, README, and actual tool feedback are required.
