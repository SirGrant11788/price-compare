import { CheckersScraper } from '@/lib/scrapers/checkers';
import { DischemScraper } from '@/lib/scrapers/dischem';
import { ClicksScraper } from '@/lib/scrapers/clicks';
import { WoolworthsScraper } from '@/lib/scrapers/woolworths';
import { PnpScraper } from '@/lib/scrapers/pnp';
import { mergeResults } from '@/lib/fuzzy';
import { initRedis, getCached, setCached, cacheKey, closeRedis } from '@/lib/redis';
import type { SearchResponse, ScraperResult } from '@/types';
import { BaseScraper } from '@/lib/scrapers/base';

let redisInitialized = false;

/**
 * Next.js 16 Route Handler for price search
 *
 * GET /api/search?q=nappies
 *
 * Caches each store's results in Redis for 30 days (per-store granularity
 * so one expired store doesn't invalidate others). Falls back gracefully
 * to live scraping if Redis is unavailable.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return Response.json(
      { error: 'Missing query parameter: q' },
      { status: 400 }
    );
  }

  // Initialize Redis lazily on first request
  if (!redisInitialized) {
    await initRedis();
    redisInitialized = true;
  }

  const scrapers: BaseScraper[] = [
    new CheckersScraper(),
    new DischemScraper(),
    new ClicksScraper(),
    new WoolworthsScraper(),
    new PnpScraper(),
  ];

  try {
    const results: ScraperResult[] = await Promise.all(
      scrapers.map(async (scraper) => {
        const key = cacheKey(scraper.store, query);

        // Check cache first
        const cached = await getCached<ScraperResult>(key);
        if (cached) {
          console.log(`[Cache] HIT for ${scraper.store}:${query}`);
          return cached;
        }

        // Scrape live
        console.log(`[Cache] MISS for ${scraper.store}:${query} — scraping...`);
        const result = await scraper.search(query).catch((err) => ({
          store: scraper.store,
          products: [],
          error: err instanceof Error ? err.message : String(err),
        }));

        // Cache if successful (no error and has products or explicitly empty)
        if (!result.error) {
          await setCached(key, result);
        }

        return result;
      })
    );

    const merged = mergeResults(results, query);

    return Response.json(merged, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
