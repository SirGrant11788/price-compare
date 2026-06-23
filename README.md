# Price Compare

Search for any product and compare prices across **four South African retailers**:

- **Checkers Sixty60** — `www.checkers.co.za`
- **Dis-Chem** — `www.dischem.co.za`
- **Clicks** — `clicks.co.za`
- **Woolworths** — `www.woolworths.co.za`

Built with Next.js 16, React 19, Tailwind CSS 4, and TypeScript. Uses Selenium for browser-based scraping, Redis for caching, and Fuse.js for fuzzy matching across stores.

## How it works

1. Enter a product name (e.g. "nappies", "toilet paper", "dove soap")
2. The app scrapes all four retailers in **parallel** using Selenium via Chrome Grid
3. Results are fuzzy-matched using Fuse.js to group the same product across stores
4. View results in a comparison table with color-coded columns and BEST price highlighting

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Language | TypeScript |
| Scraping | Selenium WebDriver (Chrome Grid) |
| Caching | Redis 7 (30-day TTL per store) |
| Fuzzy Match | Fuse.js v7 |
| Containerization | Docker Compose |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Setup

```bash
# 1. Clone and install
git clone https://github.com/SirGrant11788/price-compare.git
cd price-compare
npm install

# 2. Configure environment
cp .env.example .env.local

# 3. Start Selenium Chrome and Redis
docker compose up -d chrome redis

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and search for a product.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SELENIUM_URL` | `http://localhost:4444` | Selenium Grid URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `MAX_CONCURRENT_SCRAPES` | `3` | Max parallel scrapes per store |

## Architecture

```
User Search Query
       |
       v
  Next.js API Route (/api/search?q=...)
       |
       +-- Redis cache check (per-store key)
       |       |
       |       +-- HIT -> return cached
       |       +-- MISS -> scrape
       |
       +-- Parallel Scrapers (Promise.all)
       |       |
       |       +-- CheckersScraper (Selenium -> checkers.co.za)
       |       +-- DischemScraper (Selenium -> dischem.co.za)
       |       +-- ClicksScraper (Selenium -> clicks.co.za)
       |       +-- WoolworthsScraper (Selenium -> woolworths.co.za)
       |       |
       |       +-- Each scraper: JSON extraction > DOM parsing > text fallback
       |
       +-- Fuse.js Fuzzy Matching
       |       |
       |       +-- Groups same products across stores
       |       +-- Sorts by match quality + price
       |
       +-- Redis cache update (per-store, 30 days)
       |
       v
  Comparison Table UI (4 columns, color-coded, BEST badge)
```

## Scraping Strategy

Each scraper uses a three-tier extraction approach:

1. **JSON extraction** (primary) — Parse `__NEXT_DATA__` or JSON-LD from the page source for clean, structured data
2. **DOM parsing** (fallback) — Extract product name, price, URL, and image from rendered HTML elements
3. **Text extraction** (last resort) — Split visible text by lines, find product name and price by pattern matching

All scrapers include:
- Cookie banner dismissal
- Configurable wait times for JavaScript rendering
- 30-second element timeout
- Browser fingerprint evasion (user-agent rotation, disabled automation flags)
- Concurrency limiting (max 3 parallel scrapes per store)

## Docker Services

```bash
# Start all services
docker compose up -d

# Start individual services
docker compose up -d chrome   # Selenium Chrome standalone
docker compose up -d redis    # Redis 7 for caching
```

## API Reference

### GET /api/search?q={product}

Returns a JSON response with:
- `query` — The search term
- `results` — Array of per-store scrape results
- `groups` — Fuzzy-matched comparison groups for the UI
- `totalResults` — Total matched products
- `timestamp` — When the search was performed

Example:
```bash
curl http://localhost:3000/api/search?q=nappies
```

## Store Coverage

| Store | Method | Notes |
|---|---|---|
| Checkers | Selenium | `.product-card_product-name` and `.price-display_full` selectors |
| Dis-Chem | Selenium | `a.product-item-link` + img alt fallback, filters promo badges |
| Clicks | Selenium | `a[title]` attribute for full product names, h5 + p fallback |
| Woolworths | Selenium | `__NEXT_DATA__` JSON extraction, article-based DOM fallback |

## Comparison Table

- **Columns**: One per store (color-coded: green, blue, purple, orange)
- **Rows**: Products fuzzy-matched across stores (same product in different stores)
- **Empty cells**: Store doesn't carry that product (or name variation didn't match)
- **BEST badge**: Green pill on the cheapest matching product
- **Sort**: Most stores matched first, then by average price ascending
