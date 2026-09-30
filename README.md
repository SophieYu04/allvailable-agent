# Allvailable

**Find a time together, without sharing your private calendar.**

A mobile-first web app for the Nebius × NVIDIA Hackathon, targeting **Best Apps and Agents**. Each friend joins through a link or six-digit code, reviews their own availability, and explicitly submits it. Deterministic code finds shared half-hour intervals.

**Status (September 30, 2026):** real Nebius inference is connected to the web app. Natural-language invitation drafts use NVIDIA Nemotron Super; screenshot transcription and review use MiniCPM plus Nemotron. The local web flow and three-account backend acceptance are verified. Public deployment, physical-phone acceptance and the final video remain release gates. [Public source](https://github.com/SophieYu04/allvailable-agent) is available under MIT.

## The core flow

1. Describe the gathering in English or Chinese. The agent prepares a draft; review its dates, time window, duration and reply deadline before saving and sharing its link or six-digit code.
2. Paint availability, or import a screenshot when AI is configured.
3. Review one extracted item at a time. Supply missing dates/times, or skip a deadline or unrelated task.
4. Preview the exact cell changes, save a private draft, then explicitly submit.
5. Compare shared time candidates. Unknown or unsubmitted time never counts as available.

The interface defaults to English; Traditional Chinese and account actions live in the menu. WhatsApp, restaurant booking and the full Planner are outside this hackathon edition.

## Run the local synthetic acceptance workflow

Use Node.js 22.13 or newer:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173/preview**. This development-only route uses the real review component with an in-browser fixture transport. It needs no API key, model credits or backend account. It never sends the sample to a model or submits it to friends.

Load the three sample cards. Skip the report deadline, give dinner the time `19:00-20:30`, confirm it, and skip the ticket task. Preview and save: exactly three cells on October 3, 2026 should become busy. The page provides a 390px frame, failure injection and reset controls. Progress lives only under `allvailable.synthetic-import.v1` in this browser.

Production builds must return 404 for `/preview`; a synthetic walkthrough is not live-model evidence.

## Run the planning agent

`npm run agent:demo` runs a local, synthetic three-person planning workflow without a key or network inference. The agent validates invitation conditions, asks about missing information, and computes up to three complete intervals where every participant has explicitly submitted green availability. It returns a proposal for review; it does not create invitations or book events.

After configuring a dedicated Nebius API key and verifying the account's **Stop usage when the trial ends** preference, `npm run agent:live-demo` makes one model request with a synthetic invitation. The request is capped at 2,048 output tokens and is not retried automatically. Participant availability stays local. Token limits do not enforce an account dollar limit or override Nebius billing settings.

For your own invitation, use `node scripts/planning-agent.mjs --live --input /absolute/input.json`. The JSON contains `request`, optional `existing` (the prior result's `proposal`), and `participants`: an array of `{ "id": "friend-1", "submitted": true, "cells": { "2026-10-03-20:00": "green", "2026-10-03-20:30": "green" } }`. Dates and daily windows use Asia/Taipei. Blank, yellow, red and unsubmitted availability cannot become a common candidate. The command prints the proposal locally, so treat output from real requests as private.

**Billing constraint:** this deployment is being tested with promotional credits and the provider preference **Stop usage when the trial ends**. Do not enable paid usage or automatic top-ups. This preference can stop the API before the December judging period even when promotional credit remains; credit-only service through judging is an unresolved release requirement.

## Architecture and privacy

- **Web:** React/Vinext, English and Traditional Chinese, explicit review/apply/submit stages.
- **Backend:** dedicated Allvailable Supabase project with authentication, owner-scoped imports and versioned coordination operations. Use `scripts/supabase-allvailable.sh` for its independent CLI credentials.
- **AI:** `nvidia/nemotron-3-super-120b-a12b` on Nebius Token Factory interprets invitation text and screenshot OCR. `openbmb/MiniCPM-V-4_5` transcribes screenshots. Literal date/title grounding and deterministic follow-up questions keep missing facts reviewable. See [measured live evidence](docs/hackathon/live-evidence-20260930.md).
- **Scheduling:** deterministic half-hour intersection and scoring. Busy intervals round outward; available intervals round inward. Blank space is never inferred to be free.
- **Privacy:** participants cannot see one another's event names, raw images, recordings or private drafts. API keys remain server-side. The local preview uses only synthetic data; it does not validate hosted authorization.

Web audio stays unavailable until a supported transcription endpoint is configured and verified. Existing iOS speech work is documented separately; it does not establish that browser speech works.

## Configure real services

Follow the [hackathon setup guide](docs/hackathon/README.md) and [.env.example](.env.example). Copy the example only when `.env.local` does not already exist; preserve existing credentials. Never commit or paste secret values.

The dedicated backend already has 21 migrations and its calculation function deployed. Do not reapply setup to an unrelated Supabase account. Google sign-in has passed a local round trip. Deployment awaits the scoped Cloudflare authorization; The MIT-licensed source is published at https://github.com/SophieYu04/allvailable-agent.

## Verification and evidence

```sh
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

See [current implementation status](docs/hackathon/implementation-status.md), [local acceptance steps](docs/hackathon/local-acceptance.md), and [acceptance/evidence log](docs/hackathon/acceptance.md). Local fixture tests, hosted synthetic accounts, live inference and physical-device testing are reported separately.

## Release materials

- [Release inventory and pending gates](docs/hackathon/release-readiness.md)
- [English submission draft and 2:45 storyboard](docs/hackathon/submission.md)
- [Devpost field drafts](docs/hackathon/devpost-entry.md)
- [Earlier project setup and broader features](docs/legacy-project-guide.md)
- [Product decisions](docs/product-decisions.md) and [iOS speech/import work](docs/voice-calendar-import.md)

Licensed under [MIT](LICENSE). [Public repository](https://github.com/SophieYu04/allvailable-agent). Public web deployment is awaiting Cloudflare consent.
