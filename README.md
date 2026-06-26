# Price Compare (meep)

Multi-store price comparison tool for South African retailers. Enter a
product and get real-time prices from **Checkers (Sixty60)**, **Clicks**,
**Dis-Chem**, **Pick n Pay**, and **Woolworths** — side by side, colour-coded,
and sorted by price.

Supports single and bulk search, fuzzy grouping of similar items across stores,
Redis caching (30-day TTL), and Excel export.

---

## Features

- **Single search** — Query all five stores at once; results grouped by product
  with colour-coded price tables sorted cheapest-first
- **Bulk search** — Enter multiple products (one per line); each gets its own
  comparison table with tabs for easy navigation
- **Fuzzy matching** — Auto-grouped by product name via `fuse.js` so similar
  items appear side by side across stores (e.g. "Ultra Whey" and "Whey Protein")
- **Excel export** — Download results as a formatted `.xlsx` with per-product
  sheets plus a combined summary sheet
- **Redis caching** — 30-day per-store TTL; repeat searches return instantly
- **Graceful degradation** — Each scraper runs independently; one store failure
  doesn't block the rest
- **Configurable concurrency** — Up to 3 concurrent Selenium sessions (tune via
  `MAX_CONCURRENT_SCRAPES`)

---

## Docker Compose (Recommended)

A single `docker compose up` brings up three containers:

| Service   | Container name            | Port  | Purpose                           |
|-----------|---------------------------|-------|-----------------------------------|
| `app`     | `price-compare`           | :3000 | Next.js app (UI + API routes)     |
| `redis`   | `price-compare-redis`     | :6379 | Result cache (30-day TTL per store) |
| `selenium`| `price-compare-selenium`  | :4444 | Chrome WebDriver grid             |

### First-time startup

```bash
git clone <repo-url>
cd price-compare
docker compose up --build -d
```

This builds the Docker image (multi-stage Alpine: `npm install` → `next build` →
standalone runner), pulls `redis:7-alpine` and `selenium/standalone-chrome` if
not cached locally, then starts all three containers. The first build takes
2-5 minutes depending on your connection speed.

### Subsequent startups

```bash
docker compose up -d
```

### Verify everything is running

```bash
# Container status
docker compose ps

# App responds
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000
# -> 200

# Redis responds
docker exec price-compare-redis redis-cli ping
# -> PONG

# Selenium Grid is ready
curl -s http://localhost:4444/status | jq .value.ready
# -> true
```

### Stop the stack

```bash
docker compose down
```

Add `-v` to also delete the Redis volume (clears all cached results):

```bash
docker compose down -v
```

### Rebuild after code changes

```bash
docker compose build app
docker compose up -d
```

### View logs

```bash
# All services (follow mode)
docker compose logs -f

# Single service
docker compose logs -f app
docker compose logs -f selenium
docker compose logs -f redis
```

### Health checks

Both `redis` and `selenium` have built-in health checks in the Compose file.
The `app` container waits for them via `depends_on` with
`condition: service_started`.

```bash
docker inspect --format='{{json .State.Health}}' price-compare-redis
docker inspect --format='{{json .State.Health}}' price-compare-selenium
```

### VNC into Selenium (debugging)

Enable the VNC display to watch the Chrome browser as it scrapes in real time:

```bash
SE_VNC_PASSWORD=secret docker compose up -d
```

Then connect to `localhost:5900` with any VNC viewer.

---

## Environment Variables

Create a `.env.local` in the project root to override defaults:

```bash
cp .env.example .env.local
```

### Docker Compose defaults (work out of the box)

| Variable            | Default                        | Description                                                    |
|---------------------|--------------------------------|----------------------------------------------------------------|
| `REDIS_URL`         | `redis://redis:6379`           | Redis connection string. Omit or set empty to disable caching. |
| `SELENIUM_URL`      | `http://selenium:4444`         | Selenium Grid hub URL. Used by all scrapers except Checkers.   |
| `CHECKERS_API_URL`  | `http://host.docker.internal:3001` | External Checkers Sixty60 search microservice URL.         |
| `DISABLE_CACHE`     | unset                          | Set to `true` to skip Redis entirely (read + write).           |
| `NODE_ENV`          | `production`                   | Controls Next.js behaviour.                                    |
| `SE_VNC_PASSWORD`   | unset                          | Enables VNC access to the Selenium Chrome node (see debugging).|

