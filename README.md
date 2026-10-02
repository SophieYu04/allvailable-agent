# Allvailable

**Find a time together. Keep your calendar private.**

Allvailable is a scheduling agent for groups. Describe a plan, review your availability, and find a time everyone can make—without sharing private event titles or calendar screenshots with friends.

[Open app](https://sophieyu04.github.io/allvailable-agent/) · [Setup guide](docs/hackathon/README.md) · [Verified deployment](docs/hackathon/deployment-20261001.md)

## How it works

1. **Plan:** describe a gathering in English or Chinese. Review the AI-generated invitation and share its link or six-digit code.
2. **Review:** choose times, upload a calendar screenshot, or record your availability. Confirm extracted events and fill in missing details.
3. **Meet:** submit availability and compare shared time slots. Unknown or unsubmitted time never counts as free.

## Built with

| Layer | Technology |
| --- | --- |
| Web | React, TypeScript, GitHub Pages |
| API | Cloudflare Workers |
| Auth & data | Supabase Auth and Postgres with row-level security |
| AI | NVIDIA Nemotron Super on Nebius Token Factory; MiniCPM for screenshot transcription |

The models interpret plans, screenshots, and voice availability. Speech uses Cloudflare Whisper, followed by NVIDIA Nemotron on Nebius Token Factory. Deterministic code computes the overlap; users approve changes before submission. Model credentials stay on the server.

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

Built for **Nebius × NVIDIA — Best Apps and Agents**. Real text, screenshot, and voice inference have been verified. See [text and vision evidence](docs/hackathon/live-evidence-20260930.md) and [voice verification](docs/hackathon/voice-evidence-20261002.md). Final submission and video are still in preparation.

[MIT License](LICENSE)
