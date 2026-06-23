import { BaseScraper } from './base';
import type { ProductResult, ScraperResult } from '@/types';

interface CheckersProduct {
  name?: string;
  title?: string;
  price?: number;
  salePrice?: number;
  url?: string;
  image?: string;
  imageUrl?: string;
  unitPrice?: string;
  inStock?: boolean;
}

export class CheckersScraper extends BaseScraper {
  readonly store = 'Checkers Sixty60';
  readonly baseUrl = process.env.CHECKERS_API_URL || 'http://localhost:3001';

  async search(query: string): Promise<ScraperResult> {
    try {
      const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(query)}`;
      console.error(`[Checkers] Fetching: ${searchUrl}`);

      const response = await fetch(searchUrl, {
        signal: AbortSignal.timeout(60000),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const products = (Array.isArray(data) ? data : data.products || []) as CheckersProduct[];

      return {
        store: this.store,
        products: products.map(
          (p): ProductResult => ({
            name: p.title || p.name || 'Unknown',
            price: `R${(p.salePrice ?? p.price ?? 0).toFixed(2)}`,
            priceValue: p.salePrice ?? p.price ?? 0,
            store: this.store,
            url: p.url || '',
            imageUrl: p.image || p.imageUrl,
            unitPrice: p.unitPrice,
            inStock: p.inStock !== false,
          })
        ),
      };
    } catch (error) {
      return this.makeError(error);
    }
  }
}
