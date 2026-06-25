import { CheckersScraper } from '@/lib/scrapers/checkers';
import { DischemScraper } from '@/lib/scrapers/dischem';
import { ClicksScraper } from '@/lib/scrapers/clicks';
import { WoolworthsScraper } from '@/lib/scrapers/woolworths';
import { mergeResults } from '@/lib/fuzzy';
import { initRedis, getCached, setCached, cacheKey, closeRedis } from '@/lib/redis';
import { BaseScraper } from '@/lib/scrapers/base';
import type { SingleProductResult, ScraperResult } from '@/types';

let redisInitialized = false;

const scrapers: BaseScraper[] = [
  new CheckersScraper(),
  new DischemScraper(),
  new ClicksScraper(),
  new WoolworthsScraper(),
];

/**
 * Run a single product query against all four scrapers with caching.
 */
async function searchSingleProduct(query: string): Promise<SingleProductResult> {
  const result = await Promise.all(
    scrapers.map(async (scraper) => {
      const key = cacheKey(scraper.store, query);

      // Check cache first
      const cached = await getCached<ScraperResult>(key);
      if (cached) {
        console.log(`[BulkCache] HIT for ${scraper.store}:${query}`);
        return cached;
      }

      // Scrape live
      console.log(`[BulkCache] MISS for ${scraper.store}:${query} — scraping...`);
      const result = await scraper.search(query).catch((err) => ({
        store: scraper.store,
        products: [],
        error: err instanceof Error ? err.message : String(err),
      }));

      if (!result.error) {
        await setCached(key, result);
      }

      return result;
    })
  );

  const merged = mergeResults(result, query);
  return {
    query,
    groups: merged.groups,
    results: merged.results,
    totalResults: merged.totalResults,
    timestamp: merged.timestamp,
  };
}

/**
 * POST /api/bulk-search
 *
 * Accepts a JSON body: { queries: string[] }
 * Runs each query through all scrapers in parallel and returns per-query results.
 */
export async function POST(request: Request): Promise<Response> {
  // Initialize Redis lazily
  if (!redisInitialized) {
    await initRedis();
    redisInitialized = true;
  }

  try {
    const body = await request.json() as { queries?: string[] };
    const queries = (body.queries ?? [])
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 0);

    if (queries.length === 0) {
      return Response.json(
        { error: 'Missing or empty queries array' },
        { status: 400 }
      );
    }

    // Cap at 20 queries to avoid resource exhaustion
    const capped = queries.slice(0, 20);
    if (capped.length < queries.length) {
      console.warn(`[BulkSearch] Capped ${queries.length} queries to 20`);
    }

    // Run all queries concurrently
    const results = await Promise.all(
      capped.map((q: string) => searchSingleProduct(q))
    );

    return Response.json({
      results,
      totalQueries: results.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
