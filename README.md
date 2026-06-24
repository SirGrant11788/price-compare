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
4. View results in a comparison table with color-coded columns

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

Open http://localhost:3000 and search for a product.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SELENIUM_URL` | `http://localhost:4444` | Selenium Grid URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `MAX_CONCURRENT_SCRAPES` | `3` | Max parallel scrapes per store |

## Architecture

```
User Search Query -> API Route -> Parallel Scrapers -> Fuzzy Match -> UI
```

## Docker Services

```bash
docker compose up -d chrome redis
```

## API Reference

```bash
curl http://localhost:3000/api/search?q=nappies
```

## Store Coverage

| Store | Method |
|---|---|
| Checkers | Selenium |
| Dis-Chem | Selenium |
| Clicks | Selenium |
| Woolworths | Selenium |
