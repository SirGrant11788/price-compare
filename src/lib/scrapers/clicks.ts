import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import { BaseScraper } from './base';
import type { ProductResult, ScraperResult } from '@/types';

const SELENIUM_URL = process.env.SELENIUM_URL || 'http://localhost:4444';
const MAX_CONCURRENT_SCRAPES = parseInt(process.env.MAX_CONCURRENT_SCRAPES || '3', 10);

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
      options.excludeSwitches('enable-automation');

      driver = await new Builder()
        .forBrowser('chrome')
        .usingServer(SELENIUM_URL)
        .setChromeOptions(options)
        .build();

      driver.manage().setTimeouts({ pageLoad: 20000, script: 10000, implicit: 5000 });

      await driver.executeScript(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })"
      );

      const searchUrl = `${this.baseUrl}/searchProducts?query=${encodeURIComponent(query)}`;
      console.error(`[Clicks] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);

      try {
        const acceptBtn = await driver.findElement(
          By.css('button:has-text("Accept all"), button:has-text("Accept"), .cookie-accept-btn, #cookie-accept')
        );
        await acceptBtn.click();
        await this.sleep(2000);
      } catch {}

      try {
        await driver.wait(
          until.elementLocated(By.css('[data-testid="product-card"], .productCard, article, li.product-item, [class*="ais-InfiniteHits"] li')),
          30000
        );
      } catch {
        try {
          await driver.wait(until.elementLocated(By.css('[class*="product"]')), 20000);
        } catch {
          const source = await driver.getPageSource();
          if (source.includes('no results') || source.includes('No results') || source.includes('0 results')) {
            return [];
          }
          console.error('[Clicks] No product elements found');
          return [];
        }
      }

      await this.sleep(3000);

      // Find product containers – Clicks uses li elements in search results
      const containers = await driver.findElements(
        By.css('[class*="ais-InfiniteHits"] > div > div > div > div > li, [class*="ais-InfiniteHits"] li, li[class*="item"], article')
      );
      console.error(`[Clicks] Found ${containers.length} product containers`);

      const products: ProductResult[] = [];

      // Limit to first 40 to avoid noise
      const maxItems = Math.min(containers.length, 40);

      for (let i = 0; i < maxItems; i++) {
        const container = containers[i];
        try {
          let name = '';
          let url = '';

          // Primary: get full name from link title attribute
          try {
            const link = await container.findElement(By.css('a[href*="/p/"], a[href*="/product"]'));
            const title = await link.getAttribute('title');
            if (title && title.trim().length > 5) {
              name = title.trim();
            } else {
              name = (await link.getText()).trim();
            }
            url = await link.getAttribute('href');
            if (url && !url.startsWith('http')) {
              url = `${this.baseUrl}${url}`;
            }
          } catch {
            // Secondary: brand + description combo
            try {
              const brand = await container.findElement(By.css('h5, [class*="brand"]'));
              const desc = await container.findElement(By.css('p, [class*="description"]'));
              const brandText = (await brand.getText()).trim();
              const descText = (await desc.getText()).trim();
              name = `${brandText} ${descText}`.trim();
            } catch {
              // Tertiary: just any link or text
              try {
                const links = await container.findElements(By.css('a'));
                for (const link of links) {
                  name = (await link.getText()).trim();
                  if (name) {
                    url = await link.getAttribute('href');
                    if (url && !url.startsWith('http')) url = `${this.baseUrl}${url}`;
                    break;
                  }
                }
              } catch {}
            }
          }

          if (!name || name.length < 5) {
            // Last resort: text extraction
            const text = await container.getText();
            const lines = text.split('\n').filter((l) => l.trim());
            name = lines.find(
              (l) => !/^R\s*[\d,]+/.test(l) && l.length > 10 && !l.includes('delivery') && !l.includes('review')
            ) || '';
          }

          if (!name) continue;

          let priceText = '';
          try {
            const priceEl = await container.findElement(
              By.css('[class*="price"], span.price, .price-box, [class*="Price"]')
            );
            priceText = (await priceEl.getText()).trim();
          } catch {
            const text = await container.getText();
            const priceMatch = text.match(/R\s*[\d,]+(?:\.\d{2})?/);
            if (priceMatch) priceText = priceMatch[0];
          }

          if (!priceText) continue;
          const priceValue = this.normalizePrice(priceText);
          if (priceValue === 0 || !isFinite(priceValue)) continue;

          let imageUrl = '';
          try {
            const img = await container.findElement(By.css('img[src*="/medias/"], img'));
            imageUrl = await img.getAttribute('src');
          } catch {}

          products.push({
            name,
            price: priceText,
            priceValue,
            store: this.store,
            url: url || '',
            imageUrl: imageUrl || undefined,
            inStock: true,
          });
        } catch {}
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
