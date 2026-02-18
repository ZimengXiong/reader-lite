const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _browserPromise;
let _browser;

function envInt(name, fallback) {
  const v = (process.env[name] || '').trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MAX_CONCURRENCY = envInt('PLAYWRIGHT_MAX_CONCURRENCY', 2);
const MAX_QUEUE = envInt('PLAYWRIGHT_MAX_QUEUE', 20);
const QUEUE_TIMEOUT_MS = envInt('PLAYWRIGHT_QUEUE_TIMEOUT_MS', 10000);

let _inFlight = 0;
/** @type {Array<{ resolve: (v: any) => void, reject: (e: any) => void, timer: any }>} */
const _queue = [];

function makeBusyError(message) {
  const err = new Error(message);
  err.statusCode = 429;
  err.code = 'PLAYWRIGHT_BUSY';
  return err;
}

function acquireSlot() {
  if (_inFlight < MAX_CONCURRENCY) {
    _inFlight++;
    return Promise.resolve();
  }

  if (_queue.length >= MAX_QUEUE) {
    return Promise.reject(makeBusyError('Playwright queue full'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _queue.findIndex((x) => x.resolve === resolve);
      if (idx >= 0) _queue.splice(idx, 1);
      reject(makeBusyError('Playwright queue timeout'));
    }, QUEUE_TIMEOUT_MS);

    _queue.push({ resolve, reject, timer });
  }).then(() => {
    _inFlight++;
  });
}

function releaseSlot() {
  _inFlight = Math.max(0, _inFlight - 1);
  const next = _queue.shift();
  if (!next) return;
  clearTimeout(next.timer);
  next.resolve(true);
}

function getPlaywrightStats() {
  return {
    maxConcurrency: MAX_CONCURRENCY,
    maxQueue: MAX_QUEUE,
    queueTimeoutMs: QUEUE_TIMEOUT_MS,
    inFlight: _inFlight,
    queued: _queue.length,
  };
}

async function loadPlaywright() {
  try {
    // playwright is optionalDependency
    return require('playwright');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`playwright not installed. Install with: npm i playwright && npx playwright install chromium. Original: ${msg}`);
  }
}

async function getBrowser() {
  if (_browserPromise) return _browserPromise;
  _browserPromise = (async () => {
    const pw = await loadPlaywright();
    const browser = await pw.chromium.launch({ headless: true });
    _browser = browser;
    const close = async () => {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    };
    process.once('exit', close);
    process.once('SIGINT', () => close().finally(() => process.exit(130)));
    process.once('SIGTERM', () => close().finally(() => process.exit(143)));
    return browser;
  })();
  return _browserPromise;
}

async function closeBrowser() {
  const b = _browser;
  _browser = undefined;
  _browserPromise = undefined;
  if (!b) return;
  try {
    await b.close();
  } catch {
    // ignore
  }
}

/**
 * @param {URL} url
 * @param {number} timeoutMs
 */
async function scrapeDomWithPlaywright(url, timeoutMs) {
  await acquireSlot();
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: DEFAULT_UA,
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  try {
    // Speed: block heavy resources that aren't needed for Readability extraction.
    await page.route('**/*', (route) => {
      const req = route.request();
      const typ = req.resourceType();
      if (typ === 'image' || typ === 'media' || typ === 'font') {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Keep this short: many sites never truly go network-idle.
    await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 5000) }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 2000) }).catch(() => undefined);

    const html = await page.content();
    const title = await page.title().catch(() => '');
    const finalUrl = page.url();
    return { html, title, finalUrl };
  } finally {
    await page.close().catch(() => undefined);
    await ctx.close().catch(() => undefined);

    releaseSlot();
  }
}

module.exports = {
  scrapeDomWithPlaywright,
  closeBrowser,
  getPlaywrightStats,
};
