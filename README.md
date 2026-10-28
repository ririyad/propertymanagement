# Property Ledger

An offline-first, installable web app (PWA) that records the expenses and earnings of jointly
owned buildings and shows each owner's share. The full design and development plan is in
[CLAUDE.md](CLAUDE.md) (also called AGENT.md); read it before changing anything.

## Progress

Phases follow CLAUDE.md section 15. Update this table when a phase's status changes.

| Phase                                     | Goal                                                                      | Status                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0. Foundation                             | A deployed, installable app shell and proven money maths                  | Code complete (P0-T01 to P0-T10), plus the TypeScript 7 upgrade. Two acceptance checks remain (below). |
| 1. Expense ledger                         | Record a full month of expenses for both buildings and each owner's share | Code complete (P1-T01 to P1-T13). Acceptance checks on the phone remain (below).                       |
| 2. Earnings and rent                      | Rent charges, payments, credits, dues and who earned what                 | Not started                                                                                            |
| 3. Dashboard and reports                  | The month at a glance, and PDF, Excel and CSV statements for co-owners    | Not started                                                                                            |
| 4. Automatic backup, push reminders, lock | Google Drive backup, phone notifications and a PIN app lock               | Not started                                                                                            |
| 5. Inheritance helper and share history   | Faraid share proposals and a share history timeline                       | Not started                                                                                            |
| 6. Polish and growth                      | Bangla, co-owner view, multi-device sync (chosen per item)                | Not started                                                                                            |

Phase 0 acceptance criteria:

| Criterion                                                           | Status                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CI is green on `main` and the app is live on Cloudflare Pages       | Pending: needs the Cloudflare project and secrets (see Deployment)      |
| All 17.1 and 17.2 test vectors pass as unit tests                   | Done                                                                    |
| The app installs on the phone and opens in airplane mode            | Pending: check on the phone (the automated offline test already passes) |
| Lint fails on `parseFloat` or `toFixed` in domain, data or services | Done (`tests/lint/guards.test.ts`)                                      |

Phase 1 acceptance criteria:

| Criterion                                                                                                                     | Status                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| One real month for both buildings, all 10 meters and all recurring costs, with each owner's total matching a hand calculation | Pending: Emon on the phone                                                       |
| A new share set from next month leaves this month's allocations unchanged                                                     | Automated (`src/services/expenses.test.ts`); confirm on the phone                |
| A routine expense takes under 15 seconds to enter on the phone                                                                | Pending: Emon on the phone                                                       |
| Everything works in airplane mode and survives closing and reopening the app                                                  | Pending: check on the phone                                                      |
| Backdated entry for a past month works (D17)                                                                                  | Automated (expense editor, readings and confirm e2e tests); confirm on the phone |
| A backup file restores into a fresh Chrome profile with identical totals                                                      | Automated (`tests/e2e/backup.spec.ts`); confirm on the phone                     |

## Local setup

Requires Node.js 22 LTS (see `.nvmrc`) and Git. No Android Studio.

```sh
npm install
npx playwright install chromium   # once, for the end-to-end tests
npm run dev                       # http://localhost:5173
```

Use Chrome DevTools device mode (Pixel 7, 360 × 780 design width) for a phone-sized view.

TypeScript is installed twice (decision D33 in CLAUDE.md): `tsc` is TypeScript 7, the native
compiler that type-checks the project, and the `typescript` package is the TypeScript 6
compatibility API that typescript-eslint needs. In VS Code, install the "TypeScript (Native
Preview)" extension to get TypeScript 7 in the editor; otherwise the editor uses TypeScript 6.

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

Only GitHub Actions deploys, so a push that fails its tests never goes live (decision D48 in
CLAUDE.md). One-time setup:

1. The Cloudflare Pages project is `property-ledger`, with production branch `main`. It is
   connected to this GitHub repository, so turn Cloudflare's own builds off: Workers & Pages →
   `property-ledger` → Settings → Builds → Branch control, untick **Enable automatic production
   branch deployments**, set **Preview branch** to **None**, and save. (For a new setup, a
   **Direct Upload** project needs no such step.)
2. Create an API token (My Profile → API Tokens → Create Token → Custom token) with the permission
   **Account → Cloudflare Pages → Edit** (Phase 4 adds Workers). Copy the account ID from the
   Workers & Pages overview.
3. In the GitHub repository, add two secrets (Settings → Secrets and variables → Actions → New
   repository secret), each holding only its value: `CLOUDFLARE_API_TOKEN` (the token) and
   `CLOUDFLARE_ACCOUNT_ID` (the account ID).
4. Push to `main`, or re-run the latest CI run. The deploy job's summary shows the deployment URL,
   and the app is served at `https://property-ledger.pages.dev`.

## Install on the phone

Open the Pages URL in Chrome on Android and choose **Install app** (or **Add to home screen**).
After the first load the app opens without network, including in airplane mode.
