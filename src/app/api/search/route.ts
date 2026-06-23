import { CheckersScraper } from '@/lib/scrapers/checkers';
import { DischemScraper } from '@/lib/scrapers/dischem';
import { ClicksScraper } from '@/lib/scrapers/clicks';
import { WoolworthsScraper } from '@/lib/scrapers/woolworths';
import { mergeResults } from '@/lib/fuzzy';
import type { SearchResponse, ScraperResult } from '@/types';
import { BaseScraper } from '@/lib/scrapers/base';

/**
 * Next.js 16 Route Handler for price search
 *
 * GET /api/search?q=nappies
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

  // Run all scrapers in parallel
  const scrapers: BaseScraper[] = [
    new CheckersScraper(),
    new DischemScraper(),
    new ClicksScraper(),
    new WoolworthsScraper(),
  ];

  try {
    const results: ScraperResult[] = await Promise.all(
      scrapers.map((scraper) =>
        scraper
          .search(query)
          .catch((err) => ({
            store: scraper.store,
            products: [],
            error: err instanceof Error ? err.message : String(err),
          }))
      )
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
