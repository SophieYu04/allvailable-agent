# Live inference and web evidence — September 30, 2026

These are actual provider requests using synthetic inputs. They are distinct from the offline `/preview` demonstration. No friends’ private calendars or credentials are included here.

## Runtime architecture

The browser calls authenticated application endpoints. NVIDIA `nvidia/nemotron-3-super-120b-a12b` runs on `https://api.tokenfactory.nebius.com/v1` to turn English or Chinese invitation descriptions into reviewable conditions. Saving the invitation still requires the host’s action.

Screenshot import uses `openbmb/MiniCPM-V-4_5` for transcription, then Nemotron Super for calendar semantics. Deterministic code grounds explicitly printed date headers and verbatim titles, generates answerable follow-up questions, and requires individual confirmation before producing a versioned grid preview. A separate deterministic scheduler computes group intersections from submitted availability.

## Measured requests

| Case | Model | Prompt / output tokens | Time | Result |
| --- | --- | --- | --- | --- |
| Chinese invitation | Nemotron Super | 296 / 105 | 1,841 ms | Correct name, October 3 date, 18:00–22:00 window, 60 minutes, October 1 noon reply deadline |
| Dated Chinese checklist transcription | MiniCPM-V-4_5 | 409 / 92 | 2,413 ms | All three rows transcribed |
| Checklist interpretation | Nemotron Super | 354 / 453 | 2,451 ms | Three separate review candidates; explicit date retained by grounding; report deadline is a reminder; missing time and timezone remain unknown |

These single-case timings are observations, not latency guarantees or a broad accuracy benchmark. The final two-stage screenshot processing took 4,864 ms of measured provider response time, excluding browser/database overhead.

## User-visible verification

- The normal web homepage—not the synthetic preview—successfully called the real proposal endpoint, populated all invitation fields, saved a draft and launched its six-digit-code invitation.
- A real screenshot upload produced three review cards. In the browser, the report deadline and ticket task were skipped, dinner was explicitly confirmed as October 3, 19:00–20:30 in Asia/Taipei, and the preview contained exactly the 19:00, 19:30 and 20:00 busy cells.
- Existing available cells were unchecked by default in the preview; overwriting them required explicit selection. No image blank was automatically marked available.
- A separate dedicated-backend test created three disposable accounts, joined by code, submitted availability, computed the correct shared hour, rejected cross-account draft reads and nonhost mutations, finalized and reopened the invitation. Fixtures were cleaned afterward.
- Final code checks: 123 tests across 24 files, TypeScript, full repository lint and production build passed. A build scan found neither the Nebius key nor the Supabase server key embedded in any of 212 generated files.

A development-only 390px iframe harness runs the real authenticated app for responsive inspection; it is separate from the synthetic preview and does not replace physical-phone acceptance. The browser review run caught model omissions that required manual correction. The later final model test verifies the added literal date/title grounding. Physical iPhone/Safari and real-friend acceptance have not been performed for this release.

## Actual tool feedback

1. **Model identity matters:** the account’s model-list endpoint returned a Nano identifier with an extra `NVIDIA-` prefix. A configured-looking ID was not sufficient evidence of availability.
2. **Non-thinking output:** `reasoning_effort: none` alone returned an empty visible-content field for the tested Nano request. Explicit `chat_template_kwargs` with `enable_thinking: false` and `force_nonempty_content: true` yielded visible JSON. The application never substitutes hidden reasoning for the final answer.
3. **Validation remains necessary:** Nano returned a non-ISO deadline in one trial and a 3,600-minute duration instead of 60 in another. The application rejected those values; the verified configuration uses Super and deterministic input validation.
4. **Split recognition from scheduling:** asking the small vision model to transcribe and apply the entire scheduling policy produced inconsistent classifications and lost rows. Dedicated OCR followed by Nemotron and literal grounding passed the final three-row fixture.
5. **Provider metadata is not a write instruction:** duplicate source IDs and free-form unresolved notes appeared in structured output. Source identities are reconciled conservatively and questions come from application rules, preventing unanswerable review cards.

## Remaining submission gates

- Public HTTPS deployment and production OAuth verification.
- Public source is available at https://github.com/SophieYu04/allvailable-agent, with MIT license and anonymous access verified. Clean-install build verification is recorded below.
- Public YouTube demonstration under three minutes, with English narration/captions.
- Physical-phone acceptance and participant eligibility confirmation.
- Credit-only API availability through December 15 judging. The account’s stop-after-trial preference protects the no-card-charge requirement but can stop inference before judging; do not enable paid usage to bypass this.

The [official rules](https://nebiusglobalaihackathon.devpost.com/rules) require runtime Nebius usage plus an NVIDIA open model, a working submission, accessible source, demo video and actual tool feedback. This implementation supplies the runtime integration; the remaining access and submission gates still need completion.

## Release reproduction

The public-source snapshot was installed with `npm ci` without the owner’s `.env.local` or hosting metadata. All 123 tests passed and the production build completed after making local Sites metadata optional. The production server returned HTTP 200 for `/` and HTTP 404 for both `/preview` and `/preview/live`. The real authenticated app was also inspected in a 390px iframe: document width and scroll width were both 390px, and the saved 19:00, 19:30 and 20:00 busy cells survived reload. This is responsive browser evidence, not a physical-phone test.
