'use client';

import { useState, useCallback, FormEvent } from 'react';
import type { ScraperResult } from '@/types';
import { buildComparisonGroups, type ComparisonGroup } from '@/lib/fuzzy';
import ComparisonTable from '@/components/ComparisonTable';

interface SearchData {
  query: string;
  results: ScraperResult[];
  groups: ComparisonGroup[];
  totalResults: number;
  timestamp: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;

      setLoading(true);
      setError(null);
      setData(null);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();

        // Build comparison groups from the raw results
        const groups = buildComparisonGroups(json.results, q);

        setData({
          query: json.query,
          results: json.results,
          groups,
          totalResults: json.totalResults ?? groups.reduce((sum: number, g: ComparisonGroup) => sum + g.matchCount, 0),
          timestamp: json.timestamp,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
            Price Compare
          </h1>
          <p className="mt-2 text-base text-gray-500">
            Compare prices across Checkers, Dis-Chem, Clicks &amp; Woolworths
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mx-auto mb-10 max-w-2xl">
          <div className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-4 h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. nappies, milk, bread..."
              className="w-full rounded-xl border border-gray-300 bg-white py-4 pl-12 pr-4 text-lg shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching
                </span>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mx-auto mb-8 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Loading bars */}
        {loading && (
          <div className="mx-auto max-w-2xl space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl bg-white p-4 shadow-sm">
                <div className="flex gap-4">
                  <div className="h-14 w-14 rounded-lg bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                  <div className="h-6 w-20 rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <>
            {/* Summary */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-500">
                Found{' '}
                <span className="font-semibold text-gray-700">{data.results.reduce((sum, r) => sum + r.products.length, 0)}</span>{' '}
                products in{' '}
                <span className="font-semibold text-gray-700">{data.results.filter((r) => r.products.length > 0).length}</span>{' '}
                stores
              </p>
              <div className="flex gap-2">
                {data.results
                  .filter((r) => r.products.length > 0)
                  .map((r) => (
                    <span
                      key={r.store}
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor:
                          r.store === 'Checkers'
                            ? '#16a34a'
                            : r.store === 'Dis-Chem'
                              ? '#2563eb'
                              : r.store === 'Clicks'
                                ? '#9333ea'
                                : '#ea580c',
                      }}
                    >
                      {r.store} ({r.products.length})
                    </span>
                  ))}
              </div>
            </div>

            {/* Comparison Table */}
            <ComparisonTable groups={data.groups} query={data.query} />

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-gray-400">
              {data.groups.length} comparison groups &middot;{' '}
              {new Date(data.timestamp).toLocaleTimeString()}
            </p>
          </>
        )}

        {/* Empty state */}
        {!data && !loading && !error && (
          <div className="mt-16 text-center">
            <div className="mb-4 text-6xl">🛒</div>
            <p className="text-lg text-gray-400">
              Search for a product to compare prices
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
