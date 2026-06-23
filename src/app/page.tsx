'use client';

import { useState, useCallback, FormEvent } from 'react';
import type { SearchResponse, ScraperResult } from '@/types';

interface SortedProduct {
  name: string;
  price: string;
  priceValue: number;
  store: string;
  url: string;
  imageUrl?: string;
  unitPrice?: string;
  inStock: boolean;
  matchScore: number;
}

/** Group sorted products by store for display */
function groupByStore(products: SortedProduct[]): Map<string, SortedProduct[]> {
  const groups = new Map<string, SortedProduct[]>();
  for (const p of products) {
    const list = groups.get(p.store) ?? [];
    list.push(p);
    groups.set(p.store, list);
  }
  return groups;
}

/** Compute the merged+sorted list from raw scraper results */
function computeSorted(results: ScraperResult[], query: string): SortedProduct[] {
  // Naive fuse-like scoring: simple name substring matching
  const q = query.toLowerCase();
  const qWords = q.split(/\s+/).filter(Boolean);
  const all: SortedProduct[] = [];

  for (const r of results) {
    if (r.error || r.products.length === 0) continue;
    for (const p of r.products) {
      const name = p.name.toLowerCase();
      // Count how many query words appear in the product name
      const matchCount = qWords.filter((w) => name.includes(w)).length;
      const exactBonus = name.includes(q) ? 0.3 : 0;
      const score = Math.max(0, 1 - (matchCount / qWords.length) * 0.8 + exactBonus);
      all.push({ ...p, matchScore: 1 - Math.min(score, 0.99) });
    }
  }

  all.sort((a, b) => {
    const scoreDiff = a.matchScore - b.matchScore;
    if (Math.abs(scoreDiff) > 0.05) return scoreDiff;
    return a.priceValue - b.priceValue;
  });

  return all;
}

const STORE_COLORS: Record<string, string> = {
  'Checkers Sixty60': 'bg-green-600',
  'Dis-Chem': 'bg-blue-600',
  'Clicks': 'bg-purple-600',
  'Woolworths': 'bg-orange-600',
};

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sorted, setSorted] = useState<SortedProduct[]>([]);

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;

      setLoading(true);
      setError(null);
      setData(null);
      setSorted([]);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const json: SearchResponse = await res.json();
        setData(json);
        setSorted(computeSorted(json.results, q));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  const groups = groupByStore(sorted);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Price Compare
        </h1>
        <p className="mb-6 text-gray-500">
          Search for a product and compare prices across South African retailers.
        </p>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-8 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. nappies, milk, bread..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="mb-6 flex items-center gap-2 text-gray-500">
            <svg
              className="h-5 w-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Searching {data ? 'more' : 'all retailers'}...
            {data &&
              data.results.map((r) => (
                <span
                  key={r.store}
                  className={`rounded px-2 py-0.5 text-xs font-medium text-white ${STORE_COLORS[r.store] ?? 'bg-gray-500'}`}
                >
                  {r.store}
                </span>
              ))}
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <>
            {/* Summary row */}
            <div className="mb-6 text-sm text-gray-500">
              Found {sorted.length} product{ sorted.length !== 1 ? 's' : ''} across{' '}
              {groups.size} retailer{ groups.size !== 1 ? 's' : ''}
            </div>

            {sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
                No products found for &ldquo;{data.query}&rdquo;.{' '}
                <br />
                Try a different search term.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Sorted table: all products, best match first */}
                <div className="rounded-lg border bg-white shadow-sm">
                  <div className="border-b bg-gray-50 px-4 py-3 font-medium text-gray-700">
                    All Results (sorted by relevance & price)
                  </div>
                  <div className="divide-y">
                    {sorted.map((product, i) => (
                      <div
                        key={`${product.store}-${product.name}-${i}`}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                      >
                        {/* Image */}
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-gray-300">
                              No img
                            </div>
                          )}
                        </div>

                        {/* Name + URL */}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium text-gray-900">
                            {product.url ? (
                              <a
                                href={product.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-600 hover:underline"
                              >
                                {product.name}
                              </a>
                            ) : (
                              product.name
                            )}
                          </div>
                          {product.unitPrice && (
                            <div className="text-xs text-gray-400">
                              {product.unitPrice}
                            </div>
                          )}
                        </div>

                        {/* Store badge */}
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium text-white ${
                            STORE_COLORS[product.store] ?? 'bg-gray-500'
                          }`}
                        >
                          {product.store}
                        </span>

                        {/* Price */}
                        <div className="shrink-0 text-right">
                          <div className="text-lg font-bold text-gray-900">
                            {product.price}
                          </div>
                          {!product.inStock && (
                            <div className="text-xs text-red-500">
                              Out of stock
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Breakdown by store */}
                <h2 className="pt-4 text-xl font-semibold text-gray-800">
                  By Retailer
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from(groups.entries()).map(([store, products]) => (
                    <div
                      key={store}
                      className="rounded-lg border bg-white shadow-sm"
                    >
                      <div
                        className={`rounded-t-lg px-4 py-2 font-medium text-white ${
                          STORE_COLORS[store] ?? 'bg-gray-600'
                        }`}
                      >
                        {store}
                        <span className="ml-2 text-sm opacity-80">
                          ({products.length})
                        </span>
                      </div>
                      <div className="divide-y">
                        {products.slice(0, 5).map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 px-4 py-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm text-gray-900">
                                {p.url ? (
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-blue-600 hover:underline"
                                  >
                                    {p.name}
                                  </a>
                                ) : (
                                  p.name
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-sm font-semibold">
                              {p.price}
                            </div>
                          </div>
                        ))}
                        {products.length > 5 && (
                          <div className="px-4 py-2 text-xs text-gray-400">
                            +{products.length - 5} more
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
