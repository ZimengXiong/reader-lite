const { fetchHtml, looksBlockedOrUseless } = require('./fetching');
const { scrapeDomWithPlaywright } = require('./playwright');
const { htmlToMarkdown } = require('./markdown');

/**
 * @param {{ url: string, engine: 'auto'|'fetch'|'playwright', timeoutMs: number }} input
 */
async function convertUrlToMarkdown(input) {
  const warnings = [];
  const parsed = new URL(input.url);

  let engineUsed = input.engine;
  let html = '';
  let title = '';
  let finalUrl = input.url;
  let blockedDetected = false;

  let fetchedOk = false;

  if (input.engine === 'fetch' || input.engine === 'auto') {
    try {
      const fetched = await fetchHtml(parsed, input.timeoutMs);
      html = fetched.html;
      title = fetched.title;
      finalUrl = fetched.finalUrl || finalUrl;
      fetchedOk = true;

      const verdict = looksBlockedOrUseless({
        status: fetched.status,
        contentType: fetched.contentType,
        html: fetched.html,
      });
      blockedDetected = verdict.blocked;

      if (!verdict.blocked) {
        engineUsed = 'fetch';
      } else if (input.engine === 'auto') {
        warnings.push(`fetch looked blocked (${verdict.reason || 'unknown'}) - falling back to playwright`);
      }
    } catch (err) {
      blockedDetected = true;
      if (input.engine === 'fetch') throw err;
      warnings.push(`fetch failed (${err && err.message ? err.message : String(err)}) - falling back to playwright`);
    }
  }

  if (input.engine === 'playwright' || (input.engine === 'auto' && blockedDetected)) {
    try {
      engineUsed = 'playwright';
      const scraped = await scrapeDomWithPlaywright(parsed, input.timeoutMs);
      html = scraped.html;
      title = scraped.title;
      finalUrl = scraped.finalUrl;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (input.engine === 'playwright') {
        throw err;
      }

      // If the page looked blocked and Playwright is busy, fail fast instead of returning a likely block page.
      if (err && err.statusCode === 429 && blockedDetected) {
        throw err;
      }

      // In auto mode, if we already have a fetch result, return that instead of failing.
      if (fetchedOk && html) {
        engineUsed = 'fetch';
        warnings.push(`playwright unavailable/failed (${msg}); returning fetch result instead`);
      } else {
        throw err;
      }
    }
  }

  // If fetch failed, and playwright wasn't allowed, bail.
  if (!html && !fetchedOk) {
    throw new Error('no HTML extracted');
  }

  const markdown = await htmlToMarkdown(html, finalUrl);
  return {
    url: input.url,
    finalUrl,
    title,
    markdown,
    engineUsed,
    blockedDetected,
    warnings: warnings.length ? warnings : undefined,
  };
}

module.exports = {
  convertUrlToMarkdown,
};
