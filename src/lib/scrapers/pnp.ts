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

export class PnpScraper extends BaseScraper {
  readonly store = 'Pick n Pay';
  readonly baseUrl = 'https://www.pnp.co.za';

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

      const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(query)}`;
      console.error(`[PnP] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);

      // Dismiss delivery-address prompt that overlays the page
      try {
        const dismissBtn = await driver.findElement(
          By.css('button:contains("Do this later"), button:contains("Add delivery details later")')
        );
        await dismissBtn.click();
        await this.sleep(2000);
      } catch {
        // Try XPath variant
        try {
          const dismissBtn = await driver.findElement(
            By.xpath('//button[contains(text(),"Add delivery details later") or contains(text(),"Do this later")]')
          );
          await dismissBtn.click();
          await this.sleep(2000);
        } catch {
          // no overlay
        }
      }

      // Accept cookie banner
      try {
        const acceptBtn = await driver.findElement(
          By.css('button:contains("Accept"), .cookie-banner button, .cc-banner button')
        );
        await acceptBtn.click();
        await this.sleep(2000);
      } catch {
        try {
          const acceptBtn = await driver.findElement(
            By.xpath('//button[contains(text(),"Accept")]')
          );
          await acceptBtn.click();
          await this.sleep(2000);
        } catch {
          // no banner
        }
      }

      // Wait for product grid to render (Angular/Spartacus)
      try {
        await driver.wait(
          until.elementLocated(By.css('div.product-grid-item')),
          35000
        );
      } catch {
        try {
          await driver.wait(
            until.elementLocated(By.css('[class*="product"]')),
            20000
          );
        } catch {
          const source = await driver.getPageSource();
          if (
            source.includes('no results') ||
            source.includes('No results') ||
            source.includes('0 results')
          ) {
            return [];
          }
          console.error('[PnP] No product elements found');
          return [];
        }
      }

      // Let Angular finish rendering
      await this.sleep(4000);

      // Find product containers
      const containers = await driver.findElements(By.css('div.product-grid-item'));
      console.error(`[PnP] Found ${containers.length} product containers`);

      const products: ProductResult[] = [];

      for (const container of containers) {
        try {
          // Product name from the info link
          let name = '';
          try {
            const nameEl = await container.findElement(
              By.css('a.product-grid-item__info-container__name span, a.product-grid-item__info-container__name')
            );
            name = (await nameEl.getText()).trim();
          } catch {
            // Fallback: aria-label on the container itself
            try {
              const ariaLabel = await container.getAttribute('aria-label');
              if (ariaLabel && ariaLabel.length > 3) {
                name = ariaLabel.trim();
              }
            } catch {}
          }

          if (!name || name.length < 3) {
            // Last resort: image alt
            try {
              const img = await container.findElement(By.css('img'));
              name = (await img.getAttribute('alt')) || '';
            } catch {}
          }

          if (!name) continue;

          // Price — look for .price or .cms-price-display or .plp-price
          let priceText = '';
          try {
            const priceEl = await container.findElement(
              By.css('span.price, .cms-price-display, .plp-price, [class*="price"]')
            );
            priceText = (await priceEl.getText()).trim();
          } catch {
            const text = await container.getText();
            const priceMatch = text.match(/R[0-9 ,.]+/);
            if (priceMatch) priceText = priceMatch[0];
          }

          if (!priceText) continue;
          const priceValue = this.normalizePrice(priceText);
          if (priceValue === 0 || !isFinite(priceValue)) continue;

          // Product URL
          let url = '';
          try {
            const linkEl = await container.findElement(By.css('a[href*="/p/"]'));
            url = (await linkEl.getAttribute('href')) || '';
          } catch {
            try {
              const linkEl = await container.findElement(By.css('a.product-action'));
              url = (await linkEl.getAttribute('href')) || '';
            } catch {}
          }

          if (url && !url.startsWith('http')) {
            url = `${this.baseUrl}${url}`;
          }

          // Image URL
          let imageUrl = '';
          try {
            const imgEl = await container.findElement(By.css('img[src*="cdn-prd"]'));
            imageUrl = (await imgEl.getAttribute('src')) || '';
          } catch {
            try {
              const imgEl = await container.findElement(By.css('img'));
              imageUrl = (await imgEl.getAttribute('src')) || '';
            } catch {}
          }

          // Stock status
          const text = await container.getText();
          const inStock = !text.includes('Currently out of stock');

          products.push({
            name,
            price: priceText.trim(),
            priceValue,
            store: this.store,
            url,
            imageUrl: imageUrl || undefined,
            inStock,
          });
        } catch {
          // skip malformed container
        }
      }

      // Fallback: if nothing found via containers, try full text extraction
      if (products.length === 0) {
        console.error('[PnP] Fallback text extraction mode');
        const items = await driver.findElements(By.css('div.product-grid-item'));

        for (const item of items) {
          try {
            const text = await item.getText();
            const lines = text.split('\n').filter((l) => l.trim());

            const nameLine = lines.find(
              (l) =>
                l.length > 5 &&
                !l.startsWith('R ') &&
                !l.startsWith('R') &&
                l !== 'Add to cart' &&
                !l.includes('review') &&
                !l.includes('SMART SHOPPER') &&
                !l.includes('Club')
            );
            const priceLine = lines.find((l) => /R[0-9 ,.]+/.test(l));

            if (nameLine && priceLine) {
              const priceValue = this.normalizePrice(priceLine);
              if (priceValue > 0 && isFinite(priceValue)) {
                products.push({
                  name: nameLine.trim(),
                  price: priceLine.trim(),
                  priceValue,
                  store: this.store,
                  url: '',
                  inStock: !text.includes('Currently out of stock'),
                });
              }
            }
          } catch {}
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
