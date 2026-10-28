# Property Ledger: Design and Iterative Development Plan (AGENT.md)

Version 2.2 · 27 October 2026 · Product owner: Emon

This document is the single source of truth for building **Property Ledger**, an offline-first, installable web app (PWA) that records the expenses and earnings of jointly owned buildings and shows each owner's share. It runs in Chrome on Android, is added to the home screen like an app, and needs no Android Studio or app store. A small free companion worker on Cloudflare sends native-style push reminders and keeps Google sign-in alive, so backups run automatically in the background. It is written for AI coding agents and human developers alike: read it fully before starting any task.

Version 2.0 replaced the native Android (Kotlin) plan of version 1.0. Version 2.1 added push notifications and automatic background backup through the companion worker (sections 11, 12 and 12.9). Version 2.2 moves hosting from GitHub Pages to Cloudflare Pages (D21). The product rules (sections 1, 3, 7, 8, 10, 17) are unchanged.

## 0. How to use this document

### 0.1 Reading order for an agent

1. Read sections 0 to 7 once, completely, before writing any code.
2. For a task, read its phase in section 15, then every section the task references.
3. Domain rules (section 8) are exact. Implement them literally, with the worked examples in section 17 as unit tests.

### 0.2 Agent rules (non-negotiable)

1. **Money is never a floating-point value.** Money is an integer count of poisha (1 BDT = 100 poisha) in the branded type `Poisha`. Every value must pass `Number.isSafeInteger`. Never use `parseFloat`, `toFixed`, `Math.round` on money, or `*` and `/` on money outside `src/domain/money.ts` and `src/domain/split.ts`. Parse user input with `parseTaka(text)`.
2. **Percentages are basis points** (`Bp`, integer, 10000 = 100%). Never store shares as decimals.
3. All calculation logic (splits, tariffs, rent ledger, balances, inheritance, reports) lives in `src/domain/` as pure TypeScript: no React, no Dexie, no DOM, no `Date.now()` (pass `today` in). ESLint `no-restricted-imports` enforces this.
4. Every allocation must sum exactly to the amount it splits. Enforce it with an assertion in the engine and with tests.
5. Never hard-delete user data. Set `deletedAt`. All reads exclude soft-deleted rows unless stated.
6. Stored allocations of past records are never recomputed because shares changed. An allocation is recomputed only when its own record is edited.
7. All user-facing text goes through i18next (`src/i18n/en.json`). No hardcoded strings in components (Bangla comes later).
8. A "month" is always determined in the `Asia/Dhaka` time zone.
9. Work one phase at a time, in order. Do not build features from a later phase early.
10. Each task ends with `npm run check` passing (lint, typecheck, unit tests, build), plus Playwright tests for any new user flow.
11. Do not add a dependency that is not in section 4 without adding a row to the decision log (section 2). Prefer small libraries; lazy-load heavy ones.
12. The only network traffic allowed is loading the app itself, the Google Drive API, Google sign-in, the companion worker (section 12.9), the browser's push service, and user-tapped "Add to calendar" links. No analytics, no runtime CDNs. Never send amounts, tenant names or phone numbers to the companion worker.
13. Mobile first: design at 360 × 780 CSS px, then make sure it also works at desktop width.
14. If a requirement is ambiguous, pick the simplest option consistent with this document, add it to the decision log, and continue.
15. If this document and the code disagree, the document wins. If the document is wrong, fix the document in the same change.

### 0.3 Task workflow for an agent

1. Restate the task and list the sections it depends on.
2. For domain logic, write the tests first, using section 17 vectors where they exist.
3. Implement the smallest change that passes the tests and acceptance criteria.
4. Run `npm run check` (and `npm run e2e` when UI changed) and fix all failures.
5. Summarise what changed, which acceptance criteria are met, and any decision-log entries added.

### 0.4 Local setup (no Android Studio)

1. Install Node.js LTS (22.x) and Git. Any editor works; VS Code is recommended.
2. `npm install`, then `npm run dev` and open `http://localhost:5173` in Chrome. Use Chrome DevTools device mode for a phone-sized view.
3. To try it on the phone, push to `main`: GitHub Actions runs the checks and deploys to Cloudflare Pages (HTTPS). Open `https://property-ledger.pages.dev` in Chrome on Android and choose "Install app" / "Add to home screen". Every pull request also gets its own preview link.
4. Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test` (Vitest), `e2e` (Playwright), `check` (lint + typecheck + test + build).
5. The companion worker lives in `worker/` and uses Cloudflare's `wrangler` CLI (a dev dependency): `npm run worker:dev` runs it locally and `npm run worker:deploy` deploys it. It is first needed in Phase 4.

## 1. Product summary

### 1.1 Problem

Emon and two co-owners jointly own two buildings. Building A has 8 electricity meters and Building B has 2. Expenses (electricity, caretaker, service charge, gas, taxes, misc) and rent earnings must be recorded every month and divided fairly between owners, sometimes according to Islamic inheritance law. Today this is done by hand.

### 1.2 Users

| User | Role in v1 |
| --- | --- |
| Primary user (Emon) | The only person who enters and edits data. Is also one of the owners. |
| Co-owners | Do not use the app in v1. Receive PDF statements. Read-only access is a Phase 6 option. |
| Caretaker | No access. Their salary is an expense. |
| Tenants | No access. Their records are kept by the primary user. |

### 1.3 Goals

1. Record any expense in under 15 seconds, and a full month of meter readings in one screen.
2. Show each owner's share of every expense and earning, correctly to the poisha.
3. Track rent including partial payments, credits and dues.
4. Show a monthly dashboard and produce monthly PDF and Excel reports.
5. Never lose data: work fully offline, back up automatically to the user's own Google Drive within minutes of any change, and to a downloadable file.
6. Remind the user with real phone notifications, even when the app is closed.

### 1.4 Out of scope (v1)

- Multiple people editing data, caretaker or tenant logins.
- Recording settlements between owners (balances are shown only).
- Importing past data from spreadsheets (the user enters past months manually).
- One expense split across several buildings (enter it once per building).
- Native apps, app-store release, online payments, analytics.
- Any server that stores financial data. The only server is the companion worker (section 12.9), which holds a Google sign-in token, a push subscription and a list of reminder titles and dates.

## 2. Decision log

| ID | Decision | Source |
| --- | --- | --- |
| D1 | Only the primary user enters data. Caretaker has no input. Co-owners may get view-only access later. | Emon |
| D2 | Ownership shares are defined per building and versioned by effective month. | Emon |
| D3 | The Islamic inheritance calculator is a helper. The final percentages are stored and confirmed by the user. | Emon |
| D4 | Expenses split by ownership share by default, with an override per expense. | Emon |
| D5 | Who pays electricity (owners or tenant) is configurable per meter. | Emon |
| D6 | Meters are "common" (building level) by default, optionally linked to a flat. | Emon |
| D7 | Recurring costs come from templates that create monthly drafts. The user can change the amount. | Emon |
| D8 | Each flat's rent is either assigned to one owner or pooled and split by share. | Emon |
| D9 | Basic tenant records: name, phone, advance, deposit, lease dates, rent changes, dues. | Emon |
| D10 | Currency is BDT only. English first, Bangla later. | Emon |
| D11 | Offline-first. Backups go automatically to a "Property Ledger Backups" folder in the primary user's own Google Drive within minutes of any change, plus a downloadable backup file. | Emon, revised 27 Oct |
| D12 | PDF and Excel export. Reminders are real push notifications sent by the companion worker, plus dashboard action cards. "Add to calendar" links stay as an optional extra. | Emon, revised 27 Oct |
| D13 | Personal use only for now. | Emon |
| D14 | Installable web app (PWA): React + TypeScript + Vite. Replaces native Kotlin + Jetpack Compose because Emon does not want Android Studio. | Emon, 27 Oct |
| D15 | Sub-meter tariff is configurable: flat rate or slabs, plus optional fixed monthly charge and VAT. | Emon |
| D16 | Owner balances are displayed only. No settlement recording. | Emon |
| D17 | No spreadsheet import. Backdated entry of past months must be easy. | Emon |
| D18 | Target: Chrome on Android (current and previous major version), installed to the home screen. Must also work in desktop Chrome and Edge for bulk entry. Safari and iOS are best effort. | Plan default |
| D19 | Each expense belongs to exactly one building. | Plan default |
| D20 | Meter readings are whole units (kWh). | Plan default |
| D21 | Working name "Property Ledger". Private GitHub repository `property-ledger`, hosted on Cloudflare Pages (free plan) at `https://property-ledger.pages.dev` (placeholder until the project is created). Same Cloudflare account as the companion worker. A custom domain is optional. | Emon, revised 27 Oct |
| D31 | Optional: Cloudflare Access (free) can require an email login before anyone can load the app. Not needed for data safety, because data lives only on the phone and in the user's Drive. | Plan, 27 Oct |
| D22 | Rent is due on day 1 and overdue after day 10 by default, configurable per lease. | Plan default |
| D23 | Rent payments settle the oldest open charge first. | Plan default |
| D24 | One device (phone) as the primary data store until Phase 6. Desktop use is for viewing a restored copy or after multi-device sync. | Plan default |
| D25 | Earnings are counted when cash is received (payment date). Expenses are counted in the month they belong to (their period). | Plan default |
| D26 | Data is stored in IndexedDB through Dexie. The app requests persistent storage on first launch. | Plan default |
| D27 | Google sign-in uses the OAuth authorization code flow through the companion worker, with only the non-sensitive `drive.file` scope. The OAuth consent screen is published "In production", because refresh tokens of apps left in "Testing" expire after 7 days. | Plan default, revised 27 Oct |
| D28 | React Native (Expo) was considered and not chosen: native Google sign-in and local notifications need cloud builds (EAS) for every native change, and testing needs a phone in the loop. A PWA needs only Node and a browser, deploys in a minute, and also works on a laptop. Revisit only if the companion-worker approach (D29) proves unreliable; the domain code ports unchanged. | Plan, 27 Oct |
| D29 | A companion worker on Cloudflare Workers (free plan) sends push reminders and holds the encrypted Google refresh token. It never stores financial data. It is the only server. | Emon, 27 Oct |
| D30 | Backup is triggered by changes (one-off Background Sync when the app is left) plus a daily push-triggered check, not by a fixed timer, because data only changes when the app is used. | Plan, 27 Oct |
| D32 | Supporting packages that the section 4 choices need: `@vitejs/plugin-react`, `@tailwindcss/vite`; `class-variance-authority`, `clsx`, `tailwind-merge` (the shadcn/ui variant and `cn` helpers); `workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-window` (the custom service worker and update prompt); `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`; `jsdom` and `@testing-library/dom` (component tests); `@types/*`. Radix primitives are added per component when first needed. | Plan, 27 Oct |
| D33 | TypeScript 7 (the native compiler) type-checks the project: it is installed as `@typescript/native` (an npm alias of `typescript@7`) and provides `tsc`. TypeScript 7.0 has no JavaScript API, which typescript-eslint needs, so the `typescript` package name is aliased to Microsoft's `@typescript/typescript6` compatibility package (its compiler is `tsc6`). `tsc` is the authority on types; lint uses the TypeScript 6 API. Drop the alias once typescript-eslint supports TypeScript 7. | Emon, revised 28 Oct |
| D34 | `src/domain` is type-checked a second time by `tsconfig.domain.json` without the DOM library, so DOM use in the domain, or an import that pulls the DOM in, fails `npm run typecheck`. This backs up the ESLint import ban of rule 0.2.3. | Plan, 27 Oct |
| D35 | `todayInDhaka()` lives in `src/services/clock.ts`. Domain code gets dates as parameters, and `dhakaDateOf(epochMs)` in `period.ts` is the pure conversion it uses. | Plan, 27 Oct |
| D36 | The Content Security Policy allows no inline scripts or styles (`style-src 'self'`). `vite preview`, and so the e2e tests, serve the same policy from `public/_headers`, and the e2e tests fail on console errors. Loosen it only with a decision-log row. | Plan, 27 Oct |
| D37 | The split engine's rule mapping returns one amount per owner involved, zero amounts included, ordered by sortOrder (17.1 S6, S7). Custom split inputs carry each owner's sortOrder for tie-breaks. Whether zero allocations are stored is decided in P1-T06. | Plan, 27 Oct |
| D39 | Forms hold their values with react-hook-form and validate by calling the service, which returns i18n error keys per field, so every rule has one implementation. zod is used to check untrusted data such as backup files. | Plan, 28 Oct |
| D40 | The system categories of 7.7 have fixed ids (`system-electricity` and so on) so code can find them, and are seeded on every start until done. Until setup is finished the app opens the setup wizard; its first step links to restoring a backup file. | Plan, 28 Oct |

