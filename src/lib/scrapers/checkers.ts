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

export class CheckersScraper extends BaseScraper {
  readonly store = 'Checkers';
  readonly baseUrl = 'https://www.checkers.co.za';

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

  private async scrapeWithSelenium(ingredient: string): Promise<ProductResult[]> {
    let driver: WebDriver | null = null;

    try {
      const options = new chrome.Options();
      // Non-headless for better bot-detection evasion
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

      const searchUrl = `${this.baseUrl}/search?Search=${encodeURIComponent(ingredient)}`;
      console.error(`[Checkers] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);
      await this.sleep(5000);

      // Wait for product cards to render
      try {
        await driver.wait(
          until.elementLocated(By.css('p.product-card_product-name__8wxGT')),
          30000
        );
      } catch {
        // Try alternative selectors
        try {
          await driver.wait(
            until.elementLocated(By.css('[class*="product"]')),
            20000
          );
        } catch {
          const source = await driver.getPageSource();
          if (source.includes('no results') || source.includes('No results')) {
            return [];
          }
          console.error('[Checkers] No product elements found');
          return [];
        }
      }

      // Find product titles
      const titleElements = await driver.findElements(
        By.css('p.product-card_product-name__8wxGT')
      );
      console.error(`[Checkers] Found ${titleElements.length} title elements`);

      // Find product prices
      const priceElements = await driver.findElements(
        By.css('span.price-display_full__ngphI')
      );
      console.error(`[Checkers] Found ${priceElements.length} price elements`);

      const products: ProductResult[] = [];

      if (titleElements.length === 0) {
        // Fallback: try product containers
        const containers = await driver.findElements(
          By.css('[class*="product-card"]')
        );

        for (const container of containers) {
          try {
            const titleEl = await container.findElement(
              By.css('p[class*="product-name"]')
            );
            const priceEl = await container.findElement(
              By.css('span[class*="price-display"]')
            );

            const title = await titleEl.getText();
            const price = await priceEl.getText();

            if (title && price) {
              products.push({
                name: title.trim(),
                price: price.trim(),
                priceValue: this.normalizePrice(price),
                store: this.store,
                url: '',
                inStock: true,
              });
            }
          } catch {
            // skip malformed container
          }
        }
      } else {
        // Primary extraction path
        for (let i = 0; i < Math.min(titleElements.length, priceElements.length); i++) {
          try {
            const title = await titleElements[i].getText();
            const price = await priceElements[i].getText();

            if (title && price) {
              products.push({
                name: title.trim(),
                price: price.trim(),
                priceValue: this.normalizePrice(price),
                store: this.store,
                url: '',
                inStock: true,
              });
            }
          } catch {
            // skip individual extraction errors
          }
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
