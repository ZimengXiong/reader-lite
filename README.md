# reader-lite

Deterministic URL -> Markdown (no AI/LLMs).

```bash
npm install
npm start
```

```bash
curl 'http://127.0.0.1:8787/https://steipete.me/posts/just-talk-to-it'
curl 'http://127.0.0.1:8787/https://apnews.com/article/ireland-grok-deepfakes-eu-privacy-9d3d096a1f4dc0baddde3d5d91e050b7'
```

Debug JSON:

```bash
curl -H 'Accept: application/json' 'http://127.0.0.1:8787/https://steipete.me/posts/just-talk-to-it'
```

Options:
- `engine=auto|fetch|playwright`
- `timeoutMs=30000`

Env:
- `READER_HOST` (default `127.0.0.1`)
- `READER_PORT` (default `8787`)

Playwright (optional):

```bash
npm i playwright
npx playwright install chromium
```
