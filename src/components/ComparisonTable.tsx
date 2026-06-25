'use client';

import type { ComparisonGroup } from '@/lib/fuzzy';
import { STORE_NAMES, STORE_COLORS, DEFAULT_STORE_COLOR } from '@/lib/constants';

function storeColor(store: string): string {
  return STORE_COLORS[store] ?? DEFAULT_STORE_COLOR;
}

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
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 font-semibold text-gray-700">
              Product
            </th>
            {STORE_NAMES.map((name) => (
              <th
                key={name}
                className="px-4 py-3 font-semibold text-gray-700"
                style={{ color: storeColor(name) }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: storeColor(name) }}
                  />
                  {name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, idx) => (
            <tr
              key={group.fingerprint}
              className={
                idx % 2 === 0 ? 'border-b border-gray-100' : 'border-b border-gray-100 bg-gray-50/50'
              }
            >
              <td className="sticky left-0 z-10 bg-inherit px-4 py-3 font-medium text-gray-900">
                <a
                  href={(() => {
                    const firstStore = STORE_NAMES.find((s) => group.byStore[s]);
                    return firstStore ? group.byStore[firstStore]?.url ?? '#' : '#';
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 hover:underline"
                >
                  {group.displayName}
                </a>
              </td>
              {STORE_NAMES.map((store) => {
                const product = group.byStore[store];
                return (
                  <td key={store} className="px-4 py-3">
                    {product ? (
                      <div className="flex items-center gap-2">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-10 w-10 flex-shrink-0 rounded-lg border border-gray-100 object-contain"
                          />
                        )}
                        {!product.inStock ? (
                          <span className="text-sm text-red-500">Out of stock</span>
                        ) : (
                          <a
                            href={product.url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                          >
                            {product.price}
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300">&mdash;</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
