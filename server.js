const http = require('node:http');
const { convertUrlToMarkdown } = require('./worker');
const { getPlaywrightStats } = require('./playwright');

function pickHeader(req, name) {
  const v = req.headers[String(name).toLowerCase()];
  return Array.isArray(v) ? v.join(',') : v;
}

function acceptsJson(req) {
  const accept = pickHeader(req, 'accept') || '';
  return accept.includes('application/json') || accept.includes('text/json');
}

function send(res, code, body, contentType) {
  res.statusCode = code;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
  res.end(body);
}

function parseTargetUrl(reqUrl) {
  const u = new URL(reqUrl || '/', 'http://localhost');
  if (u.pathname === '/' || u.pathname === '') {
    const q = (u.searchParams.get('url') || '').trim();
    return q || null;
  }
  const raw = decodeURIComponent(u.pathname.slice(1));
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)) {
    return `https://${raw}`;
  }
  return null;
}

function parseEngine(reqUrl) {
  const u = new URL(reqUrl || '/', 'http://localhost');
  const e = (u.searchParams.get('engine') || '').trim().toLowerCase();
  if (!e) return null;
  if (e === 'auto' || e === 'fetch' || e === 'playwright') return e;
  return null;
}

function parseEngineFromEnv() {
  const v = (process.env.PREFERRED_ENGINE || process.env.READER_ENGINE || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'auto' || v === 'fetch' || v === 'playwright') return v;
  return null;
}

function parseEngineFromHeader(req) {
  const h = (pickHeader(req, 'x-engine') || '').trim().toLowerCase();
  if (!h) return null;
  if (h === 'auto' || h === 'fetch' || h === 'playwright') return h;
  return null;
}

function parseTimeoutMs(reqUrl) {
  const u = new URL(reqUrl || '/', 'http://localhost');
  const v = (u.searchParams.get('timeoutMs') || '').trim();
  if (!v) return 30000;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return 30000;
  return n;
}

async function handler(req, res) {
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    if (u.pathname === '/healthz') {
      return send(res, 200, 'ok\n', 'text/plain; charset=utf-8');
    }
    if (u.pathname === '/metrics') {
      const stats = {
        playwright: getPlaywrightStats(),
      };
      return send(res, 200, JSON.stringify(stats, null, 2) + '\n', 'application/json; charset=utf-8');
    }
    if (req.method !== 'GET') {
      return send(res, 405, 'Method Not Allowed\n', 'text/plain; charset=utf-8');
    }

    const target = parseTargetUrl(req.url);
    if (!target) {
      return send(
        res,
        400,
        'Missing target URL. Use /https://example.com or /?url=https://example.com\n',
        'text/plain; charset=utf-8'
      );
    }

    const engine = parseEngineFromHeader(req) || parseEngine(req.url) || parseEngineFromEnv() || 'auto';
    const timeoutMs = parseTimeoutMs(req.url);
    const result = await convertUrlToMarkdown({
      url: target,
      engine,
      timeoutMs,
    });

    if (acceptsJson(req)) {
      return send(res, 200, JSON.stringify(result, null, 2) + '\n', 'application/json; charset=utf-8');
    }
    return send(res, 200, (result.markdown || '') + '\n', 'text/plain; charset=utf-8');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const status = err && err.statusCode ? err.statusCode : 500;
    if (status === 429) {
      res.setHeader('Retry-After', '2');
    }
    return send(res, status, `Error: ${msg}\n`, 'text/plain; charset=utf-8');
  }
}

const host = process.env.READER_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.READER_PORT || '8787', 10);

http.createServer(handler).listen(port, host, () => {
  console.log(`reader-lite listening on http://${host}:${port}`);
});
