import Fuse from 'fuse.js';
import type { ProductResult, SearchResponse, ScraperResult } from '@/types';

/**
 * Fuzzy-matches scraped product names against the user's search query.
 * Returns a scored `ProductResult` with a 'matchScore' field appended.
 */
export interface ScoredProduct extends ProductResult {
  matchScore: number;
}

export function scoreProducts(
  products: ProductResult[],
  query: string,
  store: string
): ScoredProduct[] {
  if (products.length === 0) return [];

  const fuse = new Fuse(products, {
    keys: [
      { name: 'name', weight: 0.8 },
      { name: 'store', weight: 0.2 },
    ],
    threshold: 0.5,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  });

  const results = fuse.search(query);

  // Map results to scored products (lower score = better match)
  return results.map((result) => ({
    ...result.item,
    matchScore: result.score ?? 1,
  }));
}

/**
 * Merge and rank results from all scrapers.
 * Products that better match the query float to the top.
 */
export function mergeResults(
  scraperResults: ScraperResult[],
  query: string
): SearchResponse {
  const allScored: ScoredProduct[] = [];

  for (const result of scraperResults) {
    if (result.error || result.products.length === 0) continue;
    const scored = scoreProducts(result.products, query, result.store);
    allScored.push(...scored);
  }

  // Sort by match score (best match first), then by price (cheapest first)
  allScored.sort((a, b) => {
    const scoreDiff = a.matchScore - b.matchScore;
    if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
    return a.priceValue - b.priceValue;
  });

  return {
    query,
    results: scraperResults,
    totalResults: allScored.length,
    timestamp: new Date().toISOString(),
  };
}
