export interface ProductResult {
  name: string;
  price: string;
  priceValue: number;
  store: string;
  url: string;
  imageUrl?: string;
  unitPrice?: string;
  inStock: boolean;
}

export interface ScraperResult {
  store: string;
  products: ProductResult[];
  error?: string;
}

export interface SearchResponse {
  query: string;
  results: ScraperResult[];
  totalResults: number;
  timestamp: string;
}

export interface ScraperConfig {
  name: string;
  baseUrl: string;
  searchPath: string;
  cacheTTL?: number;
}

// ── Bulk search ──────────────────────────────────────────────────────────────

export interface SingleProductResult {
  query: string;
  groups: ComparisonGroup[];
  results: ScraperResult[];
  totalResults: number;
  timestamp: string;
}

export interface BulkSearchResponse {
  results: SingleProductResult[];
  totalQueries: number;
  timestamp: string;
}

// ── Comparison groups (re-exported from fuzzy.ts for convenience) ────────────

export interface ComparisonGroup {
  displayName: string;
  avgPrice: number;
  matchScore: number;
  fingerprint: string;
  byStore: Record<string, ProductResult | null>;
  stores: string[];
  matchCount: number;
}

// ── Export ───────────────────────────────────────────────────────────────────

export interface ExportRow {
  productName: string;
  store: string;
  price: string;
  priceValue: number;
  url: string;
  inStock: boolean;
}

export interface ExportSheet {
  name: string;
  rows: ExportRow[];
}
