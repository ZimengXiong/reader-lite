# reader-lite

A weird little local server that turns article URLs into Markdown.

- Fetch HTML over HTTP.
- If `engine=auto` and the fetch looks blocked, render the page with Playwright (if installed).
- Run Mozilla Readability, then Turndown (GFM) to produce Markdown.

## Quickstart

```bash
npm install
# http://127.0.0.1:8787
npm start
```

## Use

```bash
curl 'http://127.0.0.1:8787/?url=https://apnews.com/article/ireland-grok-deepfakes-eu-privacy-9d3d096a1f4dc0baddde3d5d91e050b7'
```

## Config

| Setting | Where | Default | Notes |
| --- | --- | --- | --- |
| `engine` | query | `auto` | `auto` / `fetch` / `playwright` |
| `timeoutMs` | query | `30000` | total timeout budget |
| `X-Engine` | header | - | overrides `engine` query |
| `READER_HOST` | env | `127.0.0.1` | bind address |
| `READER_PORT` | env | `8787` | listen port |
| `PREFERRED_ENGINE` | env | - | sets default engine |
| `READER_ENGINE` | env | - | alias for `PREFERRED_ENGINE` |
| `PREFER_FETCH_DOMAINS` | env | - | comma-separated domains; auto mode prefers fetch |
| `PREFER_PLAYWRIGHT_DOMAINS` | env | - | comma-separated domains; auto mode prefers Playwright |
| `SCRAPER_RULES_FILE` | env | - | JSON map of domain -> CSS selector |
