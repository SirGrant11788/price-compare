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
