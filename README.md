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


