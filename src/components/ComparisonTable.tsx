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
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header row */}
      <div className="flex border-b bg-gray-50">
        <div className="flex w-10 shrink-0 items-center justify-center py-3 text-xs font-medium text-gray-400">#</div>
        {STORE_NAMES.map((store) => (
          <div
            key={store}
            className="flex-1 border-r px-2 py-3 text-center text-sm font-bold last:border-r-0"
            style={{ color: STORE_COLORS[store] ?? '#666' }}
          >
            <span className="hidden sm:inline">{store}</span>
            <span className="sm:hidden">{store.slice(0, 4)}</span>
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
    <div className="flex border-b border-gray-100 transition hover:bg-blue-50/30 last:border-b-0">
      {/* Row number */}
      <div className="flex w-10 shrink-0 items-start justify-center border-r py-4 pt-5 text-xs font-mono text-gray-400">
        {index}
      </div>

      {STORE_NAMES.map((store) => {
        const product = group.byStore[store];

        if (!product) {
          return (
            <div
              key={store}
              className="flex flex-1 items-center justify-center border-r p-4 last:border-r-0"
            >
              <span className="text-xs text-gray-300">—</span>
            </div>
          );
        }

        return (
          <div
            key={store}
            className="relative flex flex-1 flex-col gap-2 border-r p-3 last:border-r-0"
          >
            {/* Image */}
            {product.imageUrl && (
              <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-md bg-gray-50">
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
              <div className="line-clamp-2 text-xs leading-snug text-gray-900">
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

            {/* Price */}
            <div className="flex items-center justify-between gap-1">
              <span className="text-base font-bold text-gray-900">
                {product.price}
              </span>
            </div>

            {/* Stock */}
            {!product.inStock && (
              <div className="text-[11px] text-red-500">Out of stock</div>
            )}

            {/* Store badge (mobile only) */}
            <div className="mt-1 sm:hidden">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: STORE_COLORS[store] ?? '#666' }}
              >
                {store}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
