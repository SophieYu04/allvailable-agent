# Synthetic calendar fixtures

These inputs are invented for reproducible engineering tests. They contain no friend's calendar or recorded voice. They must not be described as real-user acceptance.

- Date: 2026-10-03, timezone Asia/Taipei.
- Busy: 18:00–19:00, 21:00–22:00.
- Empty: 19:00–21:00. This remains unknown unless explicitly marked available by the participant.
- Voice text: 我在二零二六年十月三日，台灣時間晚上七點到九點有空。

Generate local PNG and synthesized Chinese speech with `node scripts/create-hackathon-fixtures.mjs`. Outputs go into ignored `outputs/hackathon-fixtures`. Synthetic speech quality is not evidence of performance on real microphone recordings.
