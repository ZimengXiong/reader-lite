/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { convertUrlToMarkdown } = require('../worker');
const { closeBrowser } = require('../playwright');

function parseArgs(argv) {
  const out = {
    file: 'test_urls.json',
    outDir: '',
    limit: 0,
    concurrency: 3,
    timeoutMs: 30000,
    engine: 'auto',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.file = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--limit') out.limit = Number.parseInt(argv[++i], 10) || 0;
    else if (a === '--concurrency') out.concurrency = Number.parseInt(argv[++i], 10) || 3;
    else if (a === '--timeoutMs') out.timeoutMs = Number.parseInt(argv[++i], 10) || 30000;
    else if (a === '--engine') out.engine = (argv[++i] || 'auto');
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function slugify(s, maxLen = 80) {
  const raw = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!raw) return 'item';
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen).replace(/-+$/g, '');
}

function shortHash(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
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

function writeMarkdownFile(outDir, item, result) {
  const title = String(result.title || item.title || item.url || '').trim();
  const h = shortHash(item.url);
  const name = `${item.id}-${slugify(title, 70)}-${h}.md`;
  const fpath = path.join(outDir, name);
  fs.writeFileSync(fpath, String(result.markdown || ''), 'utf8');
  return { fileName: name, filePath: fpath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const outDir = args.outDir
    ? path.resolve(process.cwd(), args.outDir)
    : path.resolve(process.cwd(), 'runs', stamp);
  ensureDir(outDir);

  const filePath = path.resolve(process.cwd(), args.file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  const entries = Object.entries(json).map(([id, v]) => ({
    id,
    url: v.url,
    title: v.title,
    feedName: v.feedName,
  }));

  const list = args.limit > 0 ? entries.slice(0, args.limit) : entries;
  console.log(`Exporting ${list.length} URLs to ${outDir}`);

  const results = await runPool(list, args.concurrency, async (item) => {
    const t0 = Date.now();
    try {
      const r = await convertUrlToMarkdown({
        url: item.url,
        engine: args.engine,
        timeoutMs: args.timeoutMs,
      });
      const ms = Date.now() - t0;
      const file = writeMarkdownFile(outDir, item, r);
      return {
        id: item.id,
        url: item.url,
        feedName: item.feedName,
        expectedTitle: item.title,
        engineUsed: r.engineUsed,
        blockedDetected: r.blockedDetected,
        title: r.title,
        finalUrl: r.finalUrl,
        warnings: r.warnings || null,
        ms,
        markdownFile: file.fileName,
        ok: true,
      };
    } catch (err) {
      const ms = Date.now() - t0;
      return {
        id: item.id,
        url: item.url,
        feedName: item.feedName,
        expectedTitle: item.title,
        ok: false,
        ms,
        error: err && err.message ? err.message : String(err),
      };
    }
  });

  const resultsPath = path.join(outDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n', 'utf8');

  const readmePath = path.join(outDir, 'README.md');
  const lines = ['# Scrape Run', '', `Generated: ${now.toISOString()}`, ''];
  for (const r of results) {
    if (!r.ok) {
      lines.push(`- [FAIL] ${r.id} ${r.url} (${r.ms}ms) - ${r.error}`);
      continue;
    }
    const label = r.title || r.expectedTitle || r.url;
    lines.push(`- [${label}](${r.markdownFile}) (id: ${r.id}, engine: ${r.engineUsed}, ms: ${r.ms})`);
  }
  lines.push('');
  lines.push('Raw results: `results.json`');
  fs.writeFileSync(readmePath, lines.join('\n') + '\n', 'utf8');

  const okCount = results.filter((x) => x.ok).length;
  const failCount = results.length - okCount;
  console.log(`Done. ok=${okCount}, failed=${failCount}`);
  console.log(`Wrote ${readmePath}`);

  await closeBrowser();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
