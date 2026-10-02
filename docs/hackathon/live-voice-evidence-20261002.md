# Live voice cards — October 2, 2026

The web client displays interim browser speech recognition captions. Once a phrase is finalized, a 1.2-second debounce sends the accumulated transcript to NVIDIA Nemotron on Nebius Token Factory while MediaRecorder remains active. Card confirmation, editing, and skipping work during recording; only explicit confirmation writes local timetable draft cells. Recording finish flushes the latest words and closes the inference session.

Live captions depend on browser SpeechRecognition support and permission. When unavailable, the recorded-audio Whisper → Nemotron flow remains available after explicit recording confirmation. Physical-device microphone behavior has not been verified in this run.

## Real hosted model acceptance

`scripts/verify-hosted-live-voice.mjs` used a disposable synthetic account and two small model calls, without creating a public gathering or transmitting user audio:

- First explicit Chinese phrase: unconfirmed October 3, 2026, 19:00–21:00, Asia/Taipei, available.
- Human confirmation persisted; the second phrase produced an unconfirmed October 4, 18:00–19:00 tentative card. The second inference request completed in 4,019 ms.
- The approved first card was retained and did not duplicate.
- Repeating the same transcript kept its version and did not call the model again.
- Explicit finish closed the session; further transcript requests returned HTTP 410.
- The disposable account was signed out and deleted.

## Browser interaction acceptance

The production ImportPanel and AvailabilityEditor were tested with simulated microphone/speech and a local transport using the same edit/merge logic. While the UI displayed Listening, right-swiping the first card added four green half-hour cells. A second spoken phrase then produced a tentative card without stopping recording. The finish control stopped recording; session closure is additionally covered by client tests and hosted acceptance. This is UI evidence, not a physical microphone or real-model browser recording claim.

## Credit safeguards

The account was verified as $25.00 account balance plus $0.99 trial credit on October 2. Stop usage after trial remained selected. No paid usage, card top-up, or paid Cloudflare plan was enabled. Each live session allows at most eight inference calls over three minutes; every inference also consumes the existing authenticated daily user/global quota. Duplicate transcripts are skipped, requests are serialized, cancellation ignores late responses, and input length is bounded. Aborting a browser request cannot guarantee cancellation of an inference already executing at the provider.