Within Docker Compose, hostnames `redis` and `selenium` resolve via Docker's
internal DNS. No `.env.local` needed for a basic start.

### Bare-metal / development overrides

These use `localhost` addresses (documented in `.env.example`):

```bash
REDIS_URL=redis://localhost:6379
SELENIUM_URL=http://localhost:4444
MAX_CONCURRENT_SCRAPES=3
NODE_ENV=development
```

### Checkers API dependency

Checkers uses an external Sixty60 search microservice (separate repo:
[checkers-sixty60-search](https://github.com/grantverheul/checkers-sixty60-search)).
Set `CHECKERS_API_URL` to point at a running instance. The default
(`http://host.docker.internal:3001`) assumes the service is on the Docker host
at port 3001.

If the Checkers API is unreachable, the Checkers scraper returns an error but
all other stores continue to work.

---

## Architecture

```
                   +-------------------------------------------+
                   |              Next.js App                   |
                   |                :3000                       |
                   |                                            |
+----------+       |    +---------------------------+           |
| Browser  |------>|    |     API Routes            |           |
| (UI)     |       |    |                           |           |
+----------+       |    |  GET  /api/search         |---->  +------------------+
                   |    |  POST /api/bulk-search    |       |  Redis (cache)   |
                   |    |  GET  /api/export         |       |  :6379           |
                   |    +------------+--------------+       +------------------+
                   +-----------------+--------------------------+
                                    |
                     +--------------v--------------+
                     |    Selenium Grid             |
                     |    :4444 (Chrome)            |
                     |    shm_size: 2gb             |
                     |    max_sessions: 3           |
                     +--------------+--------------+
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
   +--------------+          +--------------+          +--------------+
   |   Clicks     |          |  Dis-Chem    |          |  PnP / WW    |
   | (Selenium)   |          | (Selenium)   |          | (Selenium)   |
   +--------------+          +--------------+          +--------------+

   +--------------------+
   |   Checkers         |  <- external Sixty60 microservice
   |  (HTTP API)        |     (separate repo)
   +--------------------+
```

Each search request fans out to all stores in parallel. Results are merged,
fuzzy-matched by product name, and returned to the UI. Redis caches raw
responses per store with a 30-day TTL.

---

## API

### `GET /api/search?q=<product>`

Search a single product across all stores.

**Response:**

```json
{
  "results": [
    {
      "store": "Checkers",
      "product": "Ultra Whey Protein",
      "price": 549.99,
      "pricePerUnit": 10.99,
      "unit": "100g",
      "url": "https://...",
      "image": "https://..."
    }
  ],
  "errors": [],
  "timings": { "total_ms": 4230 }
}
```

### `POST /api/bulk-search`

Search multiple products in one request. Each gets its own fuzzy-matched
comparison table.

**Request body:**

```json
{ "queries": ["whey protein", "creatine"] }
```

### `GET /api/export`

Download all current in-memory results as a formatted `.xlsx` file. Requires
a prior search.

```bash
curl -o results.xlsx 'http://localhost:3000/api/export'
```

---

## Live Search (curl)

Once the stack is running, test it without opening a browser:

```bash
# Single product
curl -s 'http://localhost:3000/api/search?q=whey+protein' | jq .

# Bulk search (multiple products at once)
curl -s -X POST http://localhost:3000/api/bulk-search \
  -H 'Content-Type: application/json' \
  -d '{"queries": ["whey protein", "creatine", "multivitamin"]}' | jq .

# Export results to Excel
curl -o results.xlsx 'http://localhost:3000/api/export'
```

---

## Scrapers

Each store runs as an independent scraper in `src/lib/scrapers/`:

| Store     | File            | Method        | Dependencies                             |
|-----------|-----------------|---------------|------------------------------------------|
| Checkers  | `checkers.ts`   | HTTP API      | External Sixty60 microservice (`CHECKERS_API_URL`) |
| Clicks    | `clicks.ts`     | Selenium      | Selenium Grid (`:4444`)                  |
| Dis-Chem  | `dischem.ts`    | Selenium      | Selenium Grid (`:4444`)                  |
| Pick n Pay| `pnp.ts`        | Selenium      | Selenium Grid (`:4444`)                  |
| Woolworths| `woolworths.ts` | Selenium      | Selenium Grid (`:4444`)                  |

All Selenium-based scrapers share a single Chrome node.
`SE_NODE_MAX_SESSIONS: 3` allows up to 3 concurrent scrapes. Selenium timeout
defaults to 60 seconds per session.

---

## Tech Stack

| Layer          | Technology                                             |
|----------------|--------------------------------------------------------|
| Framework      | Next.js 16 (App Router, `output: standalone`)          |
| UI             | React 19                                               |
| Styling        | Tailwind CSS 4                                         |
| Language       | TypeScript                                             |
| Scraping       | Selenium WebDriver + Selenium Grid (Chrome)            |
| Caching        | Redis 7 (optional, 30-day TTL)                         |
| Containerisation| Docker Compose (multi-stage Alpine build)             |
| Excel          | `xlsx` npm package                                     |
| Fuzzy matching | `fuse.js`                                              |

---

## Project Structure

```
price-compare/
+-- docker-compose.yml        # Full stack: app + redis + selenium
+-- Dockerfile                # Multi-stage build (deps -> builder -> runner)
+-- .env.example              # Bare-metal env var reference
+-- next.config.ts            # output: "standalone" for Docker
+-- package.json
+-- tsconfig.json
+-- src/
|   +-- app/
|   |   +-- layout.tsx        # Root layout
|   |   +-- page.tsx          # Main search UI
|   |   +-- globals.css
|   |   +-- api/
|   |       +-- search/route.ts       # GET /api/search
|   |       +-- bulk-search/route.ts  # POST /api/bulk-search
|   |       +-- export/route.ts       # GET /api/export (Excel)
|   +-- components/
|   |   +-- ComparisonTable.tsx
|   +-- lib/
|   |   +-- scrapers/
|   |   |   +-- base.ts              # Abstract scraper base class
|   |   |   +-- checkers.ts
|   |   |   +-- clicks.ts
|   |   |   +-- dischem.ts
|   |   |   +-- pnp.ts
|   |   |   +-- woolworths.ts
|   |   +-- constants.ts
|   |   +-- fuzzy.ts                 # Fuse.js matching
|   |   +-- redis.ts                 # Redis cache client
|   +-- types/
|       +-- index.ts
+-- README.md
```

---

## Development (Bare Metal)

### Prerequisites

- Node.js 22+
- Docker (for Redis and Selenium — or run them natively)

### Run locally

```bash
# Start dependencies
docker run -d -p 6379:6379 redis:7-alpine
docker run -d -p 4444:4444 --shm-size=2gb selenium/standalone-chrome:latest

# Configure for localhost
cp .env.example .env.local

# Install and run
npm install
npm run dev
```

### Lint

```bash
npm run lint
```

---

## Troubleshooting

### Selenium / Chrome crashes

The Compose stack uses `selenium/standalone-chrome` with `shm_size: 2gb` to
avoid `/dev/shm` exhaustion. If running outside Docker, ensure Chrome and
Java (JRE 11+) are installed and allocate enough shared memory.

Verify Selenium Grid is responsive:

```bash
curl -s http://localhost:4444/status | jq .
```

### "No available storage" from Chrome

Selenium's shared memory (`/dev/shm`) fills up under load. The Compose config
allocates 2 GB. If running lots of concurrent searches, increase `shm_size` in
`docker-compose.yml`. On bare metal, remount `/dev/shm` with a larger size.

### Redis connection errors

The app degrades gracefully without Redis — scrapers still run, results are
returned fresh each time. Omit `REDIS_URL` or set `DISABLE_CACHE=true` to
skip caching entirely.

### Excel export fails

The `xlsx` package generates the file server-side. Check the app container
logs for errors — typically a memory issue with very large result sets.

### Checkers returns no results

Checkers uses an external Sixty60 search microservice running separately. Make
sure `CHECKERS_API_URL` points to a running instance. The default
(`http://host.docker.internal:3001`) assumes the service is on the Docker host
at port 3001.

### Container won't start — port already in use

Ports 3000, 6379, or 4444 are already bound on your host. Either stop the
conflicting service, or change the host port mapping in `docker-compose.yml`
(e.g. `"3001:3000"` for the app).

### Need to inspect the Selenium browser

Enable VNC as described in the VNC debugging section above, then connect with
any VNC client to watch the scraping in real time.
