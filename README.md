# reader-lite

Deterministic URL -> Markdown (no AI/LLMs).

It fetches a page (or renders it with Playwright) and converts the main article content to Markdown.

## Quickstart

```bash
npm install
npm start
```

Server defaults to `http://127.0.0.1:8787`.

## Use

```bash
curl 'http://127.0.0.1:8787/https://steipete.me/posts/just-talk-to-it'
curl 'http://127.0.0.1:8787/https://apnews.com/article/ireland-grok-deepfakes-eu-privacy-9d3d096a1f4dc0baddde3d5d91e050b7'
```

Query param form:

```bash
curl 'http://127.0.0.1:8787/?url=https://steipete.me/posts/just-talk-to-it'
```

Debug JSON:

```bash
curl -H 'Accept: application/json' 'http://127.0.0.1:8787/https://steipete.me/posts/just-talk-to-it'
```

## How it works

- Fetch HTML over HTTP.
- If `engine=auto` and the fetch looks blocked, fall back to Playwright (if installed).
- Run Mozilla Readability, then Turndown (GFM) to produce Markdown.

## Config

Options:
- `engine=auto|fetch|playwright`
- `timeoutMs=30000`

Engine can also be set via:
- header: `X-Engine: auto|fetch|playwright`
- env: `PREFERRED_ENGINE` or `READER_ENGINE`
- env (auto mode): `PREFER_PLAYWRIGHT_DOMAINS=apnews.com,nytimes.com`

Env:
- `READER_HOST` (default `127.0.0.1`)
- `READER_PORT` (default `8787`)

Endpoints:
- `GET /healthz`
- `GET /metrics` (JSON)

Playwright (optional):

```bash
npm i playwright
npx playwright install chromium
```

## Rendering tip

If you render the produced Markdown on a web page and want wrapped code blocks:

```css
pre {
  word-wrap: break-word;
  white-space: pre-wrap;
}

code {
  word-wrap: break-word;
  white-space: pre-wrap;
}
```
