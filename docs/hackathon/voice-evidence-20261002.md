# Live voice verification — October 2, 2026

Browser recordings now run through Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`, then NVIDIA `nvidia/nemotron-3-super-120b-a12b` on Nebius Token Factory. Whisper transcribes; Nemotron interprets availability. The group overlap calculation remains deterministic. Users review each event before adding it to a draft and submit separately.

This satisfies the model/platform integration requirements for the Best Apps and Agents track: a runtime Nebius call plus an NVIDIA open model. It is not a claim that the entire hackathon submission is complete. [Official rules](https://nebiusglobalaihackathon.devpost.com/rules).

## Real hosted results

A locally synthesized 9.24-second Mandarin recording said: “我在二零二六年十月三日，晚上七點到晚上九點有空，可以參加晚餐。時區是台北。” No microphone or personal audio was used.

- WAV: HTTP 200, ready, 7,505 ms across the authenticated import endpoint and both real models.
- MP4/AAC: HTTP 200, ready, 6,401 ms; passed the same field assertions.
- Correct result: dinner, October 3, 2026, 19:00–21:00, Asia/Taipei, available, `userConfirmed: false`.
- Whisper's transcript contained “时区市台北”; the final model still interpreted the timezone correctly. The transcript is visible in a collapsed review disclosure.
- Initial attempts failed date schema validation or returned no events. Explicit date-format instructions and Nemotron's non-thinking structured extraction mode fixed the tested case. This is a measured fixture result, not a guarantee of all speech accuracy.
- Temporary synthetic accounts were removed after each run. No public gathering was created.
- 138 unit tests passed; TypeScript, Worker build and Pages build passed.

## Billing and limits

The dashboard showed Workers **Free / $0 / Current plan** before deployment. No plan upgrade, card charge or payment authorization was made. Workers AI Free includes 10,000 neurons/day and rejects excess usage; [official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). The existing authenticated import quotas remain in force. Nebius uses the existing credit-only setup.

Set `CLOUDFLARE_AUDIO_ENABLED=true` in the private deployment environment to bind Workers AI. It needs no additional audio API key. Existing independently configured transcription providers remain an opt-in alternative. The runtime flag and binding are both required to expose recording.

Reproduce using a consented synthetic WAV or M4A file:

```sh
ALLVAILABLE_TEST_ORIGIN=https://allvailable-hackathon.sakurajade4869.workers.dev \
  node scripts/verify-hosted-voice.mjs /absolute/path/to/synthetic.wav
```

This script uses the dedicated project's server credentials locally, creates one disposable test account, validates the exact fixture above, and cleans it up. It performs real inference. It does not test a physical phone's microphone, Safari permissions, or real-friend usability.
