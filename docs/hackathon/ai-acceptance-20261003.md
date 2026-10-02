# AI acceptance — October 3, 2026

## What was changed

This release improves prompts, structured-output validation and deterministic grounding. No model weights were fine-tuned, and no training job was run.

- Spoken busy/free/tentative intent is retained. An unfinished time phrase cannot become an Available card.
- A single spoken interval cannot generate invented availability before or after that interval.
- Daily speech expands only through the invitation date range, including overnight duration. Confirmation retains recurrence.
- Today/tomorrow use the Taipei reference date. An undated phrase in a multi-day invitation asks for the date; ambiguous words such as `媒體` do not imply `每天`.
- Calendar-grid times require recognized event blocks and at least two time-axis ticks. High-confidence visual observations provide a validated fallback if the second model returns malformed output; unclear fields require review.
- A voice availability range does not require an invented event title.
- Workers AI Whisper supplies live transcription from finalized WAV microphone prefixes when browser captions are unavailable. Nemotron creates review cards while recording; pending corrections update the same interval. Finish recording verifies the complete audio, and approval writes half-hour cells to the private draft.

## Real hosted inference

Harness: `scripts/verify-hosted-ai-language.mjs`. The script uses a disposable account and synthetic invitation, then deletes them. It does not use personal calendars or publish credentials.

The acceptance run passed **13/13** cases: Chinese busy, Chinese colloquial speech, 24-hour notation, English, overnight, daily, the original `媒體` phrase with unresolved date, tomorrow, mixed Available/Tentative, two synthesized Chinese/English recordings and two calendar-grid reads. The grid reads retained both exact intervals: October 3 09:00–10:30 and October 4 11:00–12:00. Every candidate was unconfirmed; only the undated phrase required a date question. This is a bounded fixture result, not a claim of universal accuracy.

Earlier real tests exposed duplicate cards, invented complementary availability, missing relative dates, lost recurrence and one incorrect calendar-block duration. Those outputs became regression fixtures or dedicated tests; failures are not counted as passing inference. A later repeat returned no event for the undated `媒體` phrase (12/13); explicit single-range reconstruction fixed this, and the focused real-inference retest passed.

## Browser acceptance

Production ImportPanel and AvailabilityEditor were exercised at a 390 × 844 viewport against the deployed Worker. Synthetic speech was routed through a real browser MediaRecorder; browser speech recognition was disabled to test the Whisper fallback. This verifies application capture and inference, not a human microphone or physical Safari device. Recording showed transcript and Busy review cards before stopping; approved 19:00–20:00 filled two red half-hour cells and the real draft endpoint saved them (version 2, independently read back). The synthetic invitation was published before saving, as required by the production lifecycle.

## Code and database checks

187 tests in 40 files, TypeScript and scoped lint passed. Pages and Worker builds passed. Four disposable PostgreSQL suites passed across 23 migrations, including membership privacy, lifecycle/version rules and the 120-request quota boundary with idempotent replay.

## Provider limits and feedback

Nebius billing UI showed **$25.00 promo balance plus $0.97 trial credits**, with 24 days left, before final acceptance. Trial expiry is configured to stop usage. Paid usage and card charging were not enabled. The application-wide inference cap was raised from 30 to 120 requests/day, preserving usage counts and idempotency; per-account AI detection limits remain disabled.

Token Factory structured responses are useful but can still invent complementary intervals. Explicit interval constraints and geometry validation are necessary. Whisper handles Chinese and English synthetic recordings; incomplete encoded audio can drop sentence endings, so streaming now uses finalized WAV prefixes. End-to-end response latency includes transcription, model reasoning and network time; cards are asynchronous rather than word-synchronous.

## Remaining submission gates

Human phone microphone acceptance, consenting friends, a public YouTube demo under three minutes and final Devpost submission remain pending. Trial expiry may stop model service before judging; credit-only continuation must be verified without enabling card billing.

## Extended recurrence and phrasing checks

A further six real inference cases cover Chinese half-hour speech, English `7:15 pm–8:45 pm`, two Busy ranges, negated Busy, every Wednesday/Friday and daily overnight speech. Each has a passing hosted result after repairs. Two additional failures were observed and fixed: explicit PM suffixes after minutes were lost by deterministic clock parsing, and a weekly weekday list was omitted by model output. The application now grounds an explicit bounded weekly list; card headings list actual recurrence dates rather than implying continuous days.

No matching bounded recurrence produces no slots. Daily overnight recurrence retains next-day cells without inventing availability before the first occurrence. The updated suite passes **195 tests in 40 files**, TypeScript, scoped lint and Pages build. Human phone acceptance remains pending; the test question has been sent to the account owner.
