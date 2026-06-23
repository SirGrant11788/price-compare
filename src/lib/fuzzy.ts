import Fuse from 'fuse.js';
import type { ProductResult, ScraperResult } from '@/types';

/**
 * Normalize a product name for better matching.
 * Strips size info, pack counts, brackets, and common suffixes.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(\d+)\s*(pack|pk|pcs|ct|count|s|each)\b/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(size|no\.?)\s*[\d]+[\+]?\b/gi, '')
    .replace(/[\d]+\s*kg\b/gi, '')
    .replace(/[\d]+\s*g\b/gi, '')
    .replace(/[\d]+\s*ml\b/gi, '')
    .replace(/\b(jumbo|mega|super|maxi|mini|value|bulk|economy)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a product fingerprint for cross-store dedup.
 * Takes the first 3 significant words from the normalized name.
 */
function fingerprint(name: string): string {
  return normalizeName(name)
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .sort()
    .join(' ');
}

/** A comparison group: the same product as seen across different stores */
export interface ComparisonGroup {
  /** Best/full product name for display */
  displayName: string;
  /** Average price across all stores that have it (for sorting) */
  avgPrice: number;
  /** Best match score (0 = perfect) */
  matchScore: number;
  /** Fingerprint for dedup */
  fingerprint: string;
  /** One product per store (may be null if store doesn't stock it) */
  byStore: Record<string, ProductResult | null>;
  /** Which stores matched */
  stores: string[];
  /** Number of stores that have this product */
  matchCount: number;
}

/**
 * Cross-store fuzzy matching via Fuse.js.
 * Groups matching products into comparison groups.
 */
export function buildComparisonGroups(
  scraperResults: ScraperResult[],
  query: string
): ComparisonGroup[] {
  const storeResults = scraperResults.filter((r) => !r.error && r.products.length > 0);
  if (storeResults.length === 0) return [];

  const storeNames = storeResults.map((r) => r.store);

  // Build a map of normalized name → products per store
  const allProducts: { product: ProductResult; store: string; normalized: string; fp: string }[] = [];
  for (const sr of storeResults) {
    for (const p of sr.products) {
      allProducts.push({
        product: p,
        store: sr.store,
        normalized: normalizeName(p.name),
        fp: fingerprint(p.name),
      });
    }
  }

  // Group by fingerprint first (exact normalized match)
  const fpGroups = new Map<string, typeof allProducts>();
  for (const entry of allProducts) {
    const list = fpGroups.get(entry.fp) ?? [];
    list.push(entry);
    fpGroups.set(entry.fp, list);
  }

  // For remaining unmatched, use Fuse.js to find cross-store matches
  // Fuse index over all products
  const fuseIndex = new Fuse(allProducts, {
    keys: [
      { name: 'normalized', weight: 0.7 },
      { name: 'product.name', weight: 0.3 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 3,
    ignoreLocation: true,
  });

  // Build comparison groups: start with fingerprint exact matches
  const groups: ComparisonGroup[] = [];
  const assigned = new Set<string>(); // track which products are assigned

  // First pass: exact fingerprint matches
  for (const [, entries] of fpGroups) {
    if (entries.length === 0) continue;

    const group: ComparisonGroup = {
      displayName: entries[0].product.name,
      avgPrice: 0,
      matchScore: 0,
      fingerprint: entries[0].fp,
      byStore: {},
      stores: [],
      matchCount: 0,
    };

    let totalPrice = 0;
    for (const entry of entries) {
      const key = `${entry.store}::${entry.product.name}`;
      if (assigned.has(key)) continue;
      assigned.add(key);

      if (!group.byStore[entry.store]) {
        group.byStore[entry.store] = entry.product;
        group.stores.push(entry.store);
        totalPrice += entry.product.priceValue;
      } else {
        // If same store has multiple matching products, take the cheaper one
        const existing = group.byStore[entry.store]!;
        if (entry.product.priceValue < existing.priceValue) {
          group.byStore[entry.store] = entry.product;
          totalPrice = totalPrice - existing.priceValue + entry.product.priceValue;
        }
      }
    }

    group.matchCount = group.stores.length;
    group.avgPrice = group.matchCount > 0 ? totalPrice / group.matchCount : 0;
    group.displayName = entries.reduce((best, e) =>
      e.product.name.length > best.length ? e.product.name : best
    , entries[0].product.name);

    if (group.matchCount > 0) groups.push(group);
  }

  // Second pass: use Fuse.js to find cross-store matches for remaining products
  const remaining = allProducts.filter((entry) => {
    const key = `${entry.store}::${entry.product.name}`;
    return !assigned.has(key);
  });

  if (remaining.length > 0) {
    const remainingFuse = new Fuse(remaining, {
      keys: ['normalized', 'product.name'],
      threshold: 0.35,
      includeScore: true,
      minMatchCharLength: 3,
      ignoreLocation: true,
    });

    const processed = new Set<string>();

    for (const entry of remaining) {
      const key = `${entry.store}::${entry.product.name}`;
      if (processed.has(key) || assigned.has(key)) continue;

      const results = remainingFuse.search(entry.normalized);
      const matches = results.filter(
        (r) => r.item.store !== entry.store && !processed.has(`${r.item.store}::${r.item.product.name}`) && !assigned.has(`${r.item.store}::${r.item.product.name}`)
      );

      const group: ComparisonGroup = {
        displayName: entry.product.name,
        avgPrice: entry.product.priceValue,
        matchScore: 0,
        fingerprint: entry.fp,
        byStore: {},
        stores: [],
        matchCount: 1,
      };

      group.byStore[entry.store] = entry.product;
      group.stores.push(entry.store);
      processed.add(key);
      assigned.add(key);

      let totalPrice = entry.product.priceValue;

      for (const match of matches) {
        const mk = `${match.item.store}::${match.item.product.name}`;
        if (processed.has(mk) || assigned.has(mk)) continue;
        if (group.byStore[match.item.store]) continue; // one per store

        group.byStore[match.item.store] = match.item.product;
        group.stores.push(match.item.store);
        totalPrice += match.item.product.priceValue;
        group.matchCount++;
        processed.add(mk);
        assigned.add(mk);

        if (match.item.product.name.length > group.displayName.length) {
          group.displayName = match.item.product.name;
        }
      }

      group.avgPrice = group.matchCount > 0 ? totalPrice / group.matchCount : 0;
      group.matchScore = results.length > 0 && results[0].score != null ? results[0].score : 0;

      groups.push(group);
    }
  }

  // Fill in missing stores with null
  for (const group of groups) {
    for (const storeName of storeNames) {
      if (!group.byStore[storeName]) {
        group.byStore[storeName] = null;
      }
    }
  }

  // Sort: best match first (by match count desc, then avg price asc)
  groups.sort((a, b) => {
    if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount;
    return a.avgPrice - b.avgPrice;
  });

  return groups;
}

/**
 * Legacy merge function for backward compatibility.
 */
export function mergeResults(
  scraperResults: ScraperResult[],
  query: string
): {
  query: string;
  results: ScraperResult[];
  groups: ComparisonGroup[];
  totalResults: number;
  timestamp: string;
} {
  const groups = buildComparisonGroups(scraperResults, query);
  const totalResults = groups.reduce((sum, g) => sum + g.matchCount, 0);

  return {
    query,
    results: scraperResults,
    groups,
    totalResults,
    timestamp: new Date().toISOString(),
  };
}
