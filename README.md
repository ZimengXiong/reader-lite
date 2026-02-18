# reader-lite

Small dev server that returns extracted Markdown for a URL (similar to `r.jina.ai`, but local).

How it works:
- fetch the URL over HTTP
- if it looks blocked (captcha/botwall) or fetch fails, optionally fall back to Playwright (rendered DOM)
- run Readability + Turndown (GFM) to convert the main content to Markdown

## Quickstart

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm start
```

Default address: `http://127.0.0.1:8787`

## API

Markdown (default):

```bash
curl 'http://127.0.0.1:8787/https://example.com'
```

Query param form:

```bash
curl 'http://127.0.0.1:8787/?url=https://example.com'
```

JSON response (debug):

```bash
curl -H 'Accept: application/json' 'http://127.0.0.1:8787/https://example.com'
```

Options:
- `engine=auto|fetch|playwright`
- `timeoutMs=30000`

Example:

```bash
curl 'http://127.0.0.1:8787/https://example.com?engine=fetch&timeoutMs=15000'
```

## Playwright (optional)

Playwright is an optional dependency.

If you install it, the `engine=auto` fallback can render sites that require JavaScript:

```bash
npm i playwright
npx playwright install chromium
```

If Playwright is not installed, the server will keep returning the fetch result in `engine=auto` mode.

## Concurrency

`fetch` work is naturally concurrent.

Playwright work is rate-limited to avoid running too many headless pages at once.

Environment variables:
- `PLAYWRIGHT_MAX_CONCURRENCY` (default: 2)
- `PLAYWRIGHT_MAX_QUEUE` (default: 20)
- `PLAYWRIGHT_QUEUE_TIMEOUT_MS` (default: 10000)

Metrics:

```bash
curl 'http://127.0.0.1:8787/metrics'
```
