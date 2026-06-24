'use client';

import type { ComparisonGroup } from '@/lib/fuzzy';

const STORE_NAMES = ['Checkers', 'Dis-Chem', 'Clicks', 'Woolworths'];
const STORE_COLORS: Record<string, string> = {
  'Checkers': '#16a34a',
  'Dis-Chem': '#2563eb',
  'Clicks': '#9333ea',
  'Woolworths': '#ea580c',
};

interface ComparisonTableProps {
  groups: ComparisonGroup[];
  query: string;
}

export default function ComparisonTable({ groups, query }: ComparisonTableProps) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center">
        <div className="mb-2 text-4xl">🔍</div>
        <p className="text-lg text-gray-500">
          No products found for &ldquo;{query}&rdquo;
        </p>
        <p className="mt-1 text-sm text-gray-400">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div
        className="hidden sm:grid rounded-t-xl border border-gray-200 bg-gray-50 shadow-sm"
        style={{
          gridTemplateColumns: `2rem repeat(4, 1fr)`,
        }}
      >
        <div className="flex items-center justify-center py-3 text-xs font-medium text-gray-400 border-r border-gray-200">
          #
        </div>
        {STORE_NAMES.map((store) => (
          <div
            key={store}
            className="border-r border-gray-200 px-2 py-3 text-center text-sm font-bold last:border-r-0"
            style={{ color: STORE_COLORS[store] ?? '#666' }}
          >
            {store}
          </div>
        ))}
      </div>

      {/* Product rows */}
      {groups.map((group, i) => (
        <ProductRow key={group.fingerprint + '-' + i} group={group} index={i + 1} />
      ))}
    </div>
  );
}

function ProductRow({ group, index }: { group: ComparisonGroup; index: number }) {
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      {/* Mobile: product index + store badges */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 sm:hidden">
        <span className="text-xs font-mono text-gray-400">#{index}</span>
        {STORE_NAMES.filter((s) => group.byStore[s]).map((store) => (
          <span
            key={store}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: STORE_COLORS[store] ?? '#666' }}
          >
            {store.slice(0, 4)}
          </span>
        ))}
      </div>

      {/* Store columns */}
      <div
        className="grid grid-cols-1 sm:grid-cols-4"
      >
        {STORE_NAMES.map((store) => {
          const product = group.byStore[store];

          if (!product) {
            return (
              <div
                key={store}
                className="flex items-center justify-center border-b border-gray-100 sm:border-b-0 sm:border-r sm:border-gray-100 p-6 last:border-r-0 last:border-b-0"
              >
                <span className="text-xs text-gray-300">—</span>
              </div>
            );
          }

          return (
            <div
              key={store}
              className="flex flex-col gap-2 border-b border-gray-100 sm:border-b-0 sm:border-r sm:border-gray-100 p-3 last:border-r-0 last:border-b-0"
            >
              {/* Store label (desktop) */}
              <div className="hidden sm:flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: STORE_COLORS[store] ?? '#666' }}
                />
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: STORE_COLORS[store] ?? '#666' }}
                >
                  {store}
                </span>
              </div>

              {/* Image */}
              {product.imageUrl && (
                <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50 border border-gray-100">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Name */}
              <div className="min-h-[2.5rem]">
                <div className="line-clamp-3 text-xs leading-snug text-gray-900">
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
              </div>

              {/* Price row */}
              <div className="flex items-center justify-between mt-auto">
                <span className="text-lg font-bold text-gray-900 tracking-tight">
                  {product.price}
                </span>
              </div>

              {/* Stock */}
              {!product.inStock && (
                <div className="text-[11px] text-red-500 font-medium">Out of stock</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
