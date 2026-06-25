'use client';

import { useState, useCallback, FormEvent, useRef } from 'react';
import type { ScraperResult } from '@/types';
import { buildComparisonGroups, type ComparisonGroup } from '@/lib/fuzzy';
import ComparisonTable from '@/components/ComparisonTable';
import { STORE_COLORS, DEFAULT_STORE_COLOR } from '@/lib/constants';

interface SearchData {
  query: string;
  results: ScraperResult[];
  groups: ComparisonGroup[];
  totalResults: number;
  timestamp: string;
}

interface BulkSearchData {
  queries: string[];
  allGroups: ComparisonGroup[][];
  allResults: ScraperResult[][];
  totalProducts: number;
  timestamp: string;
}

type Mode = 'single' | 'bulk';

export default function Home() {
  // Single search
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bulk search
  const [mode, setMode] = useState<Mode>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkData, setBulkData] = useState<BulkSearchData | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

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
        const groups = buildComparisonGroups(json.results, q);

        setData({
          query: json.query,
          results: json.results,
          groups,
          totalResults: json.totalResults ?? groups.reduce((sum, g) => sum + g.matchCount, 0),
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

  const handleBulkSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const lines = bulkText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) return;

      setBulkLoading(true);
      setBulkError(null);
      setBulkData(null);
      setActiveTab(0);

      try {
        const res = await fetch('/api/bulk-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries: lines }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const json = await res.json();

        // Build comparison groups for each query
        const allGroups: ComparisonGroup[][] = json.results.map(
          (r: { results: ScraperResult[]; query: string }) =>
            buildComparisonGroups(r.results, r.query)
        );

        const allResults: ScraperResult[][] = json.results.map(
          (r: { results: ScraperResult[] }) => r.results
        );

        const totalProducts = allGroups.reduce(
          (sum: number, g: ComparisonGroup[]) =>
            sum + g.reduce((s, grp) => s + grp.matchCount, 0),
          0
        );

        setBulkData({
          queries: json.results.map((r: { query: string }) => r.query),
          allGroups,
          allResults,
          totalProducts,
          timestamp: json.timestamp,
        });
      } catch (err) {
        setBulkError(err instanceof Error ? err.message : 'Bulk search failed');
      } finally {
        setBulkLoading(false);
      }
    },
    [bulkText]
  );

  const handleExportSingle = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single',
          query: data.query,
          singleGroups: data.groups,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `price-compare-${data.query}-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [data]);

  const handleExportBulk = useCallback(async () => {
    if (!bulkData) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'bulk',
          queries: bulkData.queries,
          groups: bulkData.allGroups,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `price-compare-bulk-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [bulkData]);

  const productCount = data
    ? data.results.reduce((sum, r) => sum + r.products.length, 0)
    : 0;

  const storeCount = data ? data.results.filter((r) => r.products.length > 0).length : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
            Price Compare
          </h1>
          <p className="mt-2 text-base text-gray-500">
            Compare prices across Checkers, Dis-Chem, Clicks, Woolworths &amp; Pick n Pay
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mx-auto mb-6 max-w-2xl">
          <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1 shadow-sm">
            <button
              onClick={() => { setMode('single'); setBulkData(null); setBulkError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === 'single'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Single Search
            </button>
            <button
              onClick={() => { setMode('bulk'); setData(null); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === 'bulk'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Bulk Search
            </button>
          </div>
        </div>

        {/* ── SINGLE MODE ── */}
        {mode === 'single' && (
          <>
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
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 0016 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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

            {/* Single Results */}
            {data && !loading && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-500">
                    Found{' '}
                    <span className="font-semibold text-gray-700">{productCount}</span> products in{' '}
                    <span className="font-semibold text-gray-700">{storeCount}</span> stores
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-2">
                      {data.results
                        .filter((r) => r.products.length > 0)
                        .map((r) => (
                          <span
                            key={r.store}
                            className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                            style={{
                              backgroundColor:
                                STORE_COLORS[r.store] ?? DEFAULT_STORE_COLOR,
                            }}
                          >
                            {r.store} ({r.products.length})
                          </span>
                        ))}
                    </div>
                    <button
                      onClick={handleExportSingle}
                      disabled={exporting}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      {exporting ? (
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      {exporting ? 'Exporting...' : 'Export Excel'}
                    </button>
                  </div>
                </div>
                <ComparisonTable groups={data.groups} query={data.query} />
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
          </>
        )}

        {/* ── BULK MODE ── */}
        {mode === 'bulk' && (
          <>
            <form onSubmit={handleBulkSearch} className="mx-auto mb-10 max-w-2xl">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Enter one product per line&#10;e.g.&#10;nappies&#10;toilet paper&#10;dove soap&#10;bread"
                rows={6}
                className="w-full rounded-xl border border-gray-300 bg-white p-4 text-base shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 resize-y"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {bulkText.split('\n').filter((l) => l.trim()).length} product(s) &middot; max 20
                </span>
                <button
                  type="submit"
                  disabled={bulkLoading || !bulkText.trim()}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Searching All
                    </span>
                  ) : (
                    'Search All'
                  )}
                </button>
              </div>
            </form>

            {/* Bulk Error */}
            {bulkError && (
              <div className="mx-auto mb-8 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 0016 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {bulkError}
                </div>
              </div>
            )}

            {/* Bulk loading */}
            {bulkLoading && (
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

            {/* Bulk Results */}
            {bulkData && !bulkLoading && (
              <>
                {/* Summary + Export */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-500">
                    Searched <span className="font-semibold text-gray-700">{bulkData.queries.length}</span> products &middot;{' '}
                    <span className="font-semibold text-gray-700">{bulkData.totalProducts}</span> total matches
                  </p>
                  <button
                    onClick={handleExportBulk}
                    disabled={exporting}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    {exporting ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {exporting ? 'Exporting...' : 'Export All to Excel'}
                  </button>
                </div>

                {/* Tab bar */}
                {bulkData.queries.length > 1 && (
                  <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200 pb-1">
                    {bulkData.queries.map((q, i) => {
                      const matchCount = bulkData.allGroups[i]?.length ?? 0;
                      return (
                        <button
                          key={q + '-' + i}
                          onClick={() => setActiveTab(i)}
                          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition ${
                            activeTab === i
                              ? 'border border-b-white border-gray-200 bg-white text-blue-600 -mb-px'
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {q}
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            activeTab === i
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {matchCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Active tab content */}
                {bulkData.queries.map((q, i) => (
                  <div key={q + '-content-' + i} className={activeTab === i ? 'block' : 'hidden'}>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-800">{q}</h2>
                      <div className="flex gap-1.5">
                        {bulkData.allResults[i]
                          ?.filter((r) => r.products.length > 0)
                          .map((r) => (
                            <span
                              key={r.store}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                              style={{
                                backgroundColor:
                                  STORE_COLORS[r.store] ?? DEFAULT_STORE_COLOR,
                              }}
                            >
                              {r.store} ({r.products.length})
                            </span>
                          ))}
                      </div>
                    </div>
                    <ComparisonTable groups={bulkData.allGroups[i] ?? []} query={q} />
                  </div>
                ))}

                <p className="mt-6 text-center text-xs text-gray-400">
                  {new Date(bulkData.timestamp).toLocaleTimeString()}
                </p>
              </>
            )}

            {/* Bulk empty state */}
            {!bulkData && !bulkLoading && !bulkError && (
              <div className="mt-16 text-center">
                <div className="mb-4 text-6xl">📋</div>
                <p className="text-lg text-gray-400">
                  Enter multiple products to compare prices across all stores
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
