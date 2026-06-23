import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import { BaseScraper } from './base';
import type { ProductResult, ScraperResult } from '@/types';

const SELENIUM_URL = process.env.SELENIUM_URL || 'http://localhost:4444';
const MAX_CONCURRENT_SCRAPES = parseInt(process.env.MAX_CONCURRENT_SCRAPES || '3', 10);

// ── Concurrency semaphore ─────────────────────────────────────────────────────
let activeScrapes = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (activeScrapes < MAX_CONCURRENT_SCRAPES) {
    activeScrapes++;
    return;
  }
  return new Promise((resolve) => {
    queue.push(resolve);
  });
}

function release(): void {
  if (queue.length > 0) {
    const next = queue.shift()!;
    next();
  } else {
    activeScrapes--;
  }
}

export class ClicksScraper extends BaseScraper {
  readonly store = 'Clicks';
  readonly baseUrl = 'https://clicks.co.za';

  async search(query: string): Promise<ScraperResult> {
    await acquire();
    try {
      const products = await this.scrapeWithSelenium(query);
      return { store: this.store, products };
    } catch (error) {
      return this.makeError(error);
    } finally {
      release();
    }
  }

  private async scrapeWithSelenium(query: string): Promise<ProductResult[]> {
    let driver: WebDriver | null = null;

    try {
      const options = new chrome.Options();
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.addArguments(
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      );
      options.addArguments('--window-size=1920,1080');
      options.addArguments('--start-minimized');
      options.excludeSwitches(['enable-automation']);

      driver = await new Builder()
        .forBrowser('chrome')
        .usingServer(SELENIUM_URL)
        .setChromeOptions(options)
        .build();

      await driver.executeScript(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })"
      );

      const searchUrl = `${this.baseUrl}/searchProducts?query=${encodeURIComponent(query)}`;
      console.error(`[Clicks] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);

      // Accept cookie banner if present
      try {
        const acceptBtn = await driver.findElement(By.css('button:has-text("Accept all"), button:has-text("Accept"), .cookie-accept-btn, #cookie-accept'));
        await acceptBtn.click();
        await this.sleep(2000);
      } catch {
        // No cookie banner or already accepted
      }

      // Wait for product list to render
      try {
        await driver.wait(
          until.elementLocated(By.css('[data-testid="product-card"], .productCard, article, li.product-item')),
          30000
        );
      } catch {
        try {
          await driver.wait(
            until.elementLocated(By.css('[class*="product"]')),
            20000
          );
        } catch {
          const source = await driver.getPageSource();
          if (source.includes('no results') || source.includes('No results') || source.includes('0 results')) {
            return [];
          }
          console.error('[Clicks] No product elements found');
          return [];
        }
      }

      await this.sleep(4000);

      // Collect product containers — Clicks uses list items in search results
      const containers = await driver.findElements(
        By.css('[class*="ais-InfiniteHits"] li, [class*="search-result"] li, ul[class*="list"] > li, li[class*="item"], article')
      );
      console.error(`[Clicks] Found ${containers.length} product containers`);

      const products: ProductResult[] = [];

      for (const container of containers) {
        try {
          // Product name — try heading + paragraph combo first (brand + description)
          let name = '';
          try {
            const heading = await container.findElement(By.css('h5, h4, h3, [class*="title"] a, a[class*="name"]'));
            name = (await heading.getText()).trim();
          } catch {
            try {
              const links = await container.findElements(By.css('a'));
              for (const link of links) {
                const href = await link.getAttribute('href');
                if (href && href.includes('/p/')) {
                  name = (await link.getText()).trim();
                  if (name) break;
                }
              }
            } catch {
              // try img alt
              try {
                const img = await container.findElement(By.css('img'));
                name = (await img.getAttribute('alt')) || '';
              } catch {
                // skip
              }
            }
          }

          if (!name) {
            // Try getting the full text and extracting product name
            const text = await container.getText();
            const lines = text.split('\n').filter((l) => l.trim());
            // Name is usually the longest line that's not a price
            name = lines.find(
              (l) => !/^R\s*[\d,]+/.test(l) && l.length > 10 && !l.includes('delivery') && !l.includes('review')
            ) || '';
          }

          if (!name) continue;

          // Price
          let priceText = '';
          try {
            const priceEl = await container.findElement(By.css('[class*="price"], span.price, .price-box, strong:has-text("R"), [class*="Price"]'));
            priceText = (await priceEl.getText()).trim();
          } catch {
            const text = await container.getText();
            const priceMatch = text.match(/R\s*[\d,]+(?:\.\d{2})?/);
            if (priceMatch) priceText = priceMatch[0];
          }

          if (!priceText) continue;
          const priceValue = this.normalizePrice(priceText);
          if (priceValue === 0) continue;

          // URL
          let url = '';
          try {
            const link = await container.findElement(By.css('a[href*="/p/"]'));
            url = await link.getAttribute('href');
            if (url && !url.startsWith('http')) {
              url = `${this.baseUrl}${url}`;
            }
          } catch {
            try {
              const link = await container.findElement(By.css('a'));
              url = await link.getAttribute('href');
              if (url && !url.startsWith('http')) {
                url = `${this.baseUrl}${url}`;
              }
            } catch {
              // no URL
            }
          }

          // Image
          let imageUrl = '';
          try {
            const img = await container.findElement(By.css('img[src*="/medias/"], img'));
            imageUrl = await img.getAttribute('src');
          } catch {
            // no image
          }

          products.push({
            name,
            price: priceText,
            priceValue,
            store: this.store,
            url: url || '',
            imageUrl: imageUrl || undefined,
            inStock: true,
          });
        } catch {
          // skip malformed container
        }
      }

      return products;
    } finally {
      if (driver) {
        await driver.quit();
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
