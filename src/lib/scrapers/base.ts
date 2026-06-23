import type { ProductResult, ScraperResult } from '@/types';

const TIMEOUT_MS = 30000;

export interface ScraperOptions {
  signal?: AbortSignal;
}

export abstract class BaseScraper {
  abstract readonly store: string;
  abstract readonly baseUrl: string;

  protected async fetchHtml(url: string, options?: ScraperOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: options?.signal ?? controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-ZA,en-GB;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  abstract search(query: string, options?: ScraperOptions): Promise<ScraperResult>;

  protected makeError(error: unknown): ScraperResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
      store: this.store,
      products: [],
      error: message,
    };
  }

  protected normalizePrice(priceText: string): number {
    const cleaned = priceText
      .replace(/[Rr\s,]/g, '')
      .replace(/[^\d.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}
