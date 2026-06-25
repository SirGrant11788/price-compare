import type { ComparisonGroup, ExportRow, ExportSheet } from '@/types';
import * as XLSX from 'xlsx';

interface ExportRequestBody {
  mode: 'single' | 'bulk';
  query?: string;
  queries?: string[];
  groups?: ComparisonGroup[][];
  singleGroups?: ComparisonGroup[];
}

const STORE_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#ea580c'];

function buildRows(groups: ComparisonGroup[], query: string): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const group of groups) {
    const storeKeys = Object.keys(group.byStore);
    for (const store of storeKeys) {
      const product = group.byStore[store];
      if (product) {
        rows.push({
          productName: product.name,
          store,
          price: product.price,
          priceValue: product.priceValue,
          url: product.url,
          inStock: product.inStock,
        });
      }
    }
  }
  return rows;
}

function buildWorkbook(sheets: ExportSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const data = sheet.rows.map((r) => ({
      'Product': r.productName,
      'Store': r.store,
      'Price': r.price,
      'Price Value': r.priceValue,
      'In Stock': r.inStock ? 'Yes' : 'No',
      'URL': r.url || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    // Column widths
    ws['!cols'] = [
      { wch: 50 },  // Product
      { wch: 15 },  // Store
      { wch: 15 },  // Price
      { wch: 12 },  // Price Value
      { wch: 10 },  // In Stock
      { wch: 60 },  // URL
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  return wb;
}

function sanitizeSheetName(name: string): string {
  // Excel sheet names are limited to 31 chars and can't contain []:*?/\
  return name
    .replace(/[[\]:*?/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Results';
}

/**
 * POST /api/export
 *
 * Accepts comparison data and returns an Excel (.xlsx) file.
 *
 * Body:
 * {
 *   mode: 'single',
 *   singleGroups: ComparisonGroup[],
 *   query: string
 * }
 * or
 * {
 *   mode: 'bulk',
 *   groups: ComparisonGroup[][],
 *   queries: string[]
 * }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as ExportRequestBody;

    if (body.mode === 'bulk' && body.groups && body.queries) {
      // Build one sheet per product
      const sheets: ExportSheet[] = body.queries.map((q, i) => ({
        name: sanitizeSheetName(q),
        rows: buildRows(body.groups![i] || [], q),
      }));

      // Add summary sheet
      const summaryRows: ExportRow[] = [];
      for (const [idx, q] of body.queries.entries()) {
        const rows = buildRows(body.groups![idx] || [], q);
        summaryRows.push(...rows);
      }
      sheets.unshift({ name: 'Summary', rows: summaryRows });

      const wb = buildWorkbook(sheets);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="price-compare-bulk-${Date.now()}.xlsx"`,
        },
      });
    }

    if (body.mode === 'single' && body.singleGroups) {
      const rows = buildRows(body.singleGroups, body.query ?? 'search');
      const wb = buildWorkbook([{ name: sanitizeSheetName(body.query ?? 'Results'), rows }]);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="price-compare-${body.query ?? 'results'}-${Date.now()}.xlsx"`,
        },
      });
    }

    return Response.json({ error: 'Invalid export request' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
