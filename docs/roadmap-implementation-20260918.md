# Roadmap implementation and release evidence — 2026-09-18

Status: substantial implementation is present in the working tree; the complete MVP is **not released or fully accepted**. No remote database deployment, real Google/AI request, signed device build, or TestFlight upload was performed. Existing uncommitted work was preserved.

## Implemented flows

| Milestone | Implemented in this working tree | Evidence and remaining acceptance |
|---|---|---|
| Daily calendar and Deadline | Upcoming incomplete items today through day six, three-item expansion, all-items sheet, Taipei date countdown and midnight/resume refresh; paginated all-deadline API and account-scoped cache; existing CRUD/offline queue retained | Date boundary, small display with 2× text, form failure/retry, offline/cache tests. Full calendar overlap/cross-day layout and physical-device regression still required |
| Google | Busy/tentative/free mapping, private title persistence, atomic full-result commit, generation/revision guard against disconnect and overlapping sync, shared calendar/settings connection sheet, local external-cache clearing | Isolated PostgreSQL confirms owner-only reads, failed-sync rollback and disconnect rejection. Real consent/revoke/update/delete tests still required |
| App/Web coordination | Authenticated browser join, local/cloud draft, explicit submit, results and self-calendar insertion; shared scoring with explicit reasons; atomic draft/submit/snapshot/finalization/self-event operations; manual create keeps input on failure and uses stable idempotency key | Unit tests and synthetic three-user SQL flow pass. Cold-start/OAuth return, browser interaction, race stress and real three-account flow still required |
| AI | Text/voice proposal preview and explicit apply; host adjustment with revision checks, intersection preservation and submission invalidation; native image picker and 60-second recorder; clarify/preview/select/apply availability; known tentative separated from unknown; blank screenshot space no longer becomes green | Validation fixtures and SQL proposal ownership/replay/stale-version tests pass. Real text/image/audio provider flow and native permissions still required |
| Release | iOS simulator compilation, Web build, local test evidence and this record | Signed physical iPhone build, distribution and two-week pilot not completed |

## Database changes

Six new migrations follow the existing migrations, without modifying deployed history:

- `20260918034312_roadmap_calendar_transactions.sql`: transactional Google synchronization and disconnect coordination.
- `20260918034748_roadmap_ai_proposals.sql`: owner-readable expiring proposals and confirmed apply.
- `20260918035502_roadmap_coordination_atomicity.sql`: immutable snapshot commit, draft/submission validation, idempotent join and own-calendar event.
- `20260918035812_roadmap_membership_privacy.sql`: membership RLS recursion fix, direct-write restrictions and cancellation RPC.
- `20260918040338_roadmap_create_idempotency.sql`: stable-key gathering creation.
- `20260918041749_roadmap_ai_retry_context.sql`: owner-only expiring transcript replay and stable adjustment context.

All migrations were applied in order to a disposable Event Planner PostgreSQL 17 cluster using a minimal emulated Supabase auth contract. `tests/database/bootstrap.sql` is **only** for that disposable harness, never for a Supabase project. `tests/database/roadmap.sql` creates three synthetic users inside a rolled-back transaction. This validates SQL and RLS, not live Supabase Auth or deployed Edge Functions.

## Reproducible checks

From repository root: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

From `mobile`: `flutter test`, `flutter analyze`, `flutter build ios --simulator --no-codesign --debug`.

Observed: 45 Web tests passed; 26 Flutter tests passed, including small-screen Deadline and draft conflict/offline/account isolation cases. Flutter analyze had zero errors/warnings, with style-level informational lints. Web lint, TypeScript and production build passed. Unsigned iOS Simulator build passed. Simulator runtime UI was not inspected; no simulator was booted.

SQL assertions passed for Google owner-only titles, transaction rollback, disconnect races, membership visibility, duplicate joins, draft/submission retries, self-calendar deduplication, AI owner-only preview/apply, repeated confirmation, intersection drafts, invalidated submissions and stale revisions. These are sequential invariant tests, not a complete concurrent-load proof.

## Remaining engineering and external gates

The remaining work includes code and validation, not just credentials:

- AI retries: proposal writes are idempotent, requests are mutually exclusive, and successful audio transcripts are persisted for retry replay with owner-only reads and expiry. Server-side media-duration enforcement and the full fixed multimodal error/quota suite need completion. The native recorder caps capture at 60 seconds.
- Native AI input survives request failures while the screen is open; process-restart recovery of unfinished AI text/media sessions and import recovery UI remain unverified. Adjustment preview now persists the original conditions and displays the number of submissions requiring reconfirmation.
- Web range selection works by start/end clicks; touch-drag parity and account-switch/browser interaction need dedicated verification. Current all-deadline pagination is offset-based and has no consistent snapshot across concurrent edits.
- Calendar small-screen coverage currently targets Deadline and forms, not every 24-hour/overlap/all-day/cross-day combination. Full privacy/API concurrency regression and content-free step timing instrumentation still need completion.
- Real Event Planner Supabase configuration, Google OAuth, AI settings and signing/distribution must be supplied in the project environment. `.env.local` and `mobile/.env` were absent, and the current process had none of the Supabase public/service, Google client/secret or OpenAI/AI-enabled variables checked. No credentials were printed or copied from other products.

## Release procedure and acceptance record

1. Configure only the Event Planner test project. Apply migrations in order and deploy the calculation/deadline workers. Verify worker scheduling, service-role access and browser/iOS OAuth return URLs against that project.
2. Run three real accounts across iPhone and Web: create → share → join → draft → submit → compute → finalize → independently add to calendar. Repeat with cutoff, stale draft/snapshot, offline restart and lost responses. Record actual pass/fail; synthetic results do not satisfy this gate.
3. Connect Google for one account; verify title visibility for owner only via UI, API and direct RLS queries. Change/delete/free/tentative events, interrupt sync and disconnect. Verify old data survives incomplete fetches and disconnected data stays removed.
4. Test actual AI text, screenshot and voice inputs, missing conditions, unknown/tentative, refusal, malformed response, quota and retry. Confirm no model output writes before explicit user confirmation and no Google titles enter coordination prompts.
5. Sign and distribute to 5–10 testers only after blockers are resolved. Collect step outcome/duration without private content. Two-week targets remain 80% independent first event, three real finalized gatherings, and zero known lost/duplicate/private-title incidents.

No stage should be marked accepted solely because its routes or screens compile.