## 3. Glossary

| Term | Meaning |
| --- | --- |
| PWA | Progressive web app: a website that installs to the home screen, opens full-screen and works offline. |
| Service worker | Background script that caches the app so it opens without network. |
| IndexedDB / Dexie | The browser's built-in database, and the library used to access it. |
| Background Sync | A Chrome feature that runs the service worker once the phone is online, even if the app is closed, retrying on failure. |
| Web push | Notifications sent from a server through the browser's push service; they arrive even when the app is closed. |
| VAPID | The key pair that identifies the companion worker to the push service. |
| Companion worker | The small Cloudflare Worker that sends push reminders and hands out Google access tokens (section 12.9). |
| Poisha | 1/100 of a taka. All money is stored as an integer count of poisha. |
| Basis points (bp) | 1/100 of a percent. 10000 bp = 100%. |
| Period | A calendar month, stored as text `YYYY-MM`. |
| Building | A property. Owners hold shares in it. Flats, meters and expenses belong to it. |
| Owner | A person who holds a share in one or more buildings. Exactly one owner is the primary user. |
| Share set | A dated snapshot of who owns what percentage of a building, effective from a period onward. |
| Allocation | The part of an expense or payment assigned to one owner. Stored, not computed on the fly. |
| Split rule | How an expense is divided: by share, single owner, equal, custom, or tenant-paid. |
| Meter | An electricity meter: postpaid, prepaid or sub meter. |
| Tariff | The pricing used to turn sub-meter units into a bill. |
| Slab | A unit band in a tiered tariff, with its own rate. |
| Recurring template | A rule that creates a draft expense every month, quarter or year. |
| Draft | A generated expense not yet confirmed. Excluded from all totals. |
| Lease | A tenant's occupancy of a flat, with rent, advance and deposit. |
| Rent charge | The amount a lease owes for one period (rent, or a utility line). |
| Payment | Money received from a tenant. One payment can settle several charges. |
| Credit | The part of a payment not yet applied to any charge. |
| Collected by | The owner who physically received a payment. |
| Balance | What an owner is owed by (positive) or owes to (negative) the other owners. |
| Faraid | Islamic inheritance shares. |
| Fixed-share heir | An heir with a share fixed by the Qur'an (e.g. wife 1/8). |
| Residuary | An heir who takes what remains after fixed shares (e.g. sons and daughters). |
| 'Awl | Proportional reduction when fixed shares add up to more than the whole. |
| Radd | Return of a surplus to fixed-share heirs (other than a spouse) when there is no residuary. |

## 4. Tech stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript 7, `strict: true`, `noUncheckedIndexedAccess: true` | `tsc` is TypeScript 7; the `typescript` package is the TypeScript 6 API for typescript-eslint (decision D33). |
| Tooling | Node.js LTS 22.x, npm, Vite | The only tools needed. No Android SDK. |
| UI | React 18 or later, React Router (data router, normal paths; Cloudflare Pages serves `index.html` for unknown paths when the site has no `404.html`) | |
| Styling and components | Tailwind CSS, shadcn/ui (Radix primitives), lucide-react icons | Components are copied into `src/ui/components`. |
| PWA | vite-plugin-pwa with Workbox `injectManifest` and a custom service worker (`src/sw/sw.ts`), web app manifest, maskable icons | Precache the app shell; handle `sync`, `push` and `notificationclick`; prompt the user when an update is ready. |
| Database | Dexie.js over IndexedDB, dexie-react-hooks (`useLiveQuery`) | Reactive queries; versioned schema with upgrade functions. |
| Forms and validation | react-hook-form, zod | |
| Dates | date-fns, plus helpers using `Intl.DateTimeFormat` with `timeZone: 'Asia/Dhaka'` | |
| i18n | i18next, react-i18next | `en.json` now, `bn.json` in Phase 6. |
| Charts | Recharts | Lazy-loaded on the dashboard. |
| PDF | pdfmake | Lazy-loaded. A4 portrait. |
| Excel | SheetJS Community Edition, installed from the official SheetJS CDN tarball (the npm `xlsx` package is outdated) | Lazy-loaded. CSV written by hand. |
| Photos | `<input type="file" accept="image/*" capture="environment">`, resized with `createImageBitmap` and a canvas, saved as JPEG `Blob` in IndexedDB | Section 8.11. |
| Sharing files | Web Share API (`navigator.share({ files })`), fallback to a download link | Opens the Android share sheet (WhatsApp, email, Drive). |
| Google sign-in and Drive | OAuth authorization code flow through the companion worker, scope `https://www.googleapis.com/auth/drive.file`; Drive REST v3 with `fetch` from the page and the service worker | Phase 4. |
| Background work | One-off Background Sync API, Push API, Notifications API | Chrome on Android. Section 11. |
| Companion worker | Cloudflare Workers free plan, Workers KV, Cron Triggers, `wrangler`, TypeScript | Section 12.9. Phase 4. |
| Push sending | VAPID keys; a Workers-compatible WebCrypto web-push library (choose at Phase 4 start), or a direct implementation of RFC 8291 and RFC 8292 | |
| Compression | `CompressionStream('gzip')` | Backup files. |
| App lock | 4 to 6 digit PIN hashed with PBKDF2 (WebCrypto) | A screen lock, not encryption. |
| Unit and integration tests | Vitest, fake-indexeddb, @testing-library/react | |
| End-to-end tests | Playwright with Chromium, Pixel 7 viewport, offline mode tests | |
| Lint and format | ESLint (typescript-eslint, react-hooks, `no-restricted-imports`, `no-restricted-syntax`), Prettier | |
| Hosting | Cloudflare Pages (free plan), deployed with `wrangler pages deploy dist` | `public/_headers` sets the Content Security Policy and `Cache-Control: no-cache` for `sw.js` and `index.html`. |
| CI/CD | GitHub Actions: `npm run check` and `npm run e2e` on every pull request, then a preview deployment; on `main`, build and deploy to production. Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. | Deploy only after checks pass. |

## 5. Architecture

### 5.1 Layers

Unidirectional data flow: **page component → feature hook → service (use case) → repository → Dexie.** Feature hooks read with `useLiveQuery` so screens update automatically after any write, and expose actions that call services. Services validate input, call domain engines, and write through repositories inside one Dexie transaction. Engines in `src/domain/` are pure functions over plain objects.

### 5.2 Directory layout

| Path | Contains |
| --- | --- |
| `src/domain/` | Pure TypeScript: types, `money.ts`, `bp.ts`, `period.ts`, `rational.ts`, engines (section 5.3). No imports from React, Dexie or the DOM. |
| `src/data/db.ts` | Dexie database class, schema versions and upgrades (section 7.8). |
| `src/data/repositories/` | One repository per aggregate (owners, buildings, shares, meters, expenses, rent...). Soft-delete filtering lives here. |
| `src/services/` | Use cases: `saveExpense`, `confirmDraft`, `saveReadings`, `recordPayment`, `runRollover`, `backupNow`... Also `clock.ts` (`todayInDhaka`, decision D35). |
| `src/features/<name>/` | Pages, components and hooks per feature: `setup`, `owners`, `buildings`, `shares`, `meters`, `expenses`, `recurring`, `flats`, `tenants`, `rent`, `dashboard`, `reports`, `backup`, `settings`, `inheritance`, `more` (the More tab). |
| `src/ui/` | Theme, shadcn components, shared components (MoneyInput, PeriodPicker, OwnerChip, PhotoSlots, EmptyState, BottomNav), `format.ts` (taka formatting). |
| `src/export/` | `pdf.ts`, `xlsx.ts`, `csv.ts`, `calendar.ts` (calendar links and .ics). |
| `src/sync/` | `workerClient.ts`, `drive.ts`, `backup.ts`, `restore.ts`, `backupFile.ts`, `push.ts`. Usable from both the page and the service worker. |
| `src/sw/` | Custom service worker: precache, `sync` (backup), `push` (notifications and catch-up backup), `notificationclick`. |
| `worker/` | Companion worker (Cloudflare): pairing, Google OAuth, token endpoint, reminder schedule, daily cron push. Has its own tests. |
| `src/app/` | `main.tsx`, `App.tsx`, routes, service-worker registration, update prompt, app lock gate. |
| `src/i18n/` | i18next setup and `en.json`. |
| `tests/e2e/` | Playwright specs. Unit tests sit next to their files as `*.test.ts`. |

