import { BaseScraper } from './base';
import type { ProductResult, ScraperResult } from '@/types';

export class ClicksScraper extends BaseScraper {
  readonly store = 'Clicks';
  readonly baseUrl = 'https://clicks.co.za';

  async search(query: string): Promise<ScraperResult> {
    try {
      const url = `${this.baseUrl}/searchProducts?query=${encodeURIComponent(query)}`;
      const html = await this.fetchHtml(url);
      return this.parseProducts(html, query);
    } catch (error) {
      return this.makeError(error);
    }
  }

  private parseProducts(html: string, _query: string): ScraperResult {
    const products: ProductResult[] = [];

    // Clicks search results often use a product grid
    // Try JSON-LD first
    const jsonLdRegex =
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data['@type'] === 'Product' || data['@type'] === 'ItemList') {
          const items =
            data['@type'] === 'ItemList'
              ? data.itemListElement?.map((e: any) => e.item)
              : [data];
          for (const item of items || []) {
            if (item.name && item.offers?.price) {
              products.push({
                name: item.name,
                price: `R${parseFloat(item.offers.price).toFixed(2)}`,
                priceValue: parseFloat(item.offers.price),
                store: this.store,
                url: item.url || '',
                imageUrl: item.image?.[0] || item.image || '',
                inStock:
                  item.offers.availability?.includes('InStock') ?? true,
              });
            }
          }
        }
      } catch {
        // skip parse errors
      }
    }

    // Fallback: parse HTML product cards
    if (products.length === 0) {
      // Try to extract from product listing markup — Clicks uses various patterns
      const productBlocks = html.match(
        /<div[^>]*class="[^"]*product-item[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi
      );

      for (const block of productBlocks || []) {
        try {
          const nameMatch = block.match(
            /<a[^>]*>([\s\S]*?)<\/a>/i
          );
          const priceMatch = block.match(
            /R\s*[\d,]+(?:\.[\d]{2})?/
          );
          const urlMatch = block.match(/href="([^"]+)"/);
          const imgMatch = block.match(/<img[^>]*src="([^"]+)"[^>]*>/i);

          if (!nameMatch || !priceMatch) continue;
          const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
          const priceText = priceMatch[0];

          products.push({
            name,
            price: priceText,
            priceValue: this.normalizePrice(priceText),
            store: this.store,
            url: urlMatch
              ? urlMatch[1].startsWith('http')
                ? urlMatch[1]
                : `${this.baseUrl}${urlMatch[1]}`
              : '',
            imageUrl: imgMatch?.[1],
            inStock: true,
          });
        } catch {
          // skip
        }
      }
    }

    return { store: this.store, products };
  }
}
