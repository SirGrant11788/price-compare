import { BaseScraper } from './base';
import type { ProductResult, ScraperResult } from '@/types';

export class WoolworthsScraper extends BaseScraper {
  readonly store = 'Woolworths';
  readonly baseUrl = 'https://www.woolworths.co.za';

  async search(query: string): Promise<ScraperResult> {
    try {
      const url = `${this.baseUrl}/browse?searchterm=${encodeURIComponent(query)}&fr=1`;
      const html = await this.fetchHtml(url);
      return this.parseProducts(html, query);
    } catch (error) {
      return this.makeError(error);
    }
  }

  private parseProducts(html: string, _query: string): ScraperResult {
    const products: ProductResult[] = [];

    // Woolworths often embeds product data in a JSON script tag or window.__INITIAL_STATE__
    // Try __INITIAL_STATE__ first (Next.js-style pattern)
    const initStateMatch = html.match(
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/
    );
    if (initStateMatch) {
      try {
        const state = JSON.parse(initStateMatch[1]);
        // Navigate the state tree to find products — structure varies
        const extractProducts = (obj: any, depth = 0): any[] => {
          if (depth > 10) return [];
          if (!obj || typeof obj !== 'object') return [];
          if (Array.isArray(obj)) {
            if (
              obj.length > 0 &&
              obj[0]?.name &&
              (obj[0]?.price || obj[0]?.pricing)
            ) {
              return obj;
            }
            return obj.flatMap((item) => extractProducts(item, depth + 1));
          }
          const results: any[] = [];
          for (const val of Object.values(obj)) {
            const found = extractProducts(val, depth + 1);
            results.push(...found);
            if (results.length > 0) break;
          }
          return results;
        };

        const found = extractProducts(state);
        for (const item of found.slice(0, 50)) {
          const price = item.price ?? item.pricing?.price ?? item.pricing?.currentPrice;
          if (item.name && price) {
            products.push({
              name: item.name,
              price: `R${parseFloat(price).toFixed(2)}`,
              priceValue: parseFloat(price),
              store: this.store,
              url: item.url
                ? item.url.startsWith('http')
                  ? item.url
                  : `${this.baseUrl}${item.url}`
                : '',
              imageUrl: item.image ?? item.imageUrl ?? item.images?.[0]?.url,
              unitPrice: item.unitPrice ?? item.unitMeasure,
              inStock: item.inStock !== false,
            });
          }
        }
      } catch {
        // JSON parse failed, fall through to HTML parsing
      }
    }

    // Fallback: parse HTML for product cards — Woolworths uses various patterns
    if (products.length === 0) {
      // Try JSON-LD
      const jsonLdRegex =
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(match[1]);
          if (data['@type'] === 'ItemList' && data.itemListElement) {
            for (const element of data.itemListElement) {
              const item = element.item || element;
              if (item.name && item.offers?.price) {
                products.push({
                  name: item.name,
                  price: `R${parseFloat(item.offers.price).toFixed(2)}`,
                  priceValue: parseFloat(item.offers.price),
                  store: this.store,
                  url: item.url || '',
                  imageUrl: item.image?.[0] || item.image || '',
                  inStock: item.offers.availability?.includes('InStock') ?? true,
                });
              }
            }
          }
        } catch {
          // skip
        }
      }

      // Last resort: regex-based product extraction
      if (products.length === 0) {
        const productPatterns = html.match(
          /<div[^>]*(?:class="[^"]*product[^"]*"|data-product)[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi
        );
        for (const block of productPatterns || []) {
          const nameMatch = block.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
            || block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
          const priceMatch = block.match(/R\s*[\d,]+(?:\.[\d]{2})?/);
          if (!nameMatch || !priceMatch) continue;

          products.push({
            name: nameMatch[1].replace(/<[^>]+>/g, '').trim(),
            price: priceMatch[0],
            priceValue: this.normalizePrice(priceMatch[0]),
            store: this.store,
            url: '',
            inStock: true,
          });
        }
      }
    }

    return { store: this.store, products };
  }
}
