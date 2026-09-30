# Devpost entry draft

Paste the public-facing copy only after replacing every bracketed evidence field. Do not submit the bracketed values or claim an unverified model, URL, or result.

## Project name

Allvailable

## Tagline

Find a time together, without sharing your calendar.

## Track

Best Apps and Agents

## Project description

Groups should not have to compare private calendar screenshots in a chat. Allvailable gives a host one invitation link and a six-digit join code. Each friend privately confirms availability on a half-hour grid, then submits it to a deterministic scheduler that finds overlapping times. Empty or unanswered cells are never treated as free, and recommendations do not expose event names or source images.

Friends can also import a calendar or a dated task-list screenshot. The agent presents recognized rows as individual review cards, asks for missing dates, exact times, time zones, or event names, and lets the user skip deadlines and reminders. A spoken or typed correction stays a proposal until the user reviews and confirms it. Only explicitly confirmed intervals are written to the grid; empty cells remain unknown. The scheduler, not the language model, calculates group availability.

Allvailable grew from an existing event-planning project. During the hackathon, the work added a private link-and-code coordination flow, mobile-first bilingual availability submission, screenshot-to-review-card extraction, explicit clarification and skip controls, deterministic half-hour recommendations, and privacy and lifecycle protections. The live model and demo evidence below documents the exact tested release.

## How Nebius and NVIDIA are used

The server calls Nebius Token Factory at runtime. **NVIDIA open model:** `nvidia/nemotron-3-super-120b-a12b`. It prepares invitation drafts from natural language and interprets screenshot text. Screenshot transcription uses `openbmb/MiniCPM-V-4_5`, followed by Nemotron and deterministic grounding of literal date headers and titles. On iOS, the system Speech framework turns a spoken correction into text before the server-side model parses it; the Web flow uses typed corrections unless a separately tested transcription provider is enabled. We validate structured output, keep missing facts unresolved, and require human confirmation before any availability write. The deterministic TypeScript and SQL scheduler computes candidate overlaps from submitted half-hour cells. Only explicitly confirmed intervals are written; unmarked blanks remain unknown.

**Measured evidence (September 30, 2026):** Token Factory at `https://api.tokenfactory.nebius.com/v1`; Nemotron invitation parsing completed in 1,841 ms. The final three-row Chinese screenshot fixture took 2,413 ms for vision transcription and 2,451 ms for Nemotron interpretation. All three titles and the explicit date were retained; unprovided times and timezone stayed unresolved. See `docs/hackathon/live-evidence-20260930.md`.

**Token Factory workflow evidence:** We tested Nano and Super through the same hosted endpoint without provisioning a GPU. Nano produced a wrong duration and an incompatible date format in early trials, so the app now uses Super plus deterministic validation. Small vision-model scheduling output was inconsistent; splitting transcription from Nemotron interpretation fixed the tested three-row case. Non-thinking Nemotron requests required explicit chat-template controls to obtain visible content. The feedback log includes these reproducible integration findings.

## Links

- Working demo: **Pending public deployment and hosted acceptance**
- Public source repository: **Pending publication; CLI authenticated**
- Public YouTube demo (under 3 minutes): **Pending recording and upload**
- Open-source license: MIT (`LICENSE` at repository root)
- Nebius/NVIDIA tool feedback: **Complete after real use; add reproducible observations and measurements**

## Pre-submit evidence gate

- [x] Runtime request to Nebius Token Factory captured in the sanitized evidence log.
- [x] At least one NVIDIA open-source model used in that working project; exact model ID is in the README and this entry.
- [ ] Every described AI capability appears in the public demo and has been human-reviewed.
- [ ] Working public demo URL; three real participants can join and complete the phone flow.
- [ ] Public repository opens without authentication and shows the MIT license at the root; README setup works from a clean checkout.
- [ ] Public YouTube video is under three minutes, shows the project working on its intended device, and includes audio explaining Token Factory and the NVIDIA model. The continuous 1:05 module walkthrough in `submission.md` is a deliberate evidence choice; the explicit one-minute clause applies to the Physical AI track.
- [ ] Tool feedback is based on actual use, not a template or assumption.
- [ ] The explanation of significant hackathon-period changes matches the retained baseline and verified Git history.
- [ ] All links work in a signed-out browser; no API keys, personal calendars, raw screenshots, or transcripts are public.

## Local rehearsal evidence (not live inference)

A development-only interactive fixture exercises the same review cards used by the app. It verifies skip, explicit confirmation, deterministic preview, local recovery and simulated request failures without model credits. This establishes review behavior only. Replace pending model, deployment and device evidence with measured results before submission.
