# Price Compare

Multi-store price comparison tool. Currently scrapes Clicks, Dis-Chem, Checkers, and PnP.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Selenium WebDriver (remote Grid)
- Redis caching
- `xlsx` for Excel export

## Running

```bash
npm run dev
```

Requires:
- Redis instance (default localhost:6379)
- Selenium Grid / Chrome standalone (default localhost:4444)

## Bulk Search

Enter multiple products, one per line, to compare prices across all stores simultaneously. Each product gets its own tab with its own comparison table.

## Excel Export

Results from single searches or bulk searches can be downloaded as `.xlsx` with one sheet per product and a combined summary sheet.
