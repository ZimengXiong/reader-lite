/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const { convertUrlToMarkdown } = require('../worker');
const { closeBrowser } = require('../playwright');

function wordCount(md) {
  const text = String(md || '')
    .replace(/[`*_>#\[\]()!\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
}

function pickH1(md) {
  const lines = String(md || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('# ')) return line.slice(2).trim();
  }
  return '';
}

function parseArgs(argv) {
  const out = {
    file: 'test_urls.json',
    limit: 0,
    concurrency: 3,
    timeoutMs: 30000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = argv[++i];
    else if (a === '--limit') out.limit = Number.parseInt(argv[++i], 10) || 0;
    else if (a === '--concurrency') out.concurrency = Number.parseInt(argv[++i], 10) || 3;
    else if (a === '--timeoutMs') out.timeoutMs = Number.parseInt(argv[++i], 10) || 30000;
  }
  return out;
}

async function runPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;

  async function workerLoop() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(workerLoop());
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), args.file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);

  const entries = Object.entries(json).map(([id, v]) => ({
    id,
    url: v.url,
    expectedTitle: v.title,
    feedName: v.feedName,
  }));

  const list = args.limit > 0 ? entries.slice(0, args.limit) : entries;

  console.log(`Testing ${list.length} URLs (concurrency=${args.concurrency}, timeoutMs=${args.timeoutMs})`);

  const startedAt = Date.now();
  const results = await runPool(list, args.concurrency, async (item) => {
    const t0 = Date.now();
    try {
      const r = await convertUrlToMarkdown({
        url: item.url,
        engine: 'auto',
        timeoutMs: args.timeoutMs,
      });
      const dt = Date.now() - t0;
      const wc = wordCount(r.markdown);
      const h1 = pickH1(r.markdown);
      return {
        id: item.id,
        url: item.url,
        feedName: item.feedName,
        expectedTitle: item.expectedTitle,
        title: r.title,
        h1,
        engineUsed: r.engineUsed,
        blockedDetected: r.blockedDetected,
        wordCount: wc,
        warnings: r.warnings || null,
        ms: dt,
        ok: true,
      };
    } catch (err) {
      const dt = Date.now() - t0;
      return {
        id: item.id,
        url: item.url,
        feedName: item.feedName,
        expectedTitle: item.expectedTitle,
        ok: false,
        ms: dt,
        error: err && err.message ? err.message : String(err),
      };
    }
  });

  const totalMs = Date.now() - startedAt;

  const ok = results.filter((x) => x && x.ok);
  const bad = results.filter((x) => x && !x.ok);
  console.log(`Done in ${totalMs}ms. ok=${ok.length}, failed=${bad.length}`);

  // Print a compact table-like summary.
  for (const r of results) {
    if (!r.ok) {
      console.log(`[FAIL] ${r.id} ${r.ms}ms ${r.url} :: ${r.error}`);
      continue;
    }
    const shortTitle = String(r.h1 || r.title || '').slice(0, 90);
    console.log(`[OK] ${r.id} ${r.ms}ms engine=${r.engineUsed} words=${r.wordCount} :: ${shortTitle}`);
  }

  // Write a JSON artifact.
  const outPath = path.resolve(process.cwd(), 'batch_test_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);

  await closeBrowser();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
