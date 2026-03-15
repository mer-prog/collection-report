# CollectionReport — Automated Collection Sales Report App for Shopify

> **What:** A Shopify Embedded App that aggregates collection-level sales and inventory data on a schedule and delivers reports to Slack in Block Kit format
> **Who:** Mid-to-large Shopify merchants and e-commerce operations teams
> **Tech:** Remix · TypeScript · Prisma + SQLite · Polaris React · Shopify GraphQL Admin API · Slack Incoming Webhooks

**Source Code:** [github.com/mer-prog/collection-report](https://github.com/mer-prog/collection-report)

---

## Skills Demonstrated

| Skill | Implementation |
|-------|---------------|
| Shopify App Development | Embedded App built on the official Shopify App Template (Remix) with OAuth, webhook handling, and GraphQL Admin API integration for products, orders, and inventory |
| Full-Stack Architecture | Unified front-end and back-end via Remix loader/action pattern with a cleanly separated service layer (report generator, scheduler, Slack sender) |
| Database Design | Prisma ORM schema with three models (Session, ReportConfig, ReportLog), migration management, and cascading deletes |
| External API Integration | Slack Incoming Webhook delivery in Block Kit format with currency formatting, top product ranking, and low-stock alerts |
| Scheduling System Design | External cron (cron-job.org) with bearer token authentication, daily/weekly/monthly schedule evaluation, 30-minute drift tolerance, and duplicate send prevention |
| Internationalization (i18n) | Client-side React Context + localStorage locale switching (EN/JA) with 105 translation keys and parameter interpolation |
| Multi-Tenant Security | Shop-scoped data isolation across all queries to prevent cross-tenant data leakage |

---

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | Remix (Shopify App Template) | ^2.16.1 | SSR, file-based routing, loader/action pattern |
| Language | TypeScript | ^5.2.2 | Type-safe development |
| UI Library | Polaris React | ^12.0.0 | Shopify admin-consistent UI components |
| Database | Prisma + SQLite | ^6.2.1 | ORM, migration management, session storage |
| API | Shopify GraphQL Admin API | 2025-01 | Product, order, and inventory data retrieval |
| Auth | Shopify App Bridge React | ^4.1.6 | Embedded app authentication, OAuth flow |
| Session Storage | shopify-app-session-storage-prisma | ^8.0.0 | Prisma-backed session persistence |
| Notifications | Slack Incoming Webhooks | — | Block Kit formatted report delivery |
| Scheduling | cron-job.org | — | External cron service for periodic execution |
| Build Tool | Vite | ^6.2.2 | HMR, production builds |
| Runtime | Node.js | >=20.19 <22 \|\| >=22.12 | Server execution environment |
| Code Quality | ESLint + Prettier | ^8.42.0 / ^3.2.4 | Linting and formatting |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Shopify Admin (Embedded App)                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Polaris React UI                        │  │
│  │  Dashboard  │  Create Report  │  Edit  │  Preview         │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │ Remix loader / action                 │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                     Remix Server                           │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐   │  │
│  │  │ report-     │ │ scheduler    │ │ slack-sender      │   │  │
│  │  │ generator   │ │ .server.ts   │ │ .server.ts        │   │  │
│  │  │ .server.ts  │ │ (52 lines)   │ │ (116 lines)       │   │  │
│  │  │ (296 lines) │ │              │ │                   │   │  │
│  │  └──────┬──────┘ └──────────────┘ └────────┬──────────┘   │  │
│  │         │                                   │              │  │
│  └─────────┼───────────────────────────────────┼──────────────┘  │
│            │                                   │                 │
└────────────┼───────────────────────────────────┼─────────────────┘
             │                                   │
     ┌───────▼───────┐                   ┌───────▼───────┐
     │ Shopify       │                   │ Slack         │
     │ GraphQL API   │                   │ Webhook API   │
     │ (Products &   │                   │ (Block Kit)   │
     │  Orders)      │                   │               │
     └───────────────┘                   └───────────────┘

     ┌───────────────┐                   ┌───────────────┐
     │ Prisma        │                   │ cron-job.org  │
     │ + SQLite      │                   │ (External     │
     │ (Session /    │                   │  Cron)        │
     │  ReportConfig │◄──────────────────│ POST /api/cron│
     │  / ReportLog) │                   │ Bearer auth   │
     └───────────────┘                   └───────────────┘
```

---

## Key Features

### 1. Report Dashboard (`app/routes/app._index.tsx` — 321 lines)
Displays all configured reports in a Polaris IndexTable with columns for collection name, status badge, schedule, validity period, last sent timestamp, and actions. Supports "Send Now," "Edit," "Delete," and "Toggle Active/Inactive" actions. Shows an empty state with a CTA to create the first report.

### 2. Report Creation (`app/routes/app.reports.new.tsx` — 280 lines)
Form for creating a new report: Shopify ResourcePicker for collection selection, frequency selector (daily/weekly/monthly), delivery time picker, day-of-week/month input, optional validity period (start/end dates with checkboxes), and Slack webhook URL. Validates required fields and saves a ReportConfig via Prisma.

### 3. Report Editing & Delivery Logs (`app/routes/app.reports.$id.tsx` — 381 lines)
Editable form for all report settings. Displays the 10 most recent delivery logs with status badges (success/failed), timestamps, destinations, and error messages. Shows a status badge (Active/Pending/Expired/Inactive) at the top of the page.

### 4. Report Preview (`app/routes/app.reports.$id.preview.tsx` — 186 lines)
Fetches real-time data from the Shopify GraphQL API and renders a Slack Block Kit-style preview in Polaris UI. Shows collection name, reporting period, total revenue, order count, average order value, top 3 products by revenue, and low-stock alerts.

### 5. Report Generation Engine (`app/services/report-generator.server.ts` — 296 lines)
Queries the Shopify GraphQL Admin API with pagination to fetch collection products and orders from the last 30 days. Aggregates revenue and units sold for collection items only, identifies the top 5 products by revenue, and flags products with inventory at or below 10 units. Returns a typed `CollectionReportData` object.

### 6. Slack Delivery (`app/services/slack-sender.server.ts` — 116 lines)
Transforms `CollectionReportData` into Slack Block Kit format (header, field sections, top products, low-stock alert) and POSTs to the configured Incoming Webhook URL. Formats currency in Japanese Yen with locale-aware thousands separators.

### 7. Scheduler (`app/services/scheduler.server.ts` — 52 lines)
The `shouldRunNow()` function evaluates whether a report should execute based on: validity period (validFrom/validUntil), active flag, 30-minute time window tolerance for cron drift, same-day duplicate prevention, and daily/weekly (day-of-week)/monthly (day-of-month) schedule matching. The `getReportStatus()` function computes the display status (Active/Pending/Expired/Inactive).

### 8. Cron Endpoint (`app/routes/api.cron.tsx` — 96 lines)
POST-only `/api/cron` endpoint called by cron-job.org. Authenticates via `Authorization: Bearer {CRON_SECRET}`. Fetches all active ReportConfigs, evaluates each with `shouldRunNow()`, and for qualifying reports: generates data, sends to Slack, updates `lastSentAt`, and creates a ReportLog. Returns JSON with the processed count and per-config results.

### 9. Webhook Handlers
- `app/uninstalled` (17 lines): Deletes all Sessions for the shop on app removal (cascading deletes clean up related data)
- `app/scopes_update` (21 lines): Updates the Session scope field when API permissions change

### 10. Language Switching (`app/i18n/` — 4 files)
Client-side i18n via React Context with a `useTranslation()` hook. Locale is persisted in `localStorage` (default: Japanese). 105 translation keys across en.json and ja.json cover the dashboard, forms, preview, and error messages. Supports parameter interpolation and array access.

---

## Database Design

```
┌─────────────────────────────┐
│         Session             │
├─────────────────────────────┤
│ id          STRING PK       │
│ shop        STRING          │
│ state       STRING          │
│ isOnline    BOOLEAN         │
│ scope       STRING?         │
│ expires     DATETIME?       │
│ accessToken STRING          │
│ userId      BIGINT?         │
│ firstName   STRING?         │
│ lastName    STRING?         │
│ email       STRING?         │
│ accountOwner BOOLEAN        │
│ locale      STRING?         │
│ collaborator BOOLEAN?       │
│ emailVerified BOOLEAN?      │
│ refreshToken STRING?        │
│ refreshTokenExpires DATETIME│
└─────────────────────────────┘

┌─────────────────────────────┐      ┌─────────────────────────┐
│       ReportConfig          │      │       ReportLog         │
├─────────────────────────────┤      ├─────────────────────────┤
│ id              STRING PK   │──1:N─│ id        STRING PK     │
│ shop            STRING      │      │ configId  STRING FK     │
│ collectionId    STRING      │      │ status    STRING        │
│ collectionTitle STRING      │      │           (success/failed)
│ schedule        STRING      │      │ sentTo    STRING        │
│   (daily/weekly/monthly)    │      │           (slack)       │
│ scheduleTime    STRING      │      │ errorMsg  STRING?       │
│   (HH:MM format)           │      │ createdAt DATETIME      │
│ scheduleDay     INT?        │      └─────────────────────────┘
│   (weekly: 0-6 / monthly: 1-31)
│ slackWebhookUrl STRING?     │
│ isActive        BOOLEAN     │
│ validFrom       DATETIME?   │
│ validUntil      DATETIME?   │
│ lastSentAt      DATETIME?   │
│ createdAt       DATETIME    │
└─────────────────────────────┘

Relationship: ReportConfig 1 : N ReportLog (onDelete: Cascade)
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/app` | Shopify Admin | Dashboard — fetch all report configs |
| POST | `/app` | Shopify Admin | Execute action (Send Now / Delete / Toggle Active) |
| GET | `/app/reports/new` | Shopify Admin | New report creation form |
| POST | `/app/reports/new` | Shopify Admin | Save new report config |
| GET | `/app/reports/:id` | Shopify Admin | Edit form + delivery logs |
| POST | `/app/reports/:id` | Shopify Admin | Update report config |
| GET | `/app/reports/:id/preview` | Shopify Admin | Report preview with live data |
| POST | `/api/cron` | Bearer token | Scheduled execution trigger (called by cron-job.org) |
| POST | `/webhooks/app/uninstalled` | Shopify signature | App uninstall webhook |
| POST | `/webhooks/app/scopes_update` | Shopify signature | Scope update webhook |

---

## Screen Specifications

### Dashboard (`/app`)
- IndexTable listing all report configs
- Columns: Collection / Status / Schedule / Validity Period / Last Sent / Actions
- Status badges: Active (green) / Pending (blue) / Expired (yellow) / Inactive (red)
- Actions: Send Now / Edit / Delete / Toggle Active
- Empty state with CTA to create first report
- Language toggle button (top right)

### Create Report (`/app/reports/new`)
- Collection picker (Shopify ResourcePicker)
- Frequency selector (Daily / Weekly / Monthly)
- Delivery time picker (HH:MM)
- Day-of-week selector (for weekly) / Day-of-month input (for monthly)
- Optional validity period (start/end dates with checkboxes and date pickers)
- Slack Webhook URL input

### Edit Report (`/app/reports/:id`)
- All creation fields (fully editable)
- Status badge display
- Recent 10 delivery logs (status badge, timestamp, destination, error message)
- Preview button

### Report Preview (`/app/reports/:id/preview`)
- Collection name header
- Grid display: Period / Total Revenue / Order Count / Average Order Value
- Top 3 products by revenue (units sold, revenue, stock)
- Low-stock product alerts (inventory at or below 10 units)

---

## Project Structure

```
collection-report/                         59 files (excluding node_modules/build)
├── app/                                   TypeScript/TSX: 26 files (2,241 lines)
│   ├── routes/
│   │   ├── app.tsx                  52 lines  Layout wrapper (auth, AppBridge init)
│   │   ├── app._index.tsx          321 lines  Dashboard (listing, action handling)
│   │   ├── app.reports.new.tsx     280 lines  New report creation form
│   │   ├── app.reports.$id.tsx     381 lines  Report editing + delivery logs
│   │   ├── app.reports.$id.preview.tsx 186 lines  Report preview
│   │   ├── api.cron.tsx             96 lines  Cron endpoint
│   │   ├── _index/
│   │   │   ├── route.tsx            58 lines  Landing page
│   │   │   └── styles.module.css    73 lines  Landing page styles
│   │   ├── auth.login/
│   │   │   ├── route.tsx            68 lines  Login form
│   │   │   └── error.server.tsx     16 lines  Login error handling
│   │   ├── auth.$.tsx                8 lines  OAuth callback
│   │   ├── webhooks.app.scopes_update.tsx  21 lines  Scope update webhook
│   │   └── webhooks.app.uninstalled.tsx    17 lines  Uninstall webhook
│   ├── services/
│   │   ├── report-generator.server.ts 296 lines  Report data generation (GraphQL)
│   │   ├── scheduler.server.ts        52 lines  Schedule evaluation logic
│   │   └── slack-sender.server.ts    116 lines  Slack Block Kit delivery
│   ├── i18n/
│   │   ├── i18nContext.tsx           99 lines  i18n Context Provider + hooks
│   │   ├── LanguageToggle.tsx        30 lines  Language toggle UI component
│   │   ├── en.json                  105 lines  English translations
│   │   └── ja.json                  105 lines  Japanese translations
│   ├── shopify.server.ts             36 lines  Shopify app configuration
│   ├── db.server.ts                  15 lines  Prisma client initialization
│   ├── root.tsx                      30 lines  HTML document root
│   ├── entry.server.tsx              59 lines  SSR handler (streaming)
│   ├── routes.ts                      3 lines  Flat routes configuration
│   └── globals.d.ts                        CSS module type definitions
├── prisma/
│   ├── schema.prisma                 62 lines  Database schema (3 models)
│   └── migrations/                         Migrations (2 entries)
├── package.json                      78 lines  Dependency definitions
├── vite.config.ts                    73 lines  Vite build config (HMR, plugins)
├── tsconfig.json                     21 lines  TypeScript configuration
├── shopify.app.toml                  28 lines  Shopify app config (scopes, webhooks)
├── shopify.web.toml                   7 lines  Web configuration
├── Dockerfile                        22 lines  Production deployment (node:18-alpine)
├── CLAUDE.md                        193 lines  Project specification
├── README.md                         74 lines  User-facing documentation
└── CHANGELOG.md                      95 lines  Version history
```

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >=20.19 <22 or >=22.12
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- A Shopify development store
- A Slack workspace with an Incoming Webhook URL

### Installation

```bash
# Clone the repository
git clone https://github.com/mer-prog/collection-report.git
cd collection-report

# Install dependencies
npm install

# Set up the database
npx prisma migrate dev

# Start the development server
shopify app dev

# Deploy to production
shopify app deploy
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SHOPIFY_API_KEY` | Shopify app API key (from Partner Dashboard) | Yes |
| `SHOPIFY_API_SECRET` | Shopify app secret key | Yes |
| `SHOPIFY_APP_URL` | Public HTTPS URL of the app | Yes |
| `SCOPES` | API scopes (`read_products,read_orders,read_inventory`) | Yes |
| `CRON_SECRET` | Bearer token for the `/api/cron` endpoint | Yes |
| `PORT` | Server port (default: 3000) | No |
| `FRONTEND_PORT` | HMR port (default: 8002) | No |

---

## Security Design

| Measure | Implementation |
|---------|---------------|
| Minimal API Scopes | Requests only read-only scopes: `read_products`, `read_orders`, `read_inventory` |
| Cron Endpoint Auth | `Authorization: Bearer {CRON_SECRET}` header validation; returns 401 on mismatch |
| Webhook Signature Verification | Shopify library automatically validates all incoming webhook signatures |
| Session Management | Prisma-backed session storage with expiring access tokens and refresh token rotation |
| Multi-Tenant Isolation | All ReportConfig and ReportLog queries are filtered by `shop` field, preventing cross-store data access |
| POST-Only Restriction | `/api/cron` endpoint rejects non-POST methods with 405 |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Remix (Shopify App Template) | Official Shopify template standardizes auth, webhooks, and App Bridge integration; the loader/action pattern keeps SSR and form handling concise |
| SQLite + Prisma | Sufficient performance for MVP; migration management is straightforward, and switching to PostgreSQL later requires only a Prisma adapter change |
| External cron (cron-job.org) | Eliminates the need for an in-app scheduler daemon, keeping the architecture simple; free tier supports up to 3 jobs at 1-minute intervals |
| Slack Block Kit format | Structured rich messages visually separate revenue summaries, top products, and low-stock alerts for quick scanning |
| Three-file service layer split | Isolating report-generator, scheduler, and slack-sender makes each independently testable and simplifies adding new delivery channels |
| React Context + localStorage i18n | Lightweight EN/JA switching without server-side translation library overhead |
| 30-minute drift tolerance | Absorbs timing variance from cron-job.org; strict time matching would cause missed sends |
| Validity period (validFrom/validUntil) | Enables campaign-scoped reports; expired reports are preserved for reactivation without data loss |

---

## Running Costs

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Shopify | Development Store | Free |
| cron-job.org | Free tier (3 jobs, 1-minute interval) | $0 |
| Slack Incoming Webhooks | Free | $0 |
| Hosting (Docker) | Provider-dependent (Heroku / AWS / Fly.io) | Varies |
| **Total (development)** | | **$0** |

---

## Author

[@mer-prog](https://github.com/mer-prog)
