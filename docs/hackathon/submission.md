# Submission draft — requires live demo evidence

## Project description

**Allvailable: find a time together.**

Organizing a group should not mean comparing screenshots in a chat thread. Allvailable gives every friend a private link-based flow: share a link, add availability, review the result, then submit. Screenshot import also turns each row in a dated day plan into a private review card. The user can provide an exact time by voice or skip a deadline; a skipped row never reaches the availability grid.

The agent asks for missing information instead of inventing dates. A deterministic scheduling engine evaluates half-hour intervals; AI extraction cannot infer free time from blank space, and unknown slots and missing replies remain explicit. Event names and original calendar inputs stay private to their owner.

**Model evidence:** live Nemotron invitation parsing and the three-row Chinese screenshot fixture are verified in [live evidence](live-evidence-20260930.md). The web demo uses typed corrections; do not claim browser speech. Public deployment, physical-device acceptance and the final recording remain pending.

Track: Best Apps and Agents.

## Recording readiness

The local `/preview` route can rehearse the review/skip/preview sequence without credits. Keep its synthetic/no-AI label visible. It must not stand in for the final working deployed product or live model footage.

Before recording the final 2:45 cut, replace rehearsal footage with actual operation. The 0:45–1:50 import sequence requires a verified image model; spoken correction requires verified speech on the demonstrated device (otherwise use typed correction and say so). The 1:50–2:15 result scene requires real multi-user acceptance. The final model/latency scene requires measured runtime evidence. Do not invent logs or fill placeholders from mock runs.

## English video script (target 2:45)

Devpost requires a public YouTube demo under 3 minutes with the project working on its intended device and audio explaining Nebius Token Factory and the NVIDIA open-source model. The explicit one-minute working-modules clause is for Physical AI submissions; this app keeps a continuous 1:05 module walkthrough as a strong demonstration choice. A configured model or synthetic-only response is not live-use evidence.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Home, create invitation | “We want to spend time together, but our calendars live in different apps. This is Allvailable: a private way to find a time everyone can make.” |
| 0:20–0:45 | Set range, duration, share link | “The host sets the boundaries and shares one link. Friends can reply from a phone browser without installing an app.” |
| 0:45–1:50 | **Continuous 1:05 live module demo.** Upload the dated Chinese day-plan fixture. Show its three separate cards. Skip the report deadline and train-ticket task. On the dinner card, provide the exact time in Chinese by voice on a tested device or type it on Web; review the transcript/answer and exact values. Confirm. Show deterministic half-hour preview and explicit submit. | “Each row becomes a private review card. A deadline can be skipped. When a plan has no time, the agent asks; it never invents one. The correction stays a proposal until confirmed. Deterministic code checks half-hour availability; only submitted data enters the calculation.” |
| 1:50–2:15 | Result then one conflict | “Here is a time all three people confirmed. If someone is unknown or busy, we say so. A compromise never appears as everyone available.” |
| 2:15–2:45 | Architecture + actual model/latency log | “NVIDIA Nemotron runs on Nebius Token Factory to interpret language. Token Factory vision transcribes the screenshot, Nemotron interprets it, and the user supplies missing details. Deterministic code checks time intersections, while versioned previews keep users in control. Our measured results are shown here.” |

Record actual operation and actual metrics; replace any step that cannot be demonstrated with an honest limitation. Keep under 3 minutes; English narration/captions; public YouTube URL.

## Tools feedback template

After live use, record one reproducible observation per topic: onboarding time to first response, model/API compatibility with the structured schema, Chinese temporal expressions, latency/retries, and model availability. For Token Factory, note which app-building step it accelerated and the evidence for that observation; for Nebius AI Cloud or NVIDIA tools, give feedback only if actually used. Include endpoint/model, date, anonymized repro and measured result. Do not claim satisfaction, speed or reliability before testing.

## Ownership and roadmap

| Gate | Codex | Sophie | Exit |
| --- | --- | --- | --- |
| Configuration | Endpoint plumbing, evidence script, missing-config handling | Token Factory account/credits, dedicated backend configuration, consented three-person fixtures, Devpost registration | Real responses, exact models fixed |
| Product | Bilingual web UI, review/apply/submit, deterministic labels | Phone usability feedback | Three friends can submit via links |
| Acceptance | Regression tests and fixes; deploy once the dedicated environment exists | Two friends for real test; check recognized details | Hosted multi-user acceptance passes |
| Submission | README, architecture, evidence format, English script | Record/narrate, upload video, verify public repo/license, submit Devpost | All judging links accessible by Oct 28 |

Paste-ready, evidence-gated fields are in [devpost-entry.md](devpost-entry.md).
