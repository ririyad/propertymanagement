# Property Ledger

An offline-first, installable web app (PWA) that records the expenses and earnings of jointly
owned buildings and shows each owner's share. The full design and development plan is in
[CLAUDE.md](CLAUDE.md) (also called AGENT.md); read it before changing anything.

## Local setup

Requires Node.js 22 LTS (see `.nvmrc`) and Git. No Android Studio.

```sh
npm install
npx playwright install chromium   # once, for the end-to-end tests
npm run dev                       # http://localhost:5173
```

Use Chrome DevTools device mode (Pixel 7, 360 × 780 design width) for a phone-sized view.

| Script              | Does                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Development server. The service worker is off in development.           |
| `npm run build`     | Production build into `dist/`, including the service worker.            |
| `npm run preview`   | Serves `dist/` with the production Content Security Policy.             |
| `npm run lint`      | ESLint (including the money and domain guards) and Prettier.            |
| `npm run typecheck` | TypeScript for the app, the DOM-free domain, the service worker, tools. |
| `npm run test`      | Vitest unit, data and component tests.                                  |
| `npm run e2e`       | Playwright on a Pixel 7 viewport against a production build.            |
| `npm run check`     | lint + typecheck + test + build. Must pass before every merge.          |
| `npm run format`    | Formats everything with Prettier.                                       |
| `npm run icons`     | Regenerates the app icons from `scripts/generate-icons.mjs`.            |

## Deployment (Cloudflare Pages)

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run check` and `npm run e2e` on every pull
request and push to `main`. When both pass it deploys: a preview link for each pull request, and
production for `main`. Until the secrets below exist, the deploy job only prints a warning.

One-time setup:

1. In the Cloudflare dashboard, create a Pages project named `property-ledger` using
   **Direct Upload** (not Git integration), with production branch `main`.
2. Create an API token with the **Cloudflare Pages: Edit** permission (Phase 4 adds Workers).
3. In the GitHub repository, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
   (Settings → Secrets and variables → Actions).
4. Push to `main`. The app is served at `https://property-ledger.pages.dev`.

## Install on the phone

Open the Pages URL in Chrome on Android and choose **Install app** (or **Add to home screen**).
After the first load the app opens without network, including in airplane mode.
