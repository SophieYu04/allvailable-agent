# GitHub Pages deployment

The React frontend is a static build at `https://sophieyu04.github.io/allvailable-agent/`. Hash routes keep invitation links and page reloads working under the repository path. The API runs separately on Cloudflare Workers; GitHub Pages cannot execute server routes.

## Public build configuration

Set these GitHub repository **Actions variables**, then run the Publish GitHub Pages workflow:

- `NEXT_PUBLIC_API_ORIGIN`: HTTPS Worker origin, without a path.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public browser key, never the service-role key.

Enable Pages with **GitHub Actions** as the source. `npm run build:pages` writes `dist-pages/`; `npm run preview:pages` previews that build. No provider credentials belong in the frontend or Actions variables.

## Backend and authentication

Set the Worker's `PAGES_ORIGIN` to `https://sophieyu04.github.io`. CORS accepts only that exact origin and requires a user bearer token for cross-origin API requests. Existing same-origin and native clients remain supported.

Add `https://sophieyu04.github.io/allvailable-agent/` to Supabase Auth's redirect allowlist. The frontend uses PKCE, exchanges the one-use code in the same browser, and sends the user's Supabase token to the API. Shared links include the repository path and hash route.

The Worker stores Nebius and Supabase service credentials as private runtime settings. Use only the Workers Free plan, keep Nebius's stop-after-trial preference, and do not enable paid usage or automatic top-ups.

## Release checks

Verify the public home page, direct invitation links, Google sign-in and sign-out, authenticated API requests, and one end-to-end scheduling flow. Confirm untrusted origins are rejected and generated static files contain no private keys. Check provider access through the hackathon judging period separately.
