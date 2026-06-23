# Price Compare

Search for any product and compare prices across **four South African retailers**:

- **Checkers Sixty60** (via local scraper API)
- **Dis-Chem**
- **Clicks**
- **Woolworths**

Built with Next.js 16, React 19, Tailwind CSS 4, and TypeScript. Uses fuzzy matching (Fuse.js) to handle naming differences and availability gaps.

## How it works

1. Enter a product name (e.g. "nappies", "milk", "bread")
2. The app scrapes all four retailers in parallel server-side
3. Results are merged, fuzzy-matched against your query, and sorted by relevance + price
4. View all results in one table or broken down by store

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Description |
|---|---|---|
| `CHECKERS_API_URL` | No | Base URL for the Checkers Sixty60 scraper API (default: `http://localhost:3001`) |

The Checkers scraper depends on the separate [Sixty60-Search](https://github.com/SirGrant11788/Sixty60-Search) API server running locally for product data. The other three retailers are scraped via HTTP requests from the Next.js server.

## Project Structure

```
src/
  app/
    api/search/route.ts   -- API endpoint (parallel scraper orchestration)
    page.tsx              -- Main search UI
    layout.tsx            -- Root layout
  lib/
    scrapers/
      base.ts             -- Abstract scraper class
      checkers.ts         -- Checkers Sixty60 (via local API)
      dischem.ts          -- Dis-Chem HTML scraper
      clicks.ts           -- Clicks HTML scraper
      woolworths.ts       -- Woolworths HTML scraper
    fuzzy.ts              -- Fuse.js matching + result merging
  types/
    index.ts              -- Shared TypeScript types
```

## API

```
GET /api/search?q=nappies
```

Returns JSON with merged results sorted by match quality and price. Each result includes store name, price, product URL, and availability.

## Dev

```bash
npm run dev     # Start dev server
npm run build   # Production build
npm run start   # Run production build
```
