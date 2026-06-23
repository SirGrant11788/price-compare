import Fuse from 'fuse.js';
import type { ProductResult, ScraperResult } from '@/types';

function normalizeName(name: string): string {
  let n = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Strip pack/size info
    .replace(/\b\d+\s*(pack|pk|pcs|ct|count|s|each|sheets|roll|ply)\b/gi, '')
    // Strip parenthetical content
    .replace(/\([^)]*\)/g, '')
    // Strip size/no indicators
    .replace(/\b(size|no\.?|number)\s*[\d]+[\+]?\b/gi, '')
    // Strip weights and measures
    .replace(/[\d]+[,.]?[\d]*\s*(kg|g|ml|l|oz|lb|cm|mm|inch)\b/gi, '')
    // Strip standalone numbers
    .replace(/\b\d+(\.\d+)?\b/g, '')
    // Strip size descriptors
    .replace(/\b(jumbo|mega|super|maxi|mini|value|bulk|economy|extra|twin|triple|family|large|medium|small)\b/gi, '')
    // Strip punctuation
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common leading brand words that differ per store
  const genericBrands = ['checkers', 'dis-chem', 'clicks', 'woolworths', 'housebrand', 'own brand', 'everyday'];
  for (const b of genericBrands) {
    n = n.replace(new RegExp(`\\b${b}\\b`, 'gi'), '');
  }

  return n.replace(/\s+/g, ' ').trim();
}

function fingerprint(name: string): string {
  return normalizeName(name)
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .sort()
    .join(' ');
}

export interface ComparisonGroup {
  displayName: string;
  avgPrice: number;
  matchScore: number;
  fingerprint: string;
  byStore: Record<string, ProductResult | null>;
  stores: string[];
  matchCount: number;
}

export function buildComparisonGroups(
  scraperResults: ScraperResult[],
  _query: string
): ComparisonGroup[] {
  const storeResults = scraperResults.filter((r) => !r.error && r.products.length > 0);
  if (storeResults.length === 0) return [];

  const storeNames = storeResults.map((r) => r.store);

  // Build indexed product entries
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

  // First pass: exact fingerprint matches
  const fpGroups = new Map<string, typeof allProducts>();
  for (const entry of allProducts) {
    const list = fpGroups.get(entry.fp) ?? [];
    list.push(entry);
    fpGroups.set(entry.fp, list);
  }

  const groups: ComparisonGroup[] = [];
  const assigned = new Set<string>();

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

  // Second pass: Fuse.js for cross-store fuzzy matching remainders
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
        (r) =>
          r.item.store !== entry.store &&
          !processed.has(`${r.item.store}::${r.item.product.name}`) &&
          !assigned.has(`${r.item.store}::${r.item.product.name}`)
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
        if (group.byStore[match.item.store]) continue;

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

  // Fill missing stores with null
  for (const group of groups) {
    for (const storeName of storeNames) {
      if (!(storeName in group.byStore)) {
        group.byStore[storeName] = null;
      }
    }
  }

  // Sort: most stores matched first, then by avg price ascending
  groups.sort((a, b) => {
    if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount;
    return a.avgPrice - b.avgPrice;
  });

  return groups;
}

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
