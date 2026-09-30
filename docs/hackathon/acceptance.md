# Acceptance and evidence log

## Current status

- Latest local automated checks on September 30: 123 Vitest tests / 24 files, TypeScript, full repository ESLint and production build passed; the local planning-agent demo also passed. Prior September 28 evidence includes repository ESLint and production build, 36 Flutter tests and iOS Simulator build. See `implementation-status.md`.
- Local CUA acceptance: PASS for synthetic review/skip/preview/save, retry, reload, keyboard, all-skip and existing-cell protection in English/Traditional Chinese at desktop and 390px. Production `/preview` returned 404. See `local-acceptance.md`.
- Billing: promotional-credit testing only; **Stop usage after trial** remains selected. No paid plan or top-up was activated. Provider access through December judging remains unresolved.
- Live inference: PASS for natural-language invitation draft and three-row Chinese screenshot processing. Dedicated server-only key configured; exact models and measured results are in [live evidence](live-evidence-20260930.md). Browser audio is not configured.
- Dedicated backend: PASS for synthetic three-account flow, rerun 2026-09-30; 21 migrations and calculation function deployed, temporary fixtures cleaned. Public web demo: pending Cloudflare CLI authorization.
- Safari/Chrome real-device multi-user acceptance: NOT RUN.
- Public MIT source: https://github.com/SophieYu04/allvailable-agent (anonymous access verified). Video and Devpost submission are pending.

## Three-person case (execute with real accounts)

Create an invitation for October 3–4, 2026, 18:00–22:00, 60-minute duration, deadline before the first candidate. Adjust dates if running later.

| Person | Input | Confirmed availability |
| --- | --- | --- |
| A | Real calendar screenshot; confirm extracted busy cells, then explicitly fill remaining blanks | Oct 3 19:00–21:00 |
| B | Chinese voice with full year/date and Taipei timezone | Oct 3 19:30–21:00 |
| C | Screenshot followed by voice; apply both drafts before submitting | Oct 3 20:00–21:00 |

Expected common interval: Oct 3 20:00–21:00. Before C submits, no candidate may be labelled everyone available. Change C to busy for one intersecting half-hour; no one-hour common interval remains. Verify the original ranking of compromise candidates stays unchanged and the UI calls them coordination candidates.

## Dated task-list agent case (synthetic, then repeat with consented real input)

Run `node scripts/create-hackathon-fixtures.mjs`, then use `outputs/hackathon-fixtures/dated-tasks.png`. Its expected actions and grid cells are in `outputs/hackathon-fixtures/dated-tasks.truth.json`; all generated files are synthetic and ignored by Git.

### Human model-quality scorecard

Use this after the actual app has made a live Token Factory request. The connectivity smoke script alone does not pass this evaluation. Record the selected model, app version/commit, endpoint origin, latency, and each pass/fail result without copying private request bodies or credentials into the public log.

| Check | Expected evidence | Fail if |
| --- | --- | --- |
| Row extraction | Exactly three separate cards with the fixture's three titles; all refer to 2026-10-03 | A row is lost, merged, duplicated, or assigned another date |
| Report deadline | Deadline stays a reminder/non-scheduled item and can be skipped | It is added as busy, tentative, or free time without the user choosing that action |
| Dinner | Date is retained, missing start/end remains unresolved, and the row is uncertain until the user supplies a time | Any exact time, duration, or timezone is invented |
| Train ticket | Its own card remains independently skippable | It is silently merged with dinner or written to the grid |
| Human confirmation | No grid change before confirming the dinner card; confirmation survives a reload in the private import draft | Model output alone authorizes a write or the server accepts an unconfirmed row |
| Deterministic write | After both skips and explicit dinner confirmation, only `2026-10-03-19:00`, `2026-10-03-19:30`, and `2026-10-03-20:00` become busy | Any other cell changes, or skipped/unconfirmed item changes a cell |

Repeat the same case at 390px in English and Traditional Chinese. Keep only aggregate outcomes and anonymized correction notes in the public log; raw images and voice recordings remain local.

1. Upload the image. Require three separate private review cards: `交研究報告`, `和 Maya 吃晚餐`, and `買火車票`. The date is October 3, 2026. No missing start/end time may be populated from model guesses.
2. Skip `交研究報告` because it is a deadline, then skip `買火車票`. Neither may change any availability cell or appear in the shared result. Confirm that skipping one card does not dismiss the next card.
3. On the dinner card, on iOS answer by voice: `晚餐從晚上七點到八點半，台灣時間。` Review the transcript and exact parsed values, then explicitly confirm. On Web, use the text field unless a verified audio endpoint is configured. The preview may mark only `2026-10-03-19:00`, `2026-10-03-19:30`, and `2026-10-03-20:00` busy. It must not claim those intervals are free.
4. Before confirmation, after skipping all items, and after cancelling the preview, verify that no unconfirmed row writes to the grid. Test an unknown date and an unknown timezone; each must block confirmation until resolved or skipped.
5. Repeat at 390px in English and Traditional Chinese. Verify keyboard focus, Web's text fallback, iOS microphone denial fallback, retry/data retention and that event names/raw image never appear in another participant's view.

The synthetic fixture tests extraction and review behavior only. It is not evidence of real Nebius model accuracy; record exact endpoint/model, latency, errors and human review in the live model log below.

## Failure and privacy checks

1. Missing year, ambiguous date/timezone and all-day events produce clarification; reminders stay nonblocking, uncertain slots stay unknown. Incomplete screenshots do not fill blanks. Confirm inward rounding for partial available intervals and outward rounding for busy intervals.
2. Deny microphone access; retry a failed upload without reselecting media. Force provider timeout and check errors preserve data. Cancel recording by navigating away; microphone must stop. Check iOS Safari MP4 and Chrome WebM.
3. Submit twice and retry after losing the response. Edit on another device and verify stale draft/preview is rejected. Review expiry produces an error and allows generating a fresh preview.
4. B must not GET A's private import or apply A's preview. A nonmember must not read a draft or import into the invitation. Shared recommendations must not contain event titles, images or transcripts.
5. Run each key page in Chinese and English at 390px and desktop width. Check keyboard focus, loading states, scroll, no horizontal overflow and input retention after errors.

## Real model log (fill after execution)

| Modality | Endpoint origin | Exact model/version | Fixture consent/reference | Status / latency | Human accuracy review |
| --- | --- | --- | --- | --- | --- |
| Text/Nemotron | https://api.tokenfactory.nebius.com | nvidia/nemotron-3-super-120b-a12b | Synthetic Chinese invitation | HTTP 200 / 1,841 ms | Exact name, dates, window, 60-minute duration, reply deadline; also verified through the web form |
| Chinese screenshot | https://api.tokenfactory.nebius.com | openbmb/MiniCPM-V-4_5 → nvidia/nemotron-3-super-120b-a12b | Generated dated-tasks.png | HTTP 200 each / 2,413 + 2,451 ms | Three separate rows; grounded explicit date; reminder detected; missing times/timezone remain null |
| Chinese voice | Not configured | None selected | None | Not run | Web exposes typed correction instead |

Never replace these entries with simulated timings. Never commit raw friends' calendars, voice recordings, transcripts, API keys or request bodies.
