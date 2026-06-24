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

      const searchUrl = `${this.baseUrl}/browse?searchterm=${encodeURIComponent(query)}&fr=1`;
      console.error(`[Woolworths] Navigating: ${searchUrl}`);
      await driver.get(searchUrl);

      // Accept cookie banner
      try {
        const acceptBtn = await driver.findElement(
          By.css('button:has-text("Accept"), button:has-text("dismiss"), [class*="cookie"] button, #cookie-accept, .cookie-btn')
        );
        await acceptBtn.click();
        await this.sleep(2000);
      } catch {}

      // Wait for rendering
      try {
        await driver.wait(until.elementLocated(By.css('article, [class*="product"]')), 30000);
      } catch {
        try {
          await driver.wait(
            until.elementLocated(By.css('[class*="Product"], [data-testid*="product"]')),
            20000
          );
        } catch {
          const source = await driver.getPageSource();
          if (source.includes('no results') || source.includes('No results') || source.includes('0 results')) {
            return [];
          }
          console.error('[Woolworths] No product elements found');
          return [];
        }
      }

      await this.sleep(4000);

      // PRIMARY: Extract from __NEXT_DATA__ JSON (most reliable)
      const jsonProducts = await this.extractFromNextData(driver, query);
      if (jsonProducts.length > 0) {
        console.error(`[Woolworths] Found ${jsonProducts.length} products via __NEXT_DATA__`);
        return jsonProducts;
      }

      // FALLBACK: DOM extraction
      console.error('[Woolworths] Falling back to DOM extraction');
      const articles = await driver.findElements(By.css('article'));
      console.error(`[Woolworths] Found ${articles.length} product articles`);

      const products: ProductResult[] = [];

      for (const article of articles) {
        try {
          let name = '';
          try {
            const titleEl = await article.findElement(
              By.css('[class*="cursor-pointer"], a[class*="title"], [class*="name"], h3, h2')
            );
            name = (await titleEl.getText()).trim();
          } catch {
            try {
              const links = await article.findElements(By.css('a, span, div'));
              for (const el of links) {
                const text = (await el.getText()).trim();
                if (text.length > 15 && !text.startsWith('R ') && !text.startsWith('R')) {
                  name = text;
                  break;
                }
              }
            } catch {}
          }

          if (!name) {
            const text = await article.getText();
            const lines = text.split('\n').filter((l) => l.trim());
            name = lines.find((l) => l.length > 15 && !/^R[0-9 ,.]+/.test(l)) || '';
          }

          if (!name) continue;

          let priceText = '';
          try {
            const priceEl = await article.findElement(
              By.css('strong, [class*="price"], [class*="Price"], span[class*="currency"]')
            );
            priceText = (await priceEl.getText()).trim();
          } catch {
            const text = await article.getText();
            const priceMatch = text.match(/R[0-9 ,.]+/);
            if (priceMatch) priceText = priceMatch[0];
          }

          if (!priceText) continue;
          const priceValue = this.normalizePrice(priceText);
          if (priceValue === 0 || !isFinite(priceValue)) continue;

          let url = '';
          try {
            const link = await article.findElement(
              By.css('a[href*="/product"], a[href*="/browse"], a[href*="/dept"]')
            );
            url = await link.getAttribute('href');
            if (url && !url.startsWith('http')) url = `${this.baseUrl}${url}`;
          } catch {
            try {
              const link = await article.findElement(By.css('a'));
              url = await link.getAttribute('href');
            } catch {}
          }

          let imageUrl = '';
          try {
            const img = await article.findElement(By.css('img[src*="/images/"], img[src*="/medias/"], img'));
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

  private async extractFromNextData(driver: WebDriver, _query: string): Promise<ProductResult[]> {
    try {
      const results = await driver.executeAsyncScript(`
        const callback = arguments[arguments.length - 1];
        try {
          const script = document.getElementById('__NEXT_DATA__');
          if (!script || !script.textContent) { callback([]); return; }
          const data = JSON.parse(script.textContent);
          const queries = data?.props?.pageProps?.dehydratedState?.queries;
          if (!queries || !Array.isArray(queries)) { callback([]); return; }

          for (const q of queries) {
            const items = q?.state?.data?.pages?.[0]?.productCatalogItems?.items;
            if (items && Array.isArray(items) && items.length > 0) {
              const mapped = items.map(item => ({
                name: item.name || '',
                price: item.price?.amount,
                priceValue: item.price?.amount,
                imageUrl: item.image?.src ? 'https://www.woolworths.co.za' + item.image.src : '',
                url: item.url ? 'https://www.woolworths.co.za' + item.url : '',
              })).filter(p => p.name && p.priceValue > 0);
              callback(mapped);
              return;
            }
          }
          callback([]);
        } catch(e) { callback([]); }
      `);

      if (!results || !Array.isArray(results) || results.length === 0) return [];

      return results.map((item: any) => ({
        name: String(item.name || '').trim(),
        price: `R ${Number(item.priceValue).toFixed(2)}`,
        priceValue: Number(item.priceValue) || 0,
        store: this.store,
        url: String(item.url || ''),
        imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
        inStock: true,
      })).filter((p: ProductResult) => p.name && p.priceValue > 0 && isFinite(p.priceValue));
    } catch {
      return [];
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
