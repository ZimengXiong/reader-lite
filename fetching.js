const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function snippet(s, maxLen) {
  const trimmed = String(s || '').replace(/\s+/g, ' ').trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
}

/**
 * @param {URL} url
 * @param {number} timeoutMs
 */
async function fetchHtml(url, timeoutMs) {
  const ctrl = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: ctrl,
    headers: {
      'User-Agent': DEFAULT_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    }
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const finalUrl = res.url || url.href;
  const raw = await res.text();
  const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    status: res.status,
    contentType,
    html: raw,
    title: (titleMatch && titleMatch[1] ? titleMatch[1] : '').trim(),
    finalUrl,
  };
}

function looksBlockedOrUseless(input) {
  const status = input.status;
  const contentType = input.contentType || '';
  const html = input.html || '';
  if (status === 401 || status === 403 || status === 429) return { blocked: true, reason: `http_${status}` };
  if (status >= 500 && status <= 599) return { blocked: true, reason: `http_${status}` };
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return { blocked: false };

  const lower = html.toLowerCase();

  const hardNeedles = [
    'verify you are human',
    'unusual traffic',
    'access denied',
    'incapsula',
  ];
  const softNeedles = [
    'cf-turnstile',
    'captcha',
  ];

  const hasHard = hardNeedles.some((n) => lower.includes(n));
  if (hasHard) {
    return { blocked: true, reason: `botwall_hint: ${snippet(lower, 100)}` };
  }

  const hasSoft = softNeedles.some((n) => lower.includes(n));
  if (hasSoft) {
    const likelyArticle =
      lower.includes('<article') ||
      lower.includes('property="og:type" content="article"') ||
      lower.includes('data-named-page-type="article"');

    if (likelyArticle && html.length > 8000) {
      return { blocked: false };
    }

    if (html.length < 5000 || !likelyArticle) {
      return { blocked: true, reason: `botwall_hint: ${snippet(lower, 100)}` };
    }
  }

  return { blocked: false };
}

module.exports = {
  fetchHtml,
  looksBlockedOrUseless,
};
