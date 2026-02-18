const { fetchHtml, looksBlockedOrUseless } = require('./fetching');
const { scrapeDomWithPlaywright } = require('./playwright');
const { htmlToMarkdown } = require('./markdown');

function parseDomainListEnv(name) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatches(host, domain) {
  if (!host || !domain) return false;
  if (host === domain) return true;
  return host.endsWith(`.${domain}`);
}

const PREFER_PLAYWRIGHT_DOMAINS = parseDomainListEnv('PREFER_PLAYWRIGHT_DOMAINS');
const PREFER_FETCH_DOMAINS = parseDomainListEnv('PREFER_FETCH_DOMAINS');

/**
 * @param {{ url: string, engine: 'auto'|'fetch'|'playwright', timeoutMs: number }} input
 */
async function convertUrlToMarkdown(input) {
  const warnings = [];
  const parsed = new URL(input.url);

  const preferredEngine = (() => {
    if (input.engine !== 'auto') return input.engine;

    const host = parsed.hostname.toLowerCase();
    if (PREFER_FETCH_DOMAINS.length && PREFER_FETCH_DOMAINS.some((d) => hostMatches(host, d))) {
      return 'fetch';
    }
    if (PREFER_PLAYWRIGHT_DOMAINS.length && PREFER_PLAYWRIGHT_DOMAINS.some((d) => hostMatches(host, d))) {
      return 'playwright';
    }
    return 'auto';
  })();

  let engineUsed = preferredEngine;
  let html = '';
  let title = '';
  let finalUrl = input.url;
  let blockedDetected = false;

  let fetchedOk = false;

  if (preferredEngine === 'fetch' || preferredEngine === 'auto') {
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

  if (preferredEngine === 'playwright' || (preferredEngine === 'auto' && blockedDetected)) {
    try {
      engineUsed = 'playwright';
      const scraped = await scrapeDomWithPlaywright(parsed, input.timeoutMs);
      html = scraped.html;
      title = scraped.title;
      finalUrl = scraped.finalUrl;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (preferredEngine === 'playwright') {
        throw err;
      }

      if (err && err.statusCode === 429 && blockedDetected) {
        throw err;
      }

      if (fetchedOk && html) {
        engineUsed = 'fetch';
        warnings.push(`playwright unavailable/failed (${msg}); returning fetch result instead`);
      } else {
        throw err;
      }
    }
  }

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
