const fs = require('node:fs');

const DEFAULT_RULES = {
  'arstechnica.com': 'div.post-content',
  'bbc.co.uk': 'div.story-body__inner, div.vxp-column--single',
  'blog.cloudflare.com': 'div.post-content',
  'npr.org': '#storytext',
  'techcrunch.com': 'div.entry-content',
  'theverge.com': 'div.duet--article--article-body-component, h2.duet--article--dangerously-set-cms-markup, figure.w-full',
  'wired.com': 'main figure, article',
};

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase();
}

function readRulesFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SCRAPER_RULES_FILE must be a JSON object: { "example.com": "css selector" }');
  }
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    const key = normalizeHost(k);
    if (!key) continue;
    if (typeof v !== 'string' || !v.trim()) continue;
    out[key] = v.trim();
  }
  return out;
}

let _rules;
function getRules() {
  if (_rules) return _rules;

  const merged = { ...DEFAULT_RULES };
  const filePath = (process.env.SCRAPER_RULES_FILE || '').trim();
  if (filePath) {
    try {
      Object.assign(merged, readRulesFile(filePath));
    } catch {
      // ignore: keep defaults
    }
  }
  _rules = merged;
  return _rules;
}

function getSelectorForUrl(u) {
  const host = normalizeHost(u && u.hostname);
  if (!host) return '';
  const rules = getRules();

  let bestKey = '';
  for (const key of Object.keys(rules)) {
    if (host === key || host.endsWith(`.${key}`)) {
      if (key.length > bestKey.length) bestKey = key;
    }
  }
  return bestKey ? rules[bestKey] : '';
}

module.exports = {
  getSelectorForUrl,
};
