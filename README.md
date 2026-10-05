# Allvailable

**AI scheduling from screenshots and voice.**

Allvailable helps groups choose a meeting time from real availability. Its AI reads calendar screenshots and voice replies, then turns them into time slots for each person to review. Event details and raw imports are not shared with the group.

[Open app](https://sophieyu04.github.io/allvailable-agent/) · [Setup guide](docs/hackathon/README.md) · [Verified deployment](docs/hackathon/deployment-20261001.md)

## How it works

1. **Invite:** describe a gathering, set the date range, and share its link or six-digit code.
2. **Import:** upload a calendar screenshot, record a voice reply, or enter time ranges directly. Review AI-extracted cards before they change your availability.
3. **Decide:** compare suggested times scored across available and tentative replies. Mark people as **required** when they must attend; they must be explicitly available throughout the final time slot. Unknown or unsubmitted time never counts as available.

## Built with

| Layer | Technology |
| --- | --- |
| Web | React, TypeScript, GitHub Pages |
| API | Cloudflare Workers |
| Auth & data | Supabase Auth and Postgres with row-level security |
| AI | NVIDIA Nemotron Super on Nebius Token Factory; Gemma 3 for visual calendar understanding |

The models interpret plans, screenshots, and voice replies. Deterministic code scores time slots; users approve imported availability before submission. Model credentials stay on the server.

## Run locally

Requires Node.js 22.13+ and npm.

```sh
npm ci
# Create .env.local from .env.example and configure your own services.
npm run dev
```

Open `http://localhost:5173`. For a no-account, no-credit walkthrough, open `/preview` in development. See the [setup guide](docs/hackathon/README.md) for service configuration and [Pages deployment](docs/hackathon/github-pages.md) for hosting.

```sh
npm test
npm run lint
npm run build:pages
```

## Hackathon

Built for **Nebius × NVIDIA — Best Apps and Agents**. Real text, screenshot, and voice inference have been verified. See [October 3 AI acceptance](docs/hackathon/ai-acceptance-20261003.md), [calendar grid recognition](docs/hackathon/calendar-grid-evidence-20261002.md), [live voice cards](docs/hackathon/live-voice-evidence-20261002.md), [text and vision evidence](docs/hackathon/live-evidence-20260930.md) and [voice verification](docs/hackathon/voice-evidence-20261002.md). Final submission and video are still in preparation.

[MIT License](LICENSE)
