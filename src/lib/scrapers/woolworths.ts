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

export class WoolworthsScraper extends BaseScraper {
  readonly store = 'Woolworths';
  readonly baseUrl = 'https://www.woolworths.co.za';

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

      const searchUrl = `${this.baseUrl}/browse?searchterm=${encodeURIComponent(query)}&fr=1`;
      console.error(`[Woolworths] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);

      // Accept cookie banner if present
      try {
        const acceptBtn = await driver.findElement(By.css('button:has-text("Accept"), button:has-text("dismiss"), [class*="cookie"] button, #cookie-accept, .cookie-btn'));
        await acceptBtn.click();
        await this.sleep(2000);
      } catch {
        // No cookie banner
      }

      // Wait for product articles to render
      try {
        await driver.wait(
          until.elementLocated(By.css('article')),
          30000
        );
      } catch {
        try {
          await driver.wait(
            until.elementLocated(By.css('[class*="product"], [class*="Product"], [data-testid*="product"]')),
            20000
          );
        } catch {
          const source = await driver.getPageSource();
          if (source.includes('no results') || source.includes('No results') || source.includes('0 results') || source.includes('found for')) {
            return [];
          }
          console.error('[Woolworths] No product elements found');
          return [];
        }
      }

      await this.sleep(4000);

      // Collect product articles
      const articles = await driver.findElements(By.css('article'));
      console.error(`[Woolworths] Found ${articles.length} product articles`);

      const products: ProductResult[] = [];

      for (const article of articles) {
        try {
          // Product name
          let name = '';
          try {
            // Try clickable title elements
            const titleEl = await article.findElement(By.css('[class*="cursor-pointer"], a[class*="title"], [class*="name"], h3, h2'));
            name = (await titleEl.getText()).trim();
          } catch {
            try {
              // Fallback to any link or span with product-related class
              const links = await article.findElements(By.css('a, span, div'));
              for (const el of links) {
                const text = (await el.getText()).trim();
                if (text.length > 15 && !text.startsWith('R ') && !text.startsWith('R')) {
                  name = text;
                  break;
                }
              }
            } catch {
              // skip
            }
          }

          if (!name) {
            // Try extracting from article text
            const text = await article.getText();
            const lines = text.split('\n').filter((l) => l.trim());
            name = lines.find(
              (l) => l.length > 15 && !/^R\s*[\d,]+/.test(l)
            ) || '';
          }

          if (!name) continue;

          // Price
          let priceText = '';
          try {
            const priceEl = await article.findElement(By.css('strong, [class*="price"], [class*="Price"], span[class*="currency"]'));
            priceText = (await priceEl.getText()).trim();
          } catch {
            const text = await article.getText();
            const priceMatch = text.match(/R\s*[\d,]+(?:\.\d{2})?/);
            if (priceMatch) priceText = priceMatch[0];
          }

          if (!priceText) continue;
          const priceValue = this.normalizePrice(priceText);
          if (priceValue === 0) continue;

          // URL
          let url = '';
          try {
            const link = await article.findElement(By.css('a[href*="/product"], a[href*="/browse"], a[href*="/dept"]'));
            url = await link.getAttribute('href');
            if (url && !url.startsWith('http')) {
              url = `${this.baseUrl}${url}`;
            }
          } catch {
            try {
              const link = await article.findElement(By.css('a'));
              url = await link.getAttribute('href');
            } catch {
              // no URL
            }
          }

          // Image
          let imageUrl = '';
          try {
            const img = await article.findElement(By.css('img[src*="/images/"], img[src*="/medias/"], img'));
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
          // skip malformed article
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
