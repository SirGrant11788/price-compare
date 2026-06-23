import { BaseScraper } from './base';
import type { ProductResult, ScraperResult } from '@/types';

export class DischemScraper extends BaseScraper {
  readonly store = 'Dis-Chem';
  readonly baseUrl = 'https://www.dischem.co.za';

  async search(query: string): Promise<ScraperResult> {
    try {
      const url = `${this.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
      const html = await this.fetchHtml(url);
      return this.parseProducts(html, query);
    } catch (error) {
      return this.makeError(error);
    }
  }

  private parseProducts(html: string, _query: string): ScraperResult {
    const products: ProductResult[] = [];

    // Dis-Chem uses a product grid with .product-item or .product-card
    const itemRegex =
      /<li[^>]*class="[^"]*item[^"]*product[^"]*"[^>]*>[\s\S]*?<\/li>/gi;
    const items = html.match(itemRegex) || [];

    for (const itemHtml of items) {
      try {
        // Extract product name
        const nameMatch = itemHtml.match(
          /<a[^>]*class="[^"]*product-item-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i
        ) || itemHtml.match(/class="[^"]*product[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
        if (!nameMatch) continue;
        const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
        if (!name) continue;

        // Extract price
        const priceMatch = itemHtml.match(
          /<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i
        );
        if (!priceMatch) continue;
        const priceText = priceMatch[1].replace(/<[^>]+>/g, '').trim();
        const priceValue = this.normalizePrice(priceText);
        if (priceValue === 0) continue;

        // Extract URL
        const urlMatch = itemHtml.match(
          /<a[^>]*href="([^"]+)"[^>]*class="[^"]*product-item-link[^"]*"/i
        );
        const url = urlMatch
          ? urlMatch[1].startsWith('http')
            ? urlMatch[1]
            : `${this.baseUrl}${urlMatch[1]}`
          : '';

        // Extract image
        const imgMatch = itemHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/i);

        products.push({
          name,
          price: priceText,
          priceValue,
          store: this.store,
          url,
          imageUrl: imgMatch?.[1],
          inStock: !itemHtml.includes('out-of-stock') && !itemHtml.includes('oos'),
        });
      } catch {
        // skip malformed items
      }
    }

    // Fallback: try simpler parsing if no items found via list
    if (products.length === 0) {
      return this.fallbackParse(html);
    }

    return { store: this.store, products };
  }

  private fallbackParse(html: string): ScraperResult {
    const products: ProductResult[] = [];

    // Try to find product data in JSON-LD or inline script
    const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data['@type'] === 'Product' || data['@type'] === 'ItemList') {
          const items = data['@type'] === 'ItemList' ? data.itemListElement?.map((e: any) => e.item) : [data];
          for (const item of items || []) {
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
        // skip parse errors
      }
    }

    return { store: this.store, products };
  }
}
