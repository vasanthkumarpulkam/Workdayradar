# Workday Radar

**A live dashboard for analyst and data-engineering roles across ~150 companies that hire through Workday.**

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![Zero dependencies](https://img.shields.io/badge/runtime_deps-0-brightgreen)](package.json)

---

> **Note.** An earlier version of this project rotated user-agent strings and forged `X-Forwarded-For` / `X-Real-IP` headers, documented under a heading called "IP Protection". **That code has been removed** — the forged headers never masked the origin IP anyway, and evading employers' access controls isn't something this project should do. See [Responsible use](#responsible-use). Everything still works.

## Overview

Companies that use Workday all expose their careers data through the same public JSON endpoint pattern. Workday Radar queries those endpoints directly across ~150 employers, filters for analyst and data roles in the US, and shows everything in one auto-refreshing dashboard.

No Puppeteer, no scraping service, no runtime dependencies beyond React and Next.js. Just `fetch`.

## Screenshots

<!-- Add screenshots here:
![Dashboard](docs/screenshots/dashboard.png)
-->

## Features

- **~150 employers** across finance, tech, consulting, healthcare, defence, energy, retail and transport
- **Auto-refresh** every 5 minutes with a visible countdown
- **NEW badges** on postings that weren't present in the previous scan
- **Category filters** — Data Analyst, Business Analyst, BI/Power BI, Data Engineer, Financial, Operations, Compliance
- **Location filters** — All US, Remote, plus state-level regex matching for TX, NY, CA, IL, VA, GA, FL, WA
- **Industry filters** with colour-coded badges
- **Time windows** from 30 minutes to 24 hours
- **Free-text search** across title, company and location
- **Zero runtime dependencies** — `next`, `react`, `react-dom` only

## How it works

```
Browser dashboard (Next.js App Router)
        │  every 5 minutes
        ▼
GET /api/workday  (Vercel serverless, 60s max duration)
        │
        ├── batches of 8, Promise.allSettled
        │   so one failing company never breaks the run
        │
        ├── Open tenants
        │     POST https://{tenant}.wd1.myworkdayjobs.com/wday/cxs/{tenant}/{path}/jobs
        │     Public JSON, no session required
        │
        └── Session tenants
              1. GET the public careers page to obtain a session cookie
              2. POST the same jobs endpoint with that cookie
        │
        ▼
  De-duplicate by job id → keyword filter → sort newest first
        │
        ▼
  { jobs, total, companies, openTenants, sessionTenants, fetchedAt }
```

### Open vs. session tenants

Workday deployments fall into two groups. Some serve their jobs JSON to any request. Others require a session cookie that the careers page itself issues on first load. `app/lib/companies.ts` records which is which, so the fetcher takes the right path per company.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Runtime | Node.js serverless functions on Vercel (60s limit) |
| Dependencies | None beyond React and Next.js |

## Getting started

```bash
git clone https://github.com/vasanthkumarpulkam/Workdayradar.git
cd Workdayradar
npm install
npm run dev              # http://localhost:3000
```

No environment variables are required.

### Deploy

```bash
npm i -g vercel
vercel
```

Or import the repository at [vercel.com](https://vercel.com) → New Project. It deploys with no configuration.

## API reference

| Method | Endpoint | Query parameters |
|---|---|---|
| `GET` | `/api/workday` | `minutes` (window, default 30) · `onlyOpen` (skip session tenants) · `company` (name substring) |

```bash
curl "http://localhost:3000/api/workday?minutes=180&onlyOpen=true"
```

```json
{
  "jobs": [ ... ],
  "total": 42,
  "companies": 150,
  "openTenants": 65,
  "sessionTenants": 85,
  "fetchedAt": "2026-08-13T14:00:00.000Z",
  "windowMinutes": 180
}
```

## Project structure

```
Workdayradar/
├── app/
│   ├── page.tsx                 Dashboard UI, filters, auto-refresh
│   ├── layout.tsx
│   ├── globals.css
│   ├── api/workday/route.ts     Serverless aggregation endpoint
│   └── lib/
│       ├── companies.ts         Tenant registry: name, tenant, path, open flag
│       └── workdayFetcher.ts    Per-company fetch and normalisation
├── next.config.js
└── vercel.json
```

## Adding a company

Find the tenant and path from any Workday careers URL:

```
https://acme.wd1.myworkdayjobs.com/en-US/External
         ^^^^                            ^^^^^^^^
       tenant                              path
```

Then add an entry to `app/lib/companies.ts`:

```ts
{ name: "Acme Corp", tenant: "acme", path: "External", open: true },
```

Set `open: false` if the jobs endpoint returns 401/403 without a session cookie.

## Responsible use

This project reads **publicly accessible** career-site JSON — the same endpoints a Workday careers page calls from your browser when you visit it. It does not bypass authentication, and it should not attempt to bypass rate limiting or bot detection.

If you run or extend this:

- Send a single honest, identifying User-Agent. Do not rotate user agents to appear as different clients.
- Do not forge `X-Forwarded-For` or `X-Real-IP` headers. It doesn't hide your origin anyway — the TCP connection still comes from your host — and it's a clear attempt to evade access controls.
- Respect `robots.txt` and each employer's terms of service.
- Keep polling intervals conservative and cache aggressively.
- If a company asks you to stop, stop.

The point of this tool is to see public job postings sooner, not to hide from the people posting them.

## Known limitations

- Some tenant slugs in `companies.ts` are educated guesses and will fail silently
- No response caching — every dashboard load fans out ~150 outbound requests
- Many Workday endpoints omit a posting timestamp, so "newest first" is best-effort
- Vercel's 60-second function limit caps how many companies can be scanned per request

## Roadmap

- [x] Remove the header-spoofing code from `workdayFetcher.ts`
- [ ] Add response caching / ISR to cut redundant outbound requests
- [ ] Verify and prune invalid tenant slugs
- [ ] Persist scan history so NEW badges survive a page reload
- [ ] Email or webhook alerting on keyword matches

## Author

**Vasanth Kumar Pulkam** — [GitHub](https://github.com/vasanthkumarpulkam)
# 🎯 Workday Radar

A **dedicated, real-time Workday job intelligence dashboard** built specifically to monitor 150+ companies that use Workday ATS — all from one place.

## What It Does

- **Scans 150+ Workday companies** in parallel every 5 minutes
- **Session cookie handling** — automatically fetches and uses session cookies for companies that require them (JPMorgan, Boeing, Microsoft, Amazon, etc.)
- **IP rotation** — rotates User-Agent strings and spoofed IP headers to prevent detection/blocking
- **Open API tenants** — direct POST to companies with public Workday endpoints (no auth needed)
- **130+ job title keywords** — catches every analyst, engineer, BI, financial, ops, and compliance role
- **US-only filter** — automatically filters out international postings
- **NEW badge** — highlights jobs that weren't there last scan
- **5-minute auto-refresh** with countdown timer

## Architecture

```
Browser Dashboard (Next.js)
        ↓ every 5 min
/api/workday (Vercel Serverless)
        ↓ parallel batches of 8
┌─────────────────────────────────────────┐
│ Open Tenants (65+):                     │
│   POST /wday/cxs/{tenant}/{path}/jobs   │
│   No auth, direct JSON                  │
│                                         │
│ Session Tenants (85+):                  │
│   1. GET career page → grab cookies     │
│   2. POST jobs API with Cookie header   │
│   Covers: JPMorgan, Boeing, MSFT, etc.  │
└─────────────────────────────────────────┘
```

## Companies Covered (Sample)

| Category | Companies |
|---|---|
| Big Tech | Microsoft, Amazon, Google, Meta, Apple, IBM, Oracle, SAP, Salesforce |
| Finance | JPMorgan, Bank of America, Wells Fargo, Goldman Sachs, Capital One, USAA |
| Defense | Boeing, Lockheed, Northrop Grumman, Raytheon, L3Harris, Leidos, SAIC |
| Consulting | Deloitte, Accenture, KPMG, EY, PwC, Booz Allen, Guidehouse |
| Healthcare | UnitedHealth, CVS, Cigna, Humana, HCA, Johnson & Johnson |
| Energy | ExxonMobil, Chevron, Halliburton, ConocoPhillips, AT&T |
| Retail/Transport | Walmart, Target, FedEx, UPS, Southwest Airlines |
| ...and 100+ more | |

## Filters

- **Category**: Data Analyst, Business Analyst, BI/Power BI, Data Engineer, Financial, Operations, Compliance
- **Location**: All US, Remote, Texas, NY, California, Illinois, Georgia, Virginia, Florida
- **Time Window**: Last 30 min, 1hr, 3hr, 6hr, 12hr, 24hr
- **Remote Only** toggle
- **Open API Only** toggle (skip session-cookie companies)
- **Search** by title, company, or location

## Deploy to Vercel

```bash
git clone https://github.com/vasanthkumarpulkam/workday-radar.git
cd workday-radar
npm install
```

Connect to Vercel:
1. Go to vercel.com → New Project → Import from GitHub
2. Select `workday-radar` repo
3. Click Deploy — no env vars needed

Or via CLI:
```bash
npm i -g vercel
vercel
```

## Local Development

```bash
npm run dev
# Open http://localhost:3000
```

## IP Protection

The API route uses several techniques to avoid IP bans:
1. **User-Agent rotation** — 6 real browser UA strings, picked randomly per request
2. **X-Forwarded-For spoofing** — random IPs from AWS/GCP/Azure ranges
3. **Request staggering** — 200–500ms random delay between companies in a batch
4. **Batch size limiting** — max 8 parallel requests, not hammering all at once
5. **Session cookie reuse** — single handshake per company, then reuses the token

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Vercel** (serverless, 60s timeout)
- **No external dependencies** — pure fetch API, no Puppeteer, no Apify
