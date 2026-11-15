# Allvailable

Allvailable helps a group agree on a meeting time without sharing everyone's calendar details. Participants enter availability directly or review time slots extracted from screenshots and voice replies before submitting them.

[Open the app](https://sophieyu04.github.io/allvailable-agent/) · [Setup guide](docs/hackathon/README.md) · [MIT license](LICENSE)

## How it works

1. An organizer creates an event with a date range and shares its link or six-digit code.
2. Participants enter available or tentative times. Screenshot and voice imports produce editable cards; each person confirms them before they affect availability.
3. The app scores candidate times. A person marked required must be explicitly available for the entire selected slot; unknown time is not treated as available.

The final scheduling decision uses deterministic code after participants confirm their inputs. AI interprets text, screenshots, and voice. Raw imports and event details are kept out of the shared availability view.

## Architecture

| Layer | Implementation |
| --- | --- |
| Web | React and TypeScript; a static build is published to GitHub Pages. |
| API | Cloudflare Workers. |
| Identity and data | Supabase Auth and Postgres with row-level security. |
| Interpretation | NVIDIA Nemotron on Nebius Token Factory and a vision model for calendar images. |

The repository includes the web app, API code, database migrations, tests, and deployment documentation. Model credentials are configured on the server, not bundled into the Pages build.

## Run locally

Requires Node.js 22.13+ and npm. Service-backed flows need your own environment configuration; see [the setup guide](docs/hackathon/README.md) and [`.env.example`](.env.example).

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The development `/preview` route provides a walkthrough without an account or model credits.

```sh
npm test
npm run lint
npm run build:pages
```

The [deployment guide](docs/hackathon/github-pages.md), [hosted deployment record](docs/hackathon/deployment-20261001.md), and [AI acceptance record](docs/hackathon/ai-acceptance-20261003.md) document the tested flows.

## Limits

Screenshot and voice extraction can be wrong, so participants must review imported cards. Service-backed AI flows require configured providers and may differ from the no-account preview. Evidence documents describe specific tested runs, not a guarantee of continuous service availability.
