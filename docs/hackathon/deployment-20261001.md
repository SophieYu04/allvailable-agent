# Public deployment verification — October 1, 2026

- Frontend: https://sophieyu04.github.io/allvailable-agent/
- API: https://allvailable-hackathon.sakurajade4869.workers.dev
- Initial Pages release: `42f1f76`; GitHub Actions run `36830586512` succeeded.
- Cloudflare dashboard confirmed **Free — $0 — Current plan** before publishing. No paid upgrade was enabled.

## Verified

1. Public Pages returned HTTP 200. Google sign-in returned to the repository URL and loaded the authenticated invitation list.
2. The public browser made a real Nebius request for a synthetic dinner on October 10, 2026. Nemotron populated October 10, an 18:00–21:00 window, 60 minutes, and October 9 at noon as the reply deadline. No gathering was created from that validation draft.
3. Three disposable backend test users joined by code, submitted availability and produced the expected common hour through the deployed Worker. Owner-only drafts and nonhost restrictions passed; synthetic accounts and gathering were cleaned up.
4. The Pages preflight returned HTTP 204 with its exact origin; an untrusted origin returned 403 and an unsigned Pages request returned 401. Browser bundles contained none of the configured Nebius, Supabase service-role or Google private keys.
5. All 127 tests, TypeScript, lint, static frontend build and Worker production build passed. Existing authenticated invitation pages loaded under hash routes; production links retain the repository prefix.

## Scope

This verifies the deployed browser and backend, not physical-phone or real-friend acceptance. Screenshot inference had been verified in the [September 30 evidence](live-evidence-20260930.md); this deployment check used text inference. Browser voice input is unavailable. Credit-only inference through the December judging period, the final video and Devpost submission remain outstanding.