### 5.3 Engines in `src/domain/`

| Engine | Responsibility | Section |
| --- | --- | --- |
| `split.ts` | Divide an amount by weights with exact largest-remainder rounding. | 8.2 |
| `shares.ts` | Find the share set in force for a building and period; validate share sets. | 8.1 |
| `allocation.ts` | Turn an expense or payment plus its split rule into owner allocations. | 8.3, 8.7 |
| `tariff.ts` | Turn units into a bill using a tariff. | 8.5 |
| `meterBill.ts` | Validate readings, compute units used, call the tariff engine. | 8.4 |
| `recurring.ts` | Decide which draft expenses to create for a period. | 8.6 |
| `rentLedger.ts` | Generate charges, apply payments, compute credit and status. | 8.7 |
| `balance.ts` | Owner balances. | 8.8 |
| `faraid.ts` | Islamic inheritance proposal using exact fractions. | 8.9 |
| `reports.ts` | Dashboard metrics and report tables. | 10 |
| `reminders.ts` | Which reminder cards are due today, and the 60-day reminder schedule sent to the companion worker. | 11.2 |

## 6. Coding conventions

| Topic | Convention |
| --- | --- |
| Money | `type Poisha = number & { readonly __brand: 'Poisha' }`. Helpers `add`, `sub`, `neg`, `mulInt`, `sum`, each asserting `Number.isSafeInteger`. No division helper in `money.ts`: division only through `split.ts` (the split engine, and `percentHalfUp` for basis-point rates such as VAT in 8.5), which uses `BigInt` internally. |
| Shares | `type Bp = number & { readonly __brand: 'Bp' }`, integer 0..10000. |
| Rates | Unit rates are integer poisha per unit (e.g. 7.50 BDT/unit = 750). |
| Rounding | Half-up to the nearest poisha, only where a section says to round. |
| Input | `parseTaka('1,500.5')` returns 150050 poisha or a validation error; at most 2 decimals; commas allowed. Amount inputs use `inputMode="decimal"`. |
| Display | `formatTaka(p)` uses `Intl.NumberFormat('en-IN')` for lakh grouping: `৳1,50,000`, showing `.xx` only when poisha are non-zero. PDFs print `Tk 1,50,000` until a Bengali-capable font is embedded (Phase 6). |
| Periods | Branded `Period` string `YYYY-MM`. Helpers `addMonths`, `monthsBetween`, `periodOf(date)`. |
| Dates | `YYYY-MM-DD` strings. `todayInDhaka()` is the only place that reads the clock; pass the result into domain code. Instants are epoch milliseconds. |
| IDs | `crypto.randomUUID()`. |
| Audit fields | Every record has `createdAt`, `updatedAt` (epoch ms) and `deletedAt` (epoch ms or `null`). |
| Booleans | Stored as `0` or `1` when the field is indexed (IndexedDB cannot index booleans); `true`/`false` otherwise. |
| Results | Services return `{ ok: true, value } \| { ok: false, errors: Record<string, string> }`, where each error is an i18n key. Forms show errors inline. |
| Naming | Components and their files `PascalCase.tsx`, hooks `useXxx.ts`, other files `camelCase.ts`. Dexie tables and fields in camelCase (`share_set` in section 7 is `shareSet` in code). |
| Transactions | Every write that touches more than one table runs inside `db.transaction('rw', [...tables], async () => ...)`. |
| Styling | Tailwind utility classes; colours from CSS variables so light and dark themes both work. |

## 7. Data model

Each table in this section is a Dexie table. Every record also has `id` (string, primary key), `createdAt`, `updatedAt` and `deletedAt` unless noted. Types: TEXT = string, INT = integer number, BOOLEAN = boolean (0/1 if indexed), Money = integer poisha, period = `YYYY-MM`, date = `YYYY-MM-DD`; `?` means the field may be `null`. Uniqueness rules apply to non-deleted records and are enforced in repositories (IndexedDB unique indexes cannot ignore soft-deleted rows).

### 7.1 Ownership

| Table | Column | Type | Rules |
| --- | --- | --- | --- |
| owner | name | TEXT | Required, 1 to 60 characters. |
| owner | phone, relation, note | TEXT? | Optional. |
| owner | isPrimary | BOOLEAN | Exactly one owner is primary. |
| owner | sortOrder | INT | Used for display and rounding tie-breaks. |
| building_group | name | TEXT | Optional grouping of buildings. |
| building | name | TEXT | Required, unique. |
| building | address, note | TEXT? | |
| building | groupId | TEXT? | References building_group. |
| building | sortOrder | INT | |
| share_set | buildingId | TEXT | References building. |
| share_set | effectiveFrom | period | Unique per building. |
| share_set | method | TEXT | `MANUAL`, `ISLAMIC`, `OTHER`. |
| share_set | methodNote | TEXT? | E.g. "Hindu law", "family agreement", or the Faraid reasoning summary. |
| share_entry | shareSetId, ownerId | TEXT | Unique pair. |
| share_entry | bp | INT | Greater than 0. Entries of a set sum to exactly 10000. |

### 7.2 Flats, tenants and leases

| Table | Column | Type | Rules |
| --- | --- | --- | --- |
| flat | buildingId | TEXT | References building. |
| flat | label, floor, note | TEXT | Label required and unique within the building. |
| flat | rentMode | TEXT | `ASSIGNED` or `POOLED`. |
| flat | assignedOwnerId | TEXT? | Required if and only if `ASSIGNED`. |
| flat | isActive | BOOLEAN | |
| tenant | name | TEXT | Required. |
| tenant | phone, nid, note | TEXT? | |
| lease | flatId, tenantId | TEXT | At most one `ACTIVE` lease per flat. |
| lease | startDate, endDate | date, date? | |
| lease | rentDueDay | INT | 1 to 28, default 1. |
| lease | overdueAfterDay | INT | 1 to 28, default 10, not less than rentDueDay. |
| lease | advanceAmount | Money | Default 0. |
| lease | advanceMode | TEXT | `HELD` (returned at move-out) or `ADJUST` (deducted from rent monthly). |
| lease | advanceAdjustPerMonth | Money? | Required when `ADJUST`. |
| lease | advanceCollectedByOwnerId | TEXT? | Who holds the advance. |
| lease | depositAmount | Money | Default 0. |
| lease | depositCollectedByOwnerId | TEXT? | |
| lease | status | TEXT | `ACTIVE` or `ENDED`. |
| lease | depositRefundAmount, depositRefundDate | Money?, date? | Set at move-out. |
| rent_rate | leaseId, effectiveFrom | TEXT, period | Unique pair. The first rate's effectiveFrom = lease start month. |
| rent_rate | amount | Money | Greater than 0. |

### 7.3 Meters and tariffs

| Table | Column | Type | Rules |
| --- | --- | --- | --- |
| meter | buildingId | TEXT | References building. |
| meter | label | TEXT | Required, unique within building (e.g. "Ground floor common"). |
| meter | meterNo | TEXT? | Utility account or meter number. |
| meter | type | TEXT | `POSTPAID`, `PREPAID`, `SUB`. |
| meter | scope | TEXT | `COMMON` (default) or `FLAT`. |
| meter | flatId | TEXT? | Required if and only if scope is `FLAT`. |
| meter | payer | TEXT | `OWNERS` (default) or `TENANT`. `TENANT` requires scope `FLAT`. |
| meter | parentMeterId | TEXT? | Only for `SUB`. The main meter this sub meter sits under. |
| meter | categoryId | TEXT | Default: the Electricity category. |
| meter | isActive | BOOLEAN | |
| tariff | meterId | TEXT | Only for `SUB` meters. |
| tariff | effectiveFrom | period | Unique per meter. |
| tariff | mode | TEXT | `FLAT` or `SLAB`. |
| tariff | flatRate | INT? | Poisha per unit. Required for `FLAT`. |
| tariff | slabMode | TEXT? | `PROGRESSIVE` (default) or `SINGLE_BAND`. Required for `SLAB`. |
| tariff | slabs | array | Ordered list of `{ upToUnits: INT?, rate: INT }`. `upToUnits` is a cumulative inclusive upper bound, strictly increasing, `null` only on the last slab. Stored inside the tariff record. |
| tariff | fixedChargeMonthly | Money | Default 0 (demand charge, meter rent). |
| tariff | vatBp | INT | Default 0 (e.g. 500 = 5%). |
| tariff | vatOnFixed | BOOLEAN | Default true. |
| meter_reading | meterId, period | TEXT, period | Unique pair. Only for `SUB`. |
| meter_reading | readingUnits | INT | Whole units on the display. |
| meter_reading | isReset | BOOLEAN | Meter replaced or rolled over; this reading is a new baseline. |
| meter_reading | readOn | date | |
| meter_reading | unitsUsed, billAmount | INT?, Money? | Stored result of section 8.4 for history and reports. |
| meter_reading | billBreakdown | object? | Per-slab units and amounts, fixed charge, VAT (section 8.5). |

### 7.4 Expenses

| Table | Column | Type | Rules |
| --- | --- | --- | --- |
| expense_category | name | TEXT | Unique. |
| expense_category | kind | TEXT | `METER`, `RECURRING`, `ONE_OFF`. |
| expense_category | defaultSplitRule | TEXT | Default `BY_SHARE`. |
| expense_category | isSystem, isHidden | BOOLEAN | System categories can be renamed and hidden, not deleted. |
| expense_category | sortOrder | INT | |
| recurring_template | buildingId, categoryId | TEXT | |
| recurring_template | amount | Money | Greater than 0. |
| recurring_template | frequency | TEXT | `MONTHLY`, `QUARTERLY`, `YEARLY`. |
| recurring_template | startPeriod, endPeriod | period, period? | |
| recurring_template | dueDay | INT | 1 to 28. |
| recurring_template | defaultPaidByOwnerId | TEXT? | |
| recurring_template | splitRule | TEXT | |
| recurring_template | isActive, note | BOOLEAN, TEXT? | |
| expense | buildingId, categoryId | TEXT | |
| expense | meterId, templateId, readingId | TEXT? | Links to the source, if any. |
| expense | period | period | The month the cost belongs to. |
| expense | date | date | Bill, recharge or payment date. |
| expense | dueDate | date? | Postpaid bills. |
| expense | amount | Money | Greater than 0. |
| expense | units | INT? | Optional, informational (postpaid). |
| expense | status | TEXT | `DRAFT`, `CONFIRMED`, `SKIPPED`. |
| expense | source | TEXT | `MANUAL`, `RECURRING`, `METER_POSTPAID`, `METER_PREPAID`, `METER_SUB`. |
| expense | isPaid | BOOLEAN | |
| expense | paidByOwnerId | TEXT? | Required when isPaid. |
| expense | splitRule | TEXT | `BY_SHARE`, `SINGLE_OWNER`, `EQUAL`, `CUSTOM_PERCENT`, `CUSTOM_AMOUNT`, `TENANT_PAID`. |
| expense | singleOwnerId | TEXT? | Required for `SINGLE_OWNER`. |
| expense | splitInputs | array? | Custom split inputs `{ ownerId, value }`: bp for `CUSTOM_PERCENT`, poisha for `CUSTOM_AMOUNT`. |
| expense | note | TEXT? | |
| expense_allocation | expenseId, ownerId, amount | TEXT, TEXT, Money | Exists only for `CONFIRMED` expenses that are not `TENANT_PAID`. Sums to the expense amount. |

