# Import latency — October 4, 2026

Implemented:
- Microphone PCM is transcribed in disjoint segments at pauses (minimum 1.5 seconds) or an 8-second bound. Finish submits only the unsent tail. Failed segments stay queued for retry; cancellation prevents late writes.
- Live language extraction uses appended transcript text. Context-dependent fragments and revisions retain full context. Review and confirmation remain required.
- A narrow, validated parser handles explicit Chinese and supported English dates, time windows and status without language-model inference. Ambiguous phrases, exceptions and unsupported forms retain the Nemotron path.
- Screenshot preprocessing uses lossless PNG only when smaller. Long images retain at least their original short edge or 768 pixels to protect clock/header legibility. Screenshots are processed individually; reviewing one advances to the next selected image.
- Complete, high-confidence calendar vision observations pass schema and grounding checks before skipping the second model call. Missing or ambiguous geometry/time/date retains the interpretation path.

Hosted synthetic acceptance, measured API round trips:

| Request | Result | Milliseconds |
|---|---|---:|
| Explicit tomorrow window | 200, one unconfirmed card | 1477 |
| Appended day-after-tomorrow window | 200, two retained cards | 1061 |
| Card confirmation | 200 | — |
| Chinese calendar fixture | 200, review cards | 8498 |
| Speech transcription fixture | 200, nonempty transcript | — |

Disposable account and its imports were removed. These measurements are individual request observations, not phone microphone end-to-end timings or a controlled before/after benchmark. They do not establish that every image or recording will be faster. No paid service or credit-card billing was enabled.
