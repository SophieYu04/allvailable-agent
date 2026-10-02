# Allvailable — find a time together

Mobile-first web agent for **Best Apps and Agents**, Nebius × NVIDIA Global AI Hackathon.

## What it does

A host saves a gathering draft, publishes it and shares the link. Each friend explicitly joins and fills their private availability; screenshots and voice are optional input helpers. The agent extracts calendar information and asks about missing dates, times or timezone. Each person reviews a draft before submitting. A deterministic engine ranks at most three candidate times. Unknown, tentative and missing replies never become “everyone available.” Friends do not receive event titles or original images.

## Run locally

1. Use Node 22.13+ and `npm ci`.
2. Copy `.env.example` to `.env.local`; fill the Event Planner dedicated Supabase URL/publishable key and server credentials. Configure Google authentication with `/auth/callback` and your local/hosted origin in Supabase's redirect allowlist. Use the existing migrations in order for the dedicated project; do not point this build at another app's database.
3. Configure the modality endpoints below, then set `AI_IMPORT_ENABLED=true`.
4. Run `npm run dev` and open `http://localhost:5173`. English is the default. Use the language switch for Traditional Chinese; explicit language choices are remembered.
5. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

No credentials or raw calendar recordings should be committed. Missing configuration produces an explicit error; manual entry remains available.

## AI architecture

| Path | Environment | Responsibility |
| --- | --- | --- |
| Text → structured events | `NEBIUS_API_KEY`, `NEBIUS_BASE_URL`, `NEBIUS_MODEL` | NVIDIA Nemotron served on Nebius Token Factory; parse voice transcripts / calendar text, clarification and constrained corrections |
| Screenshot → structured extraction | `NEBIUS_API_KEY`, optional `NEBIUS_BASE_URL`, and `NEBIUS_VISION_MODEL` | Token Factory's documented image requests use the same API key and chat-completions endpoint as text; model must independently support vision and pass a real Chinese screenshot test. Optional `NEBIUS_VISION_API_KEY` / `NEBIUS_VISION_BASE_URL` overrides remain available |
| Chinese voice correction on iOS | iOS system Speech recognition, then Nemotron text endpoint | Native on-device recognition supplies a transcript for the same explicit clarification flow; real-device acceptance remains pending. |
| Web recording → transcript → Nemotron | `CLOUDFLARE_AUDIO_ENABLED=true` on Cloudflare Workers Free | Whisper large-v3-turbo via the AI binding; Nemotron stays on Nebius. [Live verification](voice-evidence-20261002.md). Independent `NEBIUS_AUDIO_*` configuration remains an alternative |
| Submitted availability → candidates | Existing TypeScript/SQL scoring | Deterministic whole-interval scoring, stable existing ranking, unknown excluded from confirmed availability |

All provider calls occur server-side. Model output is schema-validated and treated as a proposal. Imported changes use a stored preview and target version. Drafts are private; only a formal submission participates in recommendations. UI availability uses 30-minute cells, at most 14 days and 10 members. Voice availability is rounded inward so a partial cell cannot appear fully available; busy intervals include every intersecting cell.

Nebius Serverless Endpoints / Jobs are optional for this track. This implementation uses the existing web hosting and dedicated Supabase service; **it does not claim deployment to Serverless**. Real Token Factory use is required before submission.

## Current evidence and remaining acceptance

Code integration is implemented. The dedicated Supabase backend passed synthetic three-account acceptance, including the deployed calculation function and private-data checks. The local Google sign-in round trip also passed. Exact live model IDs, latency, Chinese recognition quality, a public app deployment and friend-operated browser flows remain **unverified**. Unit tests with mocked provider responses are not live inference evidence.

Use `node scripts/hackathon-smoke.mjs --text` to test Nemotron independently. Use `node scripts/hackathon-smoke.mjs --vision /absolute/calendar.png` and `node scripts/hackathon-smoke.mjs --audio /absolute/voice.wav` for the other modalities after their endpoints are verified. With no flags, the script attempts all three independently, taking the image path then audio path. It logs endpoint/model/status/latency, never private content or keys. Review recognized content in the application against the original fixture; a successful HTTP call alone is not an accuracy pass. Record exact tested model IDs and results in [acceptance.md](acceptance.md).

