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

// No backslashes in regex to avoid GitHub API double-escaping
function isValidProductName(name: string): boolean {
  if (!name || name.length < 3) return false;
  if (/off +for +members/i.test(name)) return false;
  if (/^[0-9]+% *off/i.test(name.trim())) return false;
  if (/^[0-9]+% */i.test(name.trim())) return false;
  return true;
}

export class DischemScraper extends BaseScraper {
  readonly store = 'Dis-Chem';
  readonly baseUrl = 'https://www.dischem.co.za';

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

      driver.manage().setTimeouts({ pageLoad: 20000, script: 10000, implicit: 5000 });

      await driver.executeScript(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })"
      );

      const searchUrl = `${this.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
      console.error(`[Dis-Chem] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);

      try {
        const acceptBtn = await driver.findElement(By.css('button[aria-label*="Accept"], .accept-cookies, #cookie-accept'));
        await acceptBtn.click();
        await this.sleep(2000);
      } catch {
        // No cookie banner
      }

      try {
        await driver.wait(
          until.elementLocated(By.css('li.item.product, li.product-item, ol.products.list.items li')),
          30000
        );
      } catch {
        try {
          await driver.wait(
            until.elementLocated(By.css('[class*="product"][class*="item"], .product-item')),
            20000
          );
        } catch {
          const source = await driver.getPageSource();
          if (source.includes('no results') || source.includes('No results') || source.includes('0 results')) {
            return [];
          }
          console.error('[Dis-Chem] No product elements found');
          return [];
        }
      }

      await this.sleep(3000);

      // Skip JSON extraction for Magento - go straight to DOM
      const jsonProducts: ProductResult[] = [];

      // Fallback to DOM extraction
      const containers = await driver.findElements(
        By.css('li.item.product, li.product-item, ol.products.list.items > li')
      );
      console.error(`[Dis-Chem] Found ${containers.length} product containers`);

      const products: ProductResult[] = [];

      for (const container of containers) {
        try {
          let name = '';
          try {
            const linkEl = await container.findElement(By.css('a.product-item-link'));
            name = (await linkEl.getText()).trim();
          } catch {
            try {
              const imgEl = await container.findElement(By.css('img.product-image-photo'));
              name = (await imgEl.getAttribute('alt')) || '';
            } catch {
              // skip
            }
          }

          if (!name || !isValidProductName(name)) continue;

          let priceText = '';
          try {
            const specialPrice = await container.findElement(By.css('.special-price .price, .price-box .special-price .price'));
            priceText = await specialPrice.getText();
          } catch {
            try {
              const regularPrice = await container.findElement(By.css('.price, .price-box .price, span.price'));
              priceText = await regularPrice.getText();
            } catch {
              const text = await container.getText();
              const priceMatch = text.match(/R[0-9 ,.]+/);
              if (priceMatch) priceText = priceMatch[0];
            }
          }

          if (!priceText) continue;
          const priceValue = this.normalizePrice(priceText);
          if (priceValue === 0 || !isFinite(priceValue)) continue;

          let url = '';
          try {
            const linkEl = await container.findElement(By.css('a.product-item-link'));
            url = await linkEl.getAttribute('href');
          } catch {
            try {
              const linkEl = await container.findElement(By.css('a[href*="/"]'));
              url = await linkEl.getAttribute('href');
            } catch {}
          }

          let imageUrl = '';
          try {
            const imgEl = await container.findElement(By.css('img.product-image-photo'));
            imageUrl = await imgEl.getAttribute('src');
          } catch {}

          products.push({
            name,
            price: priceText.trim(),
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

      // Fallback: text extraction if DOM approach found nothing
      if (products.length === 0) {
        console.error('[Dis-Chem] Fallback text extraction mode');
        const items = await driver.findElements(By.css('li.item.product, li.product-item'));

        for (const item of items) {
          try {
            const text = await item.getText();
            const lines = text.split('\n').filter((l) => l.trim());

            const nameLine = lines.find(
              (l) =>
                !l.startsWith('R ') &&
                !l.startsWith('R') &&
                l.length > 5 &&
                !l.includes('Special') &&
                !l.includes('Save') &&
                !/off +for +members/i.test(l) &&
                !/^[0-9]+% *off/i.test(l)
            );
            const priceLine = lines.find((l) => /R[0-9 ,.]+/.test(l));

            if (nameLine && priceLine && isValidProductName(nameLine)) {
              const priceValue = this.normalizePrice(priceLine);
              if (priceValue > 0 && isFinite(priceValue)) {
                products.push({
                  name: nameLine.trim(),
                  price: priceLine.trim(),
                  priceValue,
                  store: this.store,
                  url: '',
                  inStock: true,
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