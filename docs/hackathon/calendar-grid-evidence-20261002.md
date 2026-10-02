# Calendar grid recognition — October 2, 2026

The screenshot path now uses Gemma 3 27B on Nebius Token Factory for visual date/title/axis association, followed by NVIDIA Nemotron Super for structured calendar interpretation. Browser-measured event rectangles and grid lines anchor clock interpolation, so event durations do not depend on OCR text inside the event. Ambiguous or clipped edges remain unresolved.

A synthetic Google Calendar-style two-column screenshot contains an October 2026 header, day numbers, an hourly vertical axis, and colored event rectangles with titles only. Neither event contains a printed time range.

| Event | Expected and returned card |
| --- | --- |
| Design review | 10/03 09:00–10:30 · Busy |
| Dentist | 10/04 11:00–12:00 · Busy |

The hosted API returned HTTP 200 in 15,009 ms with both exact intervals, Asia/Taipei, no clarification questions, and neither event pre-confirmed. The disposable synthetic account was removed. This is one fixture, not a general accuracy benchmark or a test of the user's original screenshot.

Browser verification replayed that actual model output through the production review component: Busy added exactly the 09:00, 09:30 and 10:00 red cells; Skip left the second interval unmarked. Cards expose Busy/Skip only. Missing date/time controls appear only for unresolved fields. The previous live-voice helper text is removed.

Validation: 151 tests across 34 files; TypeScript and ESLint. Regression cases include half-hour and quarter-hour edge interpolation, unreadable edges, text interruptions inside a colored block, missing date/time, and preserving already confirmed cards. Existing quota caps and free deployment settings remain in place.

Repeat the hosted check with a synthetic image and its browser-measured geometry JSON:

```sh
ALLVAILABLE_TEST_ORIGIN=https://allvailable-hackathon.sakurajade4869.workers.dev node scripts/verify-hosted-calendar-grid.mjs /path/to/synthetic-calendar.jpg /path/to/geometry.json
```

The script requires local private test credentials; it never prints them. Historical MiniCPM OCR evidence documents earlier behavior, rather than this visual-grid implementation.