### 7.5 Rent ledger

| Table | Column | Type | Rules |
| --- | --- | --- | --- |
| rent_charge | leaseId, period, kind | TEXT, period, TEXT | `kind` is `RENT` or `UTILITY`. Unique triple. |
| rent_charge | amountDue | Money | Editable by the user (e.g. a part month). |
| rent_charge | sourceReadingId | TEXT? | For `UTILITY` charges. |
| rent_payment | leaseId | TEXT | |
| rent_payment | date | date | Its period (month in Asia/Dhaka) is the earnings period. |
| rent_payment | amount | Money | Greater than 0. |
| rent_payment | method | TEXT | `CASH`, `BKASH`, `NAGAD`, `BANK`, `ADVANCE_ADJUSTMENT`, `DEPOSIT_DEDUCTION`, `OTHER`. |
| rent_payment | collectedByOwnerId | TEXT? | Who received the money. |
| rent_payment | isSystem | BOOLEAN | True for generated advance adjustments. |
| rent_payment | note | TEXT? | |
| payment_application | paymentId, chargeId, amount | TEXT, TEXT, Money | Output of section 8.7. Rebuilt for the whole lease after any change. |
| earning_allocation | paymentId, ownerId, amount | TEXT, TEXT, Money | Sums to the payment amount. |

### 7.6 Attachments and metadata

| Table | Column | Type | Rules |
| --- | --- | --- | --- |
| attachment | recordType, recordId | TEXT | `EXPENSE`, `READING`, `PAYMENT`, `TENANT`, `LEASE`. |
| attachment | mimeType, sizeBytes, width, height | TEXT, INT, INT, INT | |
| attachment | driveFileId | TEXT? | Set after upload (Phase 4). |
| attachment | position | INT | 0 or 1. At most two per record. |
| attachment_blob | id, blob | TEXT, Blob | Same id as its attachment. Kept in its own table so list queries never load image data. No audit fields. |
| app_meta | key, value | TEXT, any | E.g. `lastBackupAt`, `lastRolloverAt`, `changesSinceBackup`, `pinHash`. No audit fields. |

### 7.7 Seed data

Categories created on first launch (all `isSystem = true`, `defaultSplitRule = BY_SHARE`): Electricity (METER), Caretaker cost (RECURRING), Service charge (RECURRING), Gas charge (RECURRING), Holding tax (RECURRING), Other tax (RECURRING), Repairs and maintenance (ONE_OFF), Misc (ONE_OFF).

### 7.8 Dexie schema (version 1)

Indexes only; other fields are stored but not indexed. `[a+b]` is a compound index.

| Table | Index definition |
| --- | --- |
| owner | `id, sortOrder` |
| buildingGroup | `id` |
| building | `id, groupId, sortOrder` |
| shareSet | `id, buildingId, [buildingId+effectiveFrom]` |
| shareEntry | `id, shareSetId, ownerId` |
| flat | `id, buildingId` |
| tenant | `id` |
| lease | `id, flatId, tenantId, status` |
| rentRate | `id, leaseId, [leaseId+effectiveFrom]` |
| meter | `id, buildingId, parentMeterId` |
| tariff | `id, meterId, [meterId+effectiveFrom]` |
| meterReading | `id, meterId, [meterId+period], period` |
| expenseCategory | `id, sortOrder` |
| recurringTemplate | `id, buildingId, isActive` |
| expense | `id, period, [buildingId+period], categoryId, meterId, [templateId+period], status, paidByOwnerId` |
| expenseAllocation | `id, expenseId, ownerId` |
| rentCharge | `id, leaseId, [leaseId+period+kind], period` |
| rentPayment | `id, leaseId, date, collectedByOwnerId` |
| paymentApplication | `id, paymentId, chargeId` |
| earningAllocation | `id, paymentId, ownerId` |
| attachment | `id, [recordType+recordId]` |
| attachmentBlob | `id` |
| appMeta | `key` |

Phase 1 creates the tables it needs; later phases add tables in a new `db.version(n)` with an upgrade function and a migration test. Never edit a released version's schema.

## 8. Business rules and algorithms

### 8.1 Share resolution

`shareSetFor(buildingId, period)` returns the non-deleted share set of that building with the greatest `effectiveFrom` that is less than or equal to `period`. If none exists, return the validation error "No ownership shares set for this building in <month>", and block confirming expenses or recording earnings that need shares.

Saving a share set requires: at least one entry, every bp greater than 0, entries sum to exactly 10000, no owner listed twice.

### 8.2 Split engine (largest remainder)

Input: a total (integer poisha, may be negative) and a list of (ownerId, weight > 0, sortOrder). Output: one amount per owner that sums exactly to the total. Use `BigInt` for the products in steps 2 to 5.

1. If total is negative, split its absolute value and negate every result.
2. W = sum of weights. For each owner, product = total × weight.
3. Base amount = floor(product / W).
4. Remainder R = total minus sum of base amounts (0 ≤ R < number of owners).
5. Sort owners by fractional remainder `product mod W` descending, then by weight descending, then by sortOrder ascending. Add 1 poisha to the first R owners.
6. Assert that the results sum to the total, and convert back to `number` with a safe-integer check.

Mapping of split rules to weights:

| Split rule | Weights / result |
| --- | --- |
| BY_SHARE | bp of each owner in the resolved share set. |
| EQUAL | Weight 1 for each owner in the resolved share set. |
| SINGLE_OWNER | The whole amount to `singleOwnerId`. |
| CUSTOM_PERCENT | The bp inputs as weights. Inputs must sum to 10000. |
| CUSTOM_AMOUNT | The inputs are the result. They must sum to the amount. |
| TENANT_PAID | No allocations. Excluded from owner totals and expense totals; shown in lists for reference. |

### 8.3 Expense lifecycle

1. A new manual expense is saved as `CONFIRMED` directly. Generated expenses start as `DRAFT`.
2. Confirming a draft creates its allocations in the same transaction. Skipping sets `SKIPPED` and creates no allocations.
3. Editing a confirmed expense deletes and recreates its allocations, using the share set for the expense's (possibly new) period.
4. Deleting sets `deletedAt` on the expense and its allocations, with an "Undo" toast for 5 seconds.
5. Only `CONFIRMED`, non-deleted expenses count in totals, reports and balances.
6. `isPaid = false` means the bill is still payable. Unpaid confirmed expenses count in expense totals but not in "paid by" figures (section 8.8), and appear in a "Bills to pay" card.

### 8.4 Meter rules

What a meter entry creates depends on its type and payer:

| Type | Payer | User enters | Creates |
| --- | --- | --- | --- |
| POSTPAID | OWNERS | Bill period, amount, due date, paid date (optional units, late fee as part of amount) | One confirmed expense, source `METER_POSTPAID`. Warn if one already exists for that meter and period. |
| POSTPAID | TENANT | Optional record of the bill | Expense with `TENANT_PAID` rule (reference only). |
| PREPAID | OWNERS | Recharge date and amount (optional token number in note) | One confirmed expense per recharge, source `METER_PREPAID`, period = month of recharge date. |
| PREPAID | TENANT | Optional record | `TENANT_PAID` expense (reference only). |
| SUB | OWNERS, no parent | Reading | Confirmed expense for the computed bill, source `METER_SUB`. |
| SUB | OWNERS, has parent | Reading | Reading only (usage breakdown of the parent). No expense, because the parent's bill already includes this usage. |
| SUB | TENANT | Reading | Reading plus a `UTILITY` rent charge on the flat's active lease (Phase 2). No expense. In Phase 1, store the reading only. |

Sub-meter reading rules:

1. The first reading of a meter is a baseline: `unitsUsed` and `billAmount` are null.
2. Previous reading = the latest reading of the same meter with an earlier period.
3. `unitsUsed = current − previous`. If the current reading is lower than the previous one, block saving unless `isReset` is ticked. A reset reading is a new baseline (no bill) unless the user enters units used manually.
4. If months were skipped between readings, the bill covers all units since the previous reading and the screen shows "covers N months".
5. Bill = tariff engine (tariff in force for the reading period, unitsUsed). If no tariff exists, block saving and link to the tariff editor.
6. Warn (do not block) when unitsUsed is more than 3 times the average of the last 3 bills.
7. Editing a reading recomputes its bill and the next reading's bill, and updates the linked expense or utility charge.

### 8.5 Tariff calculation

Inputs: tariff, units U (≥ 0). All amounts in poisha.

1. Energy charge:
    1. `FLAT`: U × flatRate.
    2. `SLAB` + `PROGRESSIVE`: walk the slabs in order; each slab charges the units that fall inside its band at its own rate.
    3. `SLAB` + `SINGLE_BAND`: find the first slab whose `upToUnits` ≥ U (or the last slab); charge all U units at that slab's rate.
2. Base = energy + fixedChargeMonthly.
3. VAT = round half-up of (vatOnFixed ? base : energy) × vatBp / 10000, computed in integers as `(x × vatBp + 5000) div 10000`.
4. Bill = base + VAT. Return a breakdown (per slab units and amount, fixed, VAT) for display and for the report.

The tariff in force is the one with the greatest `effectiveFrom` ≤ reading period. Rates are user-entered; the app ships with no official rates.

### 8.6 Recurring generation

Runs in the rollover task (section 11.1), for every period from the template's start (or the last generated period) up to the current period:

