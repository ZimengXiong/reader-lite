const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

function ensureBaseHref(html, baseHref) {
  const lower = String(html || '').toLowerCase();
  if (lower.includes('<base ')) return html;
  const headIdx = lower.indexOf('<head');
  if (headIdx === -1) {
    return `<!doctype html><html><head><base href="${baseHref}"></head><body>${html}</body></html>`;
  }
  const headClose = lower.indexOf('>', headIdx);
  if (headClose === -1) return html;
  return html.slice(0, headClose + 1) + `<base href="${baseHref}">` + html.slice(headClose + 1);
}

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
  });
  td.use(gfm);
  return td;
}

/**
 * @param {string} html
 * @param {string} urlForBase
 */
async function htmlToMarkdown(html, urlForBase) {
  const html2 = ensureBaseHref(html, urlForBase);
  // linkedom is ESM-only
  const linkedom = await import('linkedom');
  const parsed = linkedom.parseHTML(html2);
  const document = parsed.document;

  let article = null;
  try {
    article = new Readability(document).parse();
  } catch {
    article = null;
  }

  const td = makeTurndown();
  if (article && article.content) {
    const md = td.turndown(article.content);
    const title = String(article.title || '').trim();
    if (title) return `# ${title}\n\n${md.trim()}\n`;
    return md.trim() + '\n';
  }

  const bodyHtml = document.body && document.body.innerHTML ? document.body.innerHTML : html2;
  return td.turndown(bodyHtml).trim() + '\n';
}

module.exports = {
  htmlToMarkdown,
};