## Development provenance

Earliest commit visible in this repository: `fb3c8b7`, authored **2026-09-13T16:03:02+08:00**. This proves the visible Git history begins then; it does not prove the original project creation date. The prior assertion that the project existed before August 26 was unsupported and removed.

Hackathon branch: `codex/nvidia-hackathon`, based on the working checkout including pre-existing uncommitted invitation/import/mobile changes. Before branch creation, tracked changes were preserved in `/tmp/event-planner-before-nvidia.patch` and untracked nonignored files in `/tmp/event-planner-before-nvidia-untracked.tar.gz`. These local snapshots are not submission artifacts.

Hackathon changes: mobile-first bilingual home/invitation flow, screenshot and voice integration, explicit blank-availability preview, confirmed-versus-tentative result labels, independent provider configuration, fail-closed missing-model errors, availability rounding fix and regression tests. Review Git history and retained baseline with Sophie before describing what was developed during the submission period.

## Submission

Official deadline: **2026-10-31 01:00 Asia/Taipei** (Oct 30, 10:00 PDT). Internal target: Oct 28.

Required: working demo URL, public repository with open-source license and setup README, public YouTube video under 3 minutes, project description/track, and actual tools feedback. Final publication and Devpost submission remain Sophie's steps. Existing MIT LICENSE must accompany the public repository.

Paste-ready entry fields and the evidence gates are in [devpost-entry.md](devpost-entry.md). Bracketed fields must be replaced with live, human-reviewed evidence before submission.

Sources checked 2026-09-27: [official requirements](https://nebiusglobalaihackathon.devpost.com/), [rules](https://nebiusglobalaihackathon.devpost.com/rules).

## Local lifecycle verification

Run `npm run test:database` with local PostgreSQL binaries (`pg_config` on PATH, or `ALLVAILABLE_POSTGRES_BIN`). It creates a disposable loopback-only cluster, applies all migrations, runs three SQL suites and stops the cluster. It never reads remote credentials. Logs are retained in the reported temporary directory.

`/preview` is a development-only, visibly labelled synthetic editor. It does not call providers, save to the backend or establish multi-account acceptance. Production returns not found.

Host lifecycle actions use `/api/v1/coordination/:id/manage` with an expected revision and idempotency key. The server checks role, locks and capacity. Changes affecting availability intersect existing drafts with the new range and invalidate submissions. Reopening requires a new deadline and keeps historical finalizations. Read RPCs expose only the caller's complete draft, group progress and candidate statuses; hidden priorities and scores are omitted.

## Deployment and repeatable fixtures

- `node scripts/deploy-allvailable.mjs`: production build and Cloudflare dry-run only.
- Once authorized: `ALLVAILABLE_DEPLOY_ORIGIN=https://<verified-demo-host> node scripts/deploy-allvailable.mjs --publish`. Publish refuses unless Nebius AI import is enabled, the text model is NVIDIA Nemotron, and text and vision HTTPS endpoints/models are configured. Token Factory vision can reuse the main API key; an independently keyed override remains supported. Web audio is optional and stays hidden unless its complete endpoint is configured. Run and review each supported live smoke case before publication; configuration alone is not model evidence. Runtime secrets are whitelisted and passed through a temporary 0600 file; the Wrangler process environment is stripped of credential-named variables. Google management credentials are excluded.
- `ALLVAILABLE_TEST_ORIGIN=https://<verified-demo-host> node scripts/verify-hosted-coordination.mjs`: real hosted backend with disposable synthetic accounts, explicit HTTPS target, cleanup after execution.
- `node scripts/create-hackathon-fixtures.mjs`: synthetic Chinese calendar image and macOS synthesized voice in ignored `outputs/hackathon-fixtures`; see the fixture README. These are engineering inputs, not real-user evidence.