1. A template is due in period P when P ≥ startPeriod, (endPeriod is null or P ≤ endPeriod), and: MONTHLY always; QUARTERLY when the month difference from startPeriod is divisible by 3; YEARLY when divisible by 12.
2. If no expense exists for (templateId, P), including deleted or skipped ones, create a `DRAFT` with the template's amount, split rule, date = dueDay of P, and paidBy default.
3. Generation is idempotent: check the `[templateId+period]` index inside the transaction before inserting.
4. The "Confirm this month" screen lists drafts. The user can edit the amount, mark paid and paid-by, confirm, or skip. A checkbox "Also use this amount from now on" updates the template amount.

### 8.7 Rent ledger

**Charge generation** (rollover task): for every `ACTIVE` lease and every period from the lease start month to the current period (and not after the end date's month), create a `RENT` charge if missing, with the amount from the `rent_rate` in force. The user may edit a charge's amount (part months are not prorated automatically). `UTILITY` charges are created from tenant-paid sub-meter readings (section 8.4).

**Advance adjustment**: when a lease has `advanceMode = ADJUST`, each new `RENT` charge also creates a system payment (method `ADVANCE_ADJUSTMENT`, collectedBy = advanceCollectedByOwnerId, date = the charge's due date) of min(advanceAdjustPerMonth, advance remaining). Advance remaining = advanceAmount minus all adjustment payments so far. Receiving the advance itself is not an earning; each monthly adjustment is.

**Payment application** (rebuilt for the whole lease after any charge or payment change, so the result is deterministic):

1. Delete the lease's `payment_application` records.
2. Order payments by date, then createdAt. Order open charges by period, then kind (`RENT` before `UTILITY`).
3. For each payment, apply its amount to the oldest charge with an outstanding balance, then the next, until the payment is used up or no charge is open. A payment never applies to a charge whose period is later than the current period.
4. Any unapplied amount is the payment's credit. Credit is used automatically when the next charge appears (step 3 runs again).

**Charge status** (computed, not stored), with today in Asia/Dhaka:

| Status | Condition |
| --- | --- |
| PAID | applied = amountDue |
| PARTIAL | 0 < applied < amountDue |
| DUE | applied = 0 and today is on or before the overdue day of that period |
| OVERDUE | applied < amountDue and today is after the overdue day of that period |

**Earnings allocation**: each payment (including system payments) is allocated when saved, using the flat's rent mode at the payment date. `ASSIGNED`: 100% to the assigned owner. `POOLED`: the split engine with the share set for the payment's period. Earnings belong to the month of the payment date (decision D25).

**Move-out**: the user sets the end date. The app shows the outstanding dues and the deposit. The user chooses how much of the deposit to apply to dues (creates a `DEPOSIT_DEDUCTION` payment) and records the refund amount and date. The lease becomes `ENDED`; no new charges are generated.

### 8.8 Owner balances (display only)

For an owner over a date range (default: all time; filter by building or all):

- expensePaid = sum of confirmed, paid expenses where paidByOwnerId = owner.
- expenseShare = sum of the owner's expense allocations on those same paid expenses.
- earningsCollected = sum of payments where collectedByOwnerId = owner.
- earningsShare = sum of the owner's earning allocations on payments that have a collector.
- **balance = (expensePaid − expenseShare) − (earningsCollected − earningsShare).**

A positive balance means the other owners owe this owner. Invariant (tested): balances of all owners sum to 0. The app shows balances; it does not record settlements (decision D16).

### 8.9 Islamic inheritance helper (Faraid)

The helper proposes how a deceased owner's share of one building passes to their heirs. The user reviews it, maps heirs to owner records, and saves it as a new share set with method `ISLAMIC`. It is a helper, not a legal ruling; the screen says so and recommends checking with a scholar or lawyer.

**Inputs**: building; deceased owner; effective period; deceased's gender; heirs alive at death: husband (0/1), wives (0 to 4), father (0/1), mother (0/1), sons (count), daughters (count), siblings (count, used only for the mother's share and for detecting unsupported cases); a checkbox "Other relatives may inherit (grandchildren, grandparents, uncles, nephews...)"; a checkbox "A child of the deceased died before them and left children".

**Unsupported in v1** (show the reason and switch to manual entry):

- The "other relatives" or "predeceased child" box is ticked. (In Bangladesh, section 4 of the Muslim Family Laws Ordinance 1961 gives orphaned grandchildren their parent's share, which v1 does not model.)
- There is no son and no father, and siblings > 0 (siblings would inherit).
- Only a spouse survives (surplus treatment varies).
- No heirs entered.

**Algorithm** (exact fractions with a `Rational` type over `BigInt`; "children" means sons + daughters > 0):

1. Fixed shares:
    1. Husband: 1/4 if children, else 1/2.
    2. Wives (shared equally): 1/8 if children, else 1/4.
    3. Mother: 1/6 if children or siblings ≥ 2. Otherwise 1/3, except when a spouse and the father both survive and there are no children (the 'Umariyyatayn case): then the mother gets 1/3 of what remains after the spouse's share.
    4. Father: 1/6 if children. With no son, the father is also the residuary.
    5. Daughters with no sons: 1/2 for one daughter, 2/3 shared for two or more.
2. S = sum of fixed shares.
3. If S > 1 ('awl): divide every fixed share by S. Residuaries get nothing.
4. Else residue = 1 − S. If there are sons, sons and daughters share the residue with each son taking twice a daughter's portion. Else if the father survives, he takes the residue.
5. Else if residue > 0 (radd): divide the residue among fixed-share heirs other than spouses, in proportion to their fixed shares.
6. Each heir's fraction × deceased's bp gives the heir's bp in the building. Round with the split engine (weights = the heirs' exact fractions on a common denominator) so the heirs' bp sum exactly to the deceased's bp.
7. New share set = previous set without the deceased, plus heirs. An heir who is already an owner of the building has the new bp added to their existing bp.
8. Show reasoning lines, e.g. "Wife: 1/8 because the deceased left children".

### 8.10 Validation summary

| Rule | Where |
| --- | --- |
| Share entries sum to 10000 bp | Share set editor, Faraid save |
| Amounts greater than 0 | Expense, payment, template, rent rate |
| Custom split inputs sum to 10000 bp or to the amount | Expense editor |
| Paid expense has a payer | Expense editor |
| One active lease per flat | Lease editor |
| Sub-meter reading not lower than previous unless reset | Reading entry |
| Tariff slabs strictly increasing, last slab open-ended | Tariff editor |
| At most two photos per record | All photo slots |
| Period not more than 1 month in the future | Expense, reading |

### 8.11 Photos

Up to two photos per expense, reading, payment, tenant or lease, from the camera or the gallery through the file input. Resize in the browser to a longest edge of 1600 px and encode as JPEG at quality 0.8 (target under 300 KB). Save metadata in `attachment` and the image in `attachment_blob`, in one transaction with the record. Show thumbnails with object URLs and revoke them on unmount. Deleting a record soft-deletes its attachments; the rollover task removes blobs 30 days after soft deletion.

## 9. Screens and navigation

Bottom navigation: **Dashboard, Expenses, Rent, Reports, More.** The Dashboard has a floating action button with three actions: Add expense, Enter readings, Record payment. Every list has a month selector that defaults to the current month and allows backdated months. Each screen has its own URL so the browser back button and Android back gesture work.

| Screen | Purpose and key elements | Phase |
| --- | --- | --- |
| Setup wizard | First launch: primary owner profile, buildings, other owners, initial share set per building, then seeded categories. Skippable steps can be finished later from More. Ends with an "Install this app" hint. | 1 |
| Owners | List and edit owners. Owner detail shows shares per building and (Phase 3) balance. | 1 |
| Buildings | List and edit buildings and optional group. Building detail links to flats, meters, shares, templates. | 1 |
| Share sets | History per building (effective month, method, entries). Editor with live total and "remaining %". | 1 |
| Categories | Rename, add, hide, reorder; default split rule. | 1 |
| Meters | List per building with type badges. Editor for type, scope, payer, parent, category. Tariff editor with slab rows and a live preview ("280 units = ৳2,030.70"). | 1 |
| Expenses list | Month, building, category and owner filters. Rows show amount, paid state, split icon. Footer: total and per-owner totals. | 1 |
| Expense editor | Building, category, meter (for meter categories), period, date, amount, paid and paid-by, split rule with per-owner preview, note, two photo slots. | 1 |
| Postpaid bill / prepaid recharge entry | Specialised editors from the meter or the action button. | 1 |
| Readings for month | All sub meters of a building in one list: previous reading, input for current reading, units, bill preview, photo, reset toggle. Save all at once. | 1 |
| Confirm this month | Drafts from templates with edit, confirm, skip, and "confirm all". | 1 |
| Monthly summary (interim) | Totals by category and by owner for a month, replaced by the Phase 3 dashboard. | 1 |
| Backup file | Download a backup file and restore from a file (section 12.6). | 1 |
| Flats | List per building with occupancy and rent mode. | 2 |
| Tenants and lease editor | Tenant profile; lease with rent rates, advance mode, deposit, due and overdue days; move-out flow. | 2 |
| Rent overview | For a month: each flat with tenant, due, paid, status chip. Tap to the lease ledger. | 2 |
| Lease ledger | Charges and payments over time, running balance, credit. | 2 |
| Payment entry | Lease, date, amount, method, collected by, note, photo; shows which months it will settle before saving. | 2 |
| Dues | All open balances, oldest first, with `tel:` and `sms:` links. | 2 |
| Dashboard | Section 10.1. | 3 |
| Monthly breakdown | All expenses and payments of a month, grouped by category or flat, with per-owner split. | 3 |
| Reports | Report list, preview, export as PDF, XLSX or CSV, share. | 3 |
| Google Drive backup | Connect Google Drive (pairing code and Google sign-in), last backup, pending changes, back up now, restore list, disconnect. | 4 |
| Settings | Notifications (on/off per reminder type, send a test notification), calendar links, overdue default day, app lock PIN, storage status, about and version, language (Phase 6). | 4 |
| Inheritance helper | Section 8.9 inputs, result with reasoning, mapping heirs to owners, preview and save. | 5 |

UX rules: amount fields use `inputMode="decimal"` and accept taka with up to 2 decimals; every destructive action has undo; empty states have one clear call to action; touch targets at least 48 × 48 CSS px; inputs are 16 px or larger so Chrome does not zoom; icons have accessible labels; layouts work at 200% text zoom; respect `prefers-color-scheme` and safe-area insets.

## 10. Dashboard and reports

### 10.1 Dashboard

Filters: month (default current) and building (All or one).

1. **Totals**: Earnings, Expenses, Net (= Earnings − Expenses), each with the change versus the previous month.
2. **12-month chart**: grouped bars of earnings and expenses for the 12 months ending at the selected month.
3. **Expense breakdown**: by category, ranked bars, tap to the filtered expense list.
4. **Per-owner cards**: earnings share, expense share, net, and all-time balance (section 8.8).
5. **Action cards**: the reminders of section 11.2 that are due today.

### 10.2 Metric definitions

| Metric | Definition |
| --- | --- |
| Expenses (month) | Sum of amounts of confirmed, non-deleted, non-tenant-paid expenses whose period = month. |
| Earnings (month) | Sum of payment amounts whose date falls in the month (all methods). Split into "Rent" and "Utility recovery" using payment applications by charge kind; unapplied credit counts as rent. |
| Owner expense share | Sum of the owner's expense allocations for expenses in the month. |
| Owner earnings share | Sum of the owner's earning allocations for payments in the month. |
| Rent outstanding | Sum over open charges of (amountDue − applied), as of today. |
| Balance | Section 8.8. |

### 10.3 Reports

| Report | Contents | Formats |
| --- | --- | --- |
| Monthly statement | Earnings by flat, expenses by category, net, per-owner earnings share, expense share and net, unpaid bills, rent outstanding. | PDF, XLSX, CSV |
| Owner statement | For one owner and a month or year: their share of each expense and earning, what they paid and collected, and their balance. | PDF |
| Meter history | Per meter and month: reading, units, bill, tariff used; photos listed by date. | PDF, XLSX |
| Rent ledger | Per lease or per flat: charges, payments, applications, credit, status. | PDF, XLSX |
| Yearly summary | 12 months × categories, and per-owner totals for the year. | PDF, XLSX |

File names: `PropertyLedger_<Report>_<YYYY-MM or YYYY>_<Building or All>.<ext>`. PDFs are A4 portrait, with a header (report name, period, building, generated date) and page numbers. Files are generated in the browser and shared with the Web Share API, or downloaded when sharing files is not supported. Every total in a report must equal the same metric on the dashboard (tested).

## 11. Background work and reminders

A PWA cannot run on a timer by itself. Three mechanisms together cover what a native app would do in the background:

| Mechanism | Runs when | Used for |
| --- | --- | --- |
| On-open tasks | The app starts or comes back to the foreground | Rollover, reminder schedule upload, storage and update checks |
| One-off Background Sync | Chrome wakes the service worker as soon as the phone is online, even with the app closed, and retries failures with backoff | Drive backup after changes (12.3) |
| Web push | The companion worker sends a push at 09:00 Asia/Dhaka; Chrome wakes the service worker even with the app closed | Reminder notifications (11.2) and a daily catch-up backup |

### 11.1 On-open tasks

| Task | When | Does |
| --- | --- | --- |
| Rollover | App start and `visibilitychange` to visible, at most once per hour (`appMeta.lastRolloverAt`) | Recurring drafts (8.6), rent charges and advance adjustments (8.7), blob cleanup (8.11). Idempotent. |
| Reminder schedule upload | After rollover and after any change that affects reminders, when online | Sends the schedule to the companion worker (11.2). Phase 4. |
| Pending backup | App start | If changes are pending, registers the backup sync (12.3). Phase 4. |
| Storage check | App start | `navigator.storage.persisted()` and `estimate()`; warn if storage is not persistent. |
| Update check | App start | The service worker checks for a new version; a toast offers "Reload to update". |

### 11.2 Reminder notifications

Reminders are real Android notifications. They appear in the notification shade and on the lock screen with the app's icon and the default sound, arrive when the app is closed, and open the relevant screen when tapped.

1. `reminders.ts` computes a reminder schedule for the next 60 days from local data: a list of `{ id, firstDate, lastDate, title, url }`. Titles are short and contain no amounts, tenant names or phone numbers (e.g. "Rent overdue: Flat 3B", "Bill due in 3 days: Building A main meter", "Meter readings due for October").
2. The app uploads the whole schedule to the companion worker (`PUT /schedule`), replacing the previous one, after rollover and after any change that affects it (a payment, a bill marked paid, a reading saved).
3. In Settings the user turns notifications on. The app requests notification permission, subscribes with `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and sends the subscription to the worker (`PUT /subscription`). A "Send test notification" button calls the worker.
4. The worker's cron trigger runs daily at 03:00 UTC (09:00 Asia/Dhaka). For every entry with firstDate ≤ today ≤ lastDate not yet sent today, it sends a push. More than 3 entries on one day become one summary push ("4 reminders today"). Push TTL is 24 hours.
5. The service worker's `push` handler shows each notification with `tag` = entry id (so a repeat replaces the old one instead of stacking) and the target URL; `notificationclick` focuses the app or opens it at that URL.
6. Every push also runs the catch-up backup check (12.3 step 6) inside `event.waitUntil`.
7. Dashboard action cards show the same reminders, so nothing is missed if notifications are off.
8. "Add to calendar" buttons (a prefilled Google Calendar event link, with `recur=RRULE:FREQ=MONTHLY;BYMONTHDAY=n` for monthly events) and a `.ics` download stay available as an optional extra.

| Reminder | Notify | Configurable |
| --- | --- | --- |
| Postpaid bill due | 3 days before dueDate and on the due date, until paid | Days before, on/off |
| Rent overdue | Each day after overdueAfterDay until paid, at most 7 times | On/off |
| Meter readings missing | Day 5 of the month, and day 8 if still missing | Days, on/off |
| Drafts to confirm | Day 3 of the month, while drafts exist | On/off |
| Lease ending | 30 days and 7 days before endDate | Days before, on/off |
| Backup not running | When no backup has succeeded for 3 days (the app adds this entry from `lastBackupAt`) | On/off |

Conditions for delivery: notification permission granted, the app installed to the home screen, and the phone online at some point that day (a push waits at the push service until the phone reconnects, up to its TTL). The setup guide asks the user to set Chrome's battery usage to "Unrestricted" so Android does not delay pushes or background sync.

## 12. Backup and restore

### 12.1 One-time setup (documented in the repository README)

1. Create a Google Cloud project and enable the Google Drive API.
2. Configure the OAuth consent screen as External with only the `drive.file` scope (non-sensitive), then publish it "In production". Apps left in "Testing" get refresh tokens that expire after 7 days, which would stop background backup. With only a non-sensitive scope no security review is needed; if Google shows an unverified-app notice at first sign-in, continue past it once.
3. Create an OAuth client ID of type "Web application" with the redirect URI `https://<worker-name>.<account>.workers.dev/auth/callback`.
4. Create a free Cloudflare account, run `npx wrangler login`, create the KV namespace, and set the worker secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TOKEN_ENC_KEY` (AES-GCM key), `PAIRING_CODE`, `APP_ORIGIN`. Deploy with `npm run worker:deploy`.
5. Create the Cloudflare Pages project `property-ledger` (direct upload), create an API token with Pages and Workers edit rights, and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets. Set `APP_ORIGIN` in the worker to the Pages URL.
6. Set the app's build variables `VITE_WORKER_URL` and `VITE_VAPID_PUBLIC_KEY` (both public) in the GitHub Actions workflow.
7. Optional: protect the app with Cloudflare Access (an email one-time code) so only you can load it.

### 12.2 Pairing and authorization

1. In "Connect Google Drive" the user types the pairing code once. The app generates a random 256-bit device key, stores it in IndexedDB, and calls `POST /pair` with the code and the key's SHA-256 hash. Pairing again replaces the previous device's key, so a lost or reset phone loses access automatically.
2. The app then opens `GET /auth/start`, which redirects to Google consent (`access_type=offline`, `prompt=consent`, scope `drive.file`). `GET /auth/callback` exchanges the code, encrypts the refresh token with `TOKEN_ENC_KEY`, stores it in KV and redirects back to the app.
3. Whenever the page or the service worker needs Drive, it calls `POST /token` with `Authorization: Bearer <device key>`. The worker checks the hash, refreshes an access token with Google and returns it with its expiry. Access tokens are kept in memory only; the refresh token never leaves the worker.
4. "Disconnect" revokes the token at Google and deletes it from KV.

### 12.3 Automatic backup

1. Every write increments `appMeta.changesSinceBackup`.
2. When changes are pending and the app goes to the background (`visibilitychange` to hidden), or 2 minutes pass without further changes, the app registers a one-off Background Sync with tag `backup`. Where Background Sync is unsupported, it runs the backup in the page instead.
3. The service worker's `sync` handler gets an access token (12.2), reads all tables except `attachmentBlob` in one read-only transaction, and builds `{ manifest, tables }`. The manifest holds app version, Dexie schema version, created time, row count per table and a SHA-256 checksum of the tables JSON.
4. It gzips the result with `CompressionStream` and uploads it as `backup-<ISO time>.json.gz` to the "Property Ledger Backups" folder the app created in the user's Drive (visible in Drive). New photos go to its `photos` subfolder, and each attachment's `driveFileId` is stored.
5. Retention: keep the 10 newest backups plus the newest backup of each of the last 30 days; delete the rest. On success, set `lastBackupAt` and reset `changesSinceBackup`. On any failure the handler rejects, so Chrome retries later.
6. Catch-up: every push event and every app start also check for pending changes and run the backup.
7. "Back up now" in Settings runs it immediately.

Result: whenever the phone is online, Drive holds a copy at most a few minutes behind the phone, without the user doing anything. A fixed timer adds nothing, because data only changes when the app is used; the daily push acts as the scheduled safety check (decision D30).

### 12.4 Restore (new phone or after a reset)

Install the app from its link, open "Connect Google Drive", enter the pairing code and sign in. Then "Restore from Google Drive" lists backups (date, size, row counts from the manifest). After the user picks one and confirms: download, gunzip, verify the checksum and that the schema version is not newer than the app's, then clear all tables and write all records in one transaction. Photos download in the background and when first viewed. Turn notifications on again in Settings.

### 12.5 Failure handling

No network, a worker or Google outage, or a revoked token leaves the backup pending and shows the last error in Settings. After 3 days without a successful backup, the "Backup not running" reminder fires. The app never blocks or loses local data because a backup failed.

### 12.6 Backup file (Phase 1, before Drive exists)

"Download backup file" creates the same `.json.gz` (photos optional, embedded as base64 when "include photos" is ticked) and shares or downloads it. "Restore from file" accepts that file and follows section 12.4. This protects data before Phase 4 and stays as a second safety net.

### 12.7 Storage protection

Browser data can be lost if the user clears Chrome's site data or the browser evicts storage. Mitigations: request `navigator.storage.persist()` on first launch, encourage installing the app to the home screen (installed PWAs are normally granted persistence), show storage status in Settings, and keep Drive backups no more than minutes behind (12.3).

### 12.8 Later: multi-device sync (Phase 6)

Each write appends a change record (table, id, updatedAt, data) to a local outbox. Devices upload change files to Drive and download others, merging by the latest `updatedAt` per record. Do not build this before Phase 6.

### 12.9 Companion worker

| Item | Specification |
| --- | --- |
| Platform | One Cloudflare Worker (free plan) in TypeScript, with one Workers KV namespace and a Cron Trigger `0 3 * * *` (09:00 Asia/Dhaka). |
| Endpoints | `POST /pair`, `GET /auth/start`, `GET /auth/callback`, `POST /token`, `POST /disconnect`, `PUT /subscription`, `PUT /schedule`, `POST /test-push`, `GET /health`. |
| Stored in KV | Device key hash, encrypted refresh token, push subscription, reminder schedule, a sent log (entry id and date, kept 30 days). |
| Never stored or received | Amounts, tenant names, phone numbers, backup contents. |
| Authentication | Every endpoint except `/auth/*` and `/health` requires the device key; compare SHA-256 hashes in constant time. `/pair` allows 5 attempts per hour. |
| CORS | Only `APP_ORIGIN`. |
| Push | VAPID (RFC 8292) and `aes128gcm` payload encryption (RFC 8291) with WebCrypto. A `404` or `410` from the push service deletes the stored subscription. |
| Cost | Well inside the free plan for one user (a few requests per day). |
| Tests | Vitest with `@cloudflare/vitest-pool-workers`: auth checks, pairing replacement, schedule selection by date, summary grouping, token refresh, push payload, and a check that stored data contains no amounts or names. |

## 13. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Offline | After the first load, every feature except backup, push reminders and calendar links works with no network, including a cold start in airplane mode. Backups and reminders catch up when the phone is back online. |
| Installable | Passes Chrome's install criteria: manifest with name, icons (192, 512, maskable), `display: standalone`, start URL inside scope, service worker. |
| Performance | First load under 3 s on 4G; repeat start under 1.5 s offline; initial JavaScript under 300 KB gzipped (lazy-load charts, PDF, Excel, Google scripts); lists and dashboard under 200 ms with 10 years of data (about 20,000 records). |
| Data safety | Persistent storage requested; Dexie upgrades covered by migration tests; restore round-trip test; never more than one schema change per release. |
| Privacy | Static hosting plus the companion worker, which holds only a sign-in token, a push subscription and reminder titles and dates. No analytics, cookies or trackers. Financial data leaves the device only to the user's own Google Drive. |
| Security | Content Security Policy via the `_headers` file: scripts from self only; connections to self, the companion worker origin and `https://www.googleapis.com`. Device key and refresh token handling per 12.2 and 12.9. Optional PIN lock on open and after 5 minutes hidden. |
| Accessibility | Semantic HTML, labelled inputs, WCAG AA contrast, 48 px touch targets, works with TalkBack and at 200% zoom, colour is never the only signal. |
| Localisation | All strings in i18n files; layouts tolerate 30% longer text; Bangla in Phase 6. |

## 14. Testing strategy

| Level | What | Tools |
| --- | --- | --- |
| Unit (domain) | Every engine with all section 17 vectors, plus edge cases: zero, one owner, negative totals, large amounts, ties. Property test: allocations always sum to the total. | Vitest |
| Integration (data) | Repositories, services and transactions against fake-indexeddb; soft-delete filtering; every Dexie upgrade; backup and restore round trip. | Vitest, fake-indexeddb |
| Component | Forms, validation messages, money input parsing. | @testing-library/react |
| End-to-end | Setup wizard, add expense, readings for month, confirm drafts, record partial payment, export a PDF; offline start (`context.setOffline(true)` after first load); backup through the service worker against a mocked Drive and worker. | Playwright, Pixel 7 viewport |
| Companion worker | Endpoint auth, pairing, schedule selection, token refresh, push payload, no personal data stored. | Vitest with @cloudflare/vitest-pool-workers |
| Acceptance | The "real month" script in each phase's acceptance criteria, done by the product owner on the phone. | Manual |

## 15. Iterative development plan

Each phase ends with a usable app and a real-world gate. Do not start the next phase until the gate passes. Sizes are rough guesses for one developer working part-time.

### Phase 0: Foundation (1 to 2 weeks)

Goal: a deployed, installable app shell and proven money maths.

1. P0-T01 Create the repository from the Vite React TypeScript template; strict tsconfig; `@/` path alias; npm scripts from section 0.4.
2. P0-T02 ESLint and Prettier, with `no-restricted-imports` for `src/domain` and `no-restricted-syntax` banning `parseFloat` and `toFixed` in `src/domain`, `src/data` and `src/services`. Vitest and Playwright configured.
3. P0-T03 GitHub Actions: `npm run check` and `npm run e2e` on pull requests with a Cloudflare Pages preview deployment; build and deploy to Cloudflare Pages production on `main`; `public/_headers` for CSP and service-worker caching.
4. P0-T04 `money.ts`, `bp.ts`, `period.ts`, `parseTaka`, `formatTaka`, `todayInDhaka`, with tests.
5. P0-T05 Split engine (8.2) with tests from 17.1.
6. P0-T06 Share resolver and share set validation (8.1) with tests.
7. P0-T07 Tariff and meter bill engines (8.4, 8.5) with tests from 17.2.
8. P0-T08 Dexie database with Phase 1 tables (7.1, 7.3, 7.4, 7.6), schema from 7.8, and a migration test harness.
9. P0-T09 App shell: Tailwind and shadcn/ui, routes, bottom navigation with placeholder screens, empty states, i18n setup.
10. P0-T10 PWA: manifest, icons, vite-plugin-pwa with a custom service worker (`injectManifest`) that precaches the app, update toast, `navigator.storage.persist()` on first launch.

Acceptance criteria:

- [ ] CI is green on `main` and the app is live on Cloudflare Pages, deployed from a private repository.
- [x] All 17.1 and 17.2 vectors pass as unit tests.
- [ ] Emon installs the app from Chrome on his phone; it opens in airplane mode and shows the five tabs.
- [x] Lint fails if `parseFloat` or `toFixed` is used in domain, data or service code (`tests/lint/guards.test.ts`).

### Phase 1: Expense ledger, first usable app (4 to 6 weeks)

Goal: record a full month of real expenses for both buildings and see each owner's share.

1. P1-T01 Setup wizard (section 9) with seeded categories (7.7).
2. P1-T02 Owners and buildings screens, including optional building group.
3. P1-T03 Share set editor and history list (manual method).
4. P1-T04 Categories screen.
5. P1-T05 Meters screen and editor; tariff editor with slabs and live preview.
6. P1-T06 Allocation engine and expense service with transactional allocation writes (8.3).
7. P1-T07 Expense editor with split rule override, paid-by, photos (8.11).
8. P1-T08 Postpaid bill and prepaid recharge entry (8.4).
9. P1-T09 "Readings for month" batch screen with validation, reset, bill preview; creates expenses per 8.4.
10. P1-T10 Recurring templates screen, recurring engine (8.6), rollover task (drafts only), "Confirm this month" screen.
11. P1-T11 Expenses list with filters and per-owner footer; expense detail with allocation table; soft delete with undo.
12. P1-T12 Interim monthly summary screen.
13. P1-T13 Backup file download and restore from file (12.6).

Acceptance criteria:

- [ ] Emon enters one real month for both buildings, all 10 meters and all recurring costs, and each owner's total matches a hand calculation to the poisha.
- [ ] Changing a building's share set from next month does not change this month's allocations.
- [ ] A routine expense takes under 15 seconds to enter on the phone.
- [ ] Everything works in airplane mode and survives closing and reopening the app.
- [ ] Backdated entry for a past month works (decision D17).
- [ ] A backup file restores into a fresh Chrome profile with identical totals.

### Phase 2: Earnings and rent (3 to 4 weeks)

Goal: know who owes rent, how much was paid, and who earned it.

1. P2-T01 Add tables 7.2 and 7.5 in Dexie version 2 with an upgrade function and migration test.
2. P2-T02 Flats screen with rent mode and assigned owner.
3. P2-T03 Tenants and lease editor with rent rates, advance mode, deposit, due and overdue days.
4. P2-T04 Rent ledger engine (8.7) with tests from 17.4.
5. P2-T05 Charge generation and advance adjustments in the rollover task.
6. P2-T06 Payment entry with settlement preview; edit and delete rebuild applications.
7. P2-T07 Utility charges from tenant-paid sub-meter readings (8.4).
8. P2-T08 Earnings allocation per payment.
9. P2-T09 Rent overview, lease ledger, dues list with `tel:` and `sms:` links.
10. P2-T10 Move-out flow with deposit deduction and refund record.

Acceptance criteria:

- [ ] All 17.4 vectors pass.
- [ ] One real month of rent, including at least one partial payment, matches Emon's records.
- [ ] Editing or deleting an old payment re-settles charges correctly and deterministically.
- [ ] Assigned-flat rent goes 100% to its owner; pooled rent splits by share.

### Phase 3: Dashboard and reports (3 to 4 weeks)

Goal: see the month at a glance and send co-owners a statement.

1. P3-T01 Report and balance engines (10.2, 8.8) with tests from 17.3.
2. P3-T02 Dashboard (10.1) with Recharts and action cards (11.2, without calendar links).
3. P3-T03 Monthly breakdown screen.
4. P3-T04 Owner balances on dashboard and owner detail.
5. P3-T05 PDF generation with pdfmake and the five reports (10.3).
6. P3-T06 XLSX export with SheetJS and CSV export.
7. P3-T07 Share files with the Web Share API, with download fallback.

Acceptance criteria:

- [ ] Report totals equal dashboard totals for the same filters (automated test).
- [ ] Owner balances sum to zero (automated test).
- [ ] A monthly PDF shared from the phone to WhatsApp opens correctly, and a co-owner agrees with it.
- [ ] XLSX opens correctly in Excel and Google Sheets.

### Phase 4: Automatic backup, push reminders and app lock (3 to 4 weeks)

Goal: safe and hands-off every day.

1. P4-T01 README setup guide for Google Cloud, Cloudflare and Chrome battery settings (12.1, 11.2).
2. P4-T02 Companion worker: pairing, Google OAuth, token endpoint, KV storage, tests (12.2, 12.9).
3. P4-T03 Service worker handlers for `sync`, `push` and `notificationclick`.
4. P4-T04 Automatic backup through Background Sync, catch-up, retention, "Back up now", status in Settings and dashboard (12.3).
5. P4-T05 Photo upload.
6. P4-T06 Restore from Drive (12.4).
7. P4-T07 Reminder schedule engine and upload, push subscription, worker cron and push sending, notification settings and test notification (11.2).
8. P4-T08 Optional "Add to calendar" links and `.ics` export.
9. P4-T09 PIN app lock with auto-lock after 5 minutes hidden, and storage status in Settings (12.7).

Acceptance criteria:

- [ ] After adding an expense and closing the app, a new backup appears in the Drive folder within 5 minutes (phone online).
- [ ] With the phone offline when the app is closed, the backup runs by itself after the phone reconnects, without opening the app.
- [ ] A rent-overdue notification arrives at about 09:00 with the app closed and the phone locked, and tapping it opens that lease.
- [ ] After a phone reset (or in a fresh Chrome profile), restoring from Drive gives identical row counts and monthly statement totals.
- [ ] Automated tests show the worker stores no amounts, tenant names or phone numbers.

### Phase 5: Inheritance helper and share history (2 to 3 weeks)

Goal: shares can follow an inheritance event correctly.

1. P5-T01 `Rational` type and Faraid engine (8.9) with tests from 17.5.
2. P5-T02 Inheritance helper screen: inputs, unsupported-case messages, result with reasoning, heir-to-owner mapping (existing or new owner), preview, save as share set.
3. P5-T03 Share history timeline per building, with a comparison of two sets.
4. P5-T04 "Other law" method with a free-text label and manual entry.
5. P5-T05 Yearly summary report (if not completed in Phase 3).

Acceptance criteria:

- [ ] All 17.5 vectors pass.
- [ ] A new share set applies only from its effective month; earlier reports are unchanged.
- [ ] Unsupported heir combinations never produce a result; they route to manual entry.

### Phase 6: Polish and growth (ongoing, choose per item)

- Bangla translation (`bn.json`), optional Bangla digits, Noto Sans Bengali embedded in PDFs so the ৳ sign and Bangla text print.
- Co-owner view-only: start with shared PDFs (already in Phase 3); later a read-only mode that opens a backup shared from Drive, in the same web app on any device.
- Multi-device sync (section 12.8), which also enables comfortable data entry on a laptop.
- One expense split across several buildings.
- Play Store listing, if ever wanted, by wrapping the PWA as a Trusted Web Activity with PWABuilder (no Android Studio needed).

### 15.1 Definition of done (every task)

- [ ] Code follows sections 0.2 and 6.
- [ ] New domain logic has unit tests; new data code has fake-indexeddb tests; schema changes have migration tests; new user flows have a Playwright test.
- [ ] `npm run check` passes, and `npm run e2e` passes when UI changed.
- [ ] No hardcoded user-facing strings.
- [ ] Decision log updated if anything was decided.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| Browser data cleared or evicted | Persistent storage, install to home screen, Drive auto-backup, backup file from Phase 1, backup-overdue reminder. |
| Rounding makes splits not add up | Integer poisha, BigInt in the split engine, largest remainder, assertion, property tests. |
| Floating-point creeps into money code | Branded types, lint bans on `parseFloat` and `toFixed`, `parseTaka` as the only input path. |
| Faraid helper gives a wrong share for an unusual family | Supported heirs only; unsupported cases route to manual; reasoning shown; user confirms; disclaimer. |
| Share changes rewrite history | Dated share sets and stored allocations (rule 0.2.6). |
| Double counting of sub meters under a main meter | Section 8.4 table: sub meters with a parent create no expense. |
| Android battery saving delays pushes or background sync | Setup guide sets Chrome's battery usage to Unrestricted; catch-up backup on every open and every push; dashboard cards as a fallback for reminders. |
| Companion worker or Google sign-in stops working | Backups stay pending, never lost; a "Backup not running" reminder after 3 days; backup file as a fallback. |
| Companion worker is compromised | It holds no financial data; the refresh token is encrypted and limited to files the app created (`drive.file`); revoke access from Google account settings. |
| Scope creep | Phase gates; Phase 1 is expenses only. |
| Agent drifts from the spec | Rules in 0.2; acceptance criteria per phase; decision log for every deviation. |

## 17. Worked examples (golden test vectors)

Use these exact numbers as unit tests. Sample setup: Owners O1 (primary, sortOrder 0), O2 (1), O3 (2). Building A shares: O1 5000 bp, O2 3000 bp, O3 2000 bp.

### 17.1 Split engine

| Case | Total (poisha) | Rule / weights | Expected (O1, O2, O3) |
| --- | --- | --- | --- |
| S1 | 800000 (৳8,000) | BY_SHARE 5000/3000/2000 | 400000, 240000, 160000 |
| S2 | 10001 (৳100.01) | BY_SHARE 5000/3000/2000 | 5001, 3000, 2000 |
| S3 | 10000 (৳100.00) | EQUAL 1/1/1 | 3334, 3333, 3333 |
| S4 | −10001 | BY_SHARE 5000/3000/2000 | −5001, −3000, −2000 |
| S5 | 1 | BY_SHARE 5000/3000/2000 | 1, 0, 0 |
| S6 | 300000 | SINGLE_OWNER O2 | 0, 300000, 0 |
| S7 | 100000 | CUSTOM_AMOUNT 70000/30000/0 | 70000, 30000, 0 |

### 17.2 Sub-meter bills

Reading: previous 12,450, current 12,730, units used 280.

| Case | Tariff | Expected bill |
| --- | --- | --- |
| T1 | FLAT 1000 poisha/unit, no fixed, no VAT | 280000 (৳2,800.00) |
| T2 | SLAB PROGRESSIVE: up to 75 @ 500, up to 200 @ 700, up to 300 @ 750, above @ 800; fixed 8400; VAT 500 bp on fixed too | Energy 37500 + 87500 + 60000 = 185000; base 193400; VAT 9670; bill 203070 (৳2,030.70) |
| T3 | Same slabs, SINGLE_BAND; fixed 8400; VAT 500 bp | Energy 280 × 750 = 210000; base 218400; VAT 10920; bill 229320 (৳2,293.20) |
| T4 | Current reading 12,400 without reset | Validation error |
| T5 | First ever reading | Baseline, no bill |

The slab rates above are illustrative test values, not official tariffs.

### 17.3 Owner balances

One month, Building A. Caretaker ৳8,000 paid by O1, split by share. Pooled rent ৳15,000 collected by O1.

| Owner | Expense paid − share | Collected − earnings share | Balance |
| --- | --- | --- | --- |
| O1 | 8000 − 4000 = +4000 | 15000 − 7500 = +7500 | −3500 (owes others) |
| O2 | 0 − 2400 = −2400 | 0 − 4500 = −4500 | +2100 |
| O3 | 0 − 1600 = −1600 | 0 − 3000 = −3000 | +1400 |

Amounts in taka. Balances sum to 0.

### 17.4 Rent ledger

Lease on a pooled flat, rent ৳15,000 from 2026-03, due day 1, overdue after day 10, no advance.

| Step | Event | Expected |
| --- | --- | --- |
| R1 | 5 Mar: payment ৳10,000 | March PARTIAL, ৳5,000 due. Earnings March ৳10,000 split 5,000/3,000/2,000. |
| R2 | 11 Mar, no further payment | March OVERDUE. |
| R3 | 4 Apr: payment ৳20,000 | ৳5,000 to March (PAID), ৳15,000 to April (PAID). |
| R4 | 3 May: payment ৳16,000 | May PAID, credit ৳1,000. |
| R5 | 1 Jun: June charge generated | ৳1,000 credit applied; June PARTIAL, ৳14,000 due. |
| R6 | Then delete the 4 Apr payment (today in June) | Rebuild: the 5 Mar payment covers ৳10,000 of March; the 3 May payment covers the other ৳5,000 of March and ৳11,000 of April. March PAID, April PARTIAL with ৳4,000 due, May and June unpaid, no credit. |
| R7 | ADJUST lease: advance ৳30,000, ৳5,000 per month | Each month a system payment of ৳5,000 until ৳30,000 is used (6 months), counted as earnings in each month. |

### 17.5 Faraid

The deceased owned 4000 bp of Building A in F1; the other cases show fractions of the deceased's share.

| Case | Heirs | Expected fractions | Notes |
| --- | --- | --- | --- |
| F1 | Wife, 2 sons, 1 daughter | Wife 1/8; each son 7/20; daughter 7/40 | Building bp from 4000: wife 500, sons 1400 each, daughter 700. |
| F2 | Husband, mother, 2 daughters | Husband 3/13; mother 2/13; each daughter 4/13 | 'Awl (1/4 + 1/6 + 2/3 = 13/12). In bp of 10000: 2308, 1538, 3077, 3077. |
| F3 | Mother, 1 daughter | Daughter 3/4; mother 1/4 | Radd. |
| F4 | Wife, mother, 1 daughter | Wife 1/8; daughter 21/32; mother 7/32 | Radd excluding the spouse. In bp of 10000: 1250, 6563, 2187 (tie broken by larger weight). |
| F5 | Wife, father, mother | Wife 1/4; mother 1/4; father 1/2 | 'Umariyyatayn. |
| F6 | Husband, father, mother | Husband 1/2; mother 1/6; father 1/3 | 'Umariyyatayn. |
| F7 | Father, mother, 1 son | Father 1/6; mother 1/6; son 2/3 | |
| F8 | Father, 1 daughter | Daughter 1/2; father 1/2 | Father 1/6 plus residue 1/3. |
| F9 | Husband, father, mother, 2 daughters | Husband 3/15; father 2/15; mother 2/15; each daughter 4/15 | 'Awl (15/12). |
| F10 | Wife, 1 daughter, 2 siblings, no father | Unsupported | Siblings would inherit. |
| F11 | Wife only | Unsupported | Only a spouse survives. |

## 18. Open items for later

These do not block any phase before Phase 6. Decide them when that phase starts.

- Whether co-owners need a live read-only view or PDFs are enough.
- Whether data entry on a laptop is needed often enough to build multi-device sync.
