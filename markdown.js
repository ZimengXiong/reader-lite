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

function concatOuterHtml(nodes, limit) {
  const out = [];
  let count = 0;
  for (const n of nodes || []) {
    if (!n) continue;
    if (typeof n.outerHTML !== 'string') continue;
    out.push(n.outerHTML);
    count++;
    if (limit && count >= limit) break;
  }
  return out.join('');
}

function addTitleHeading(markdown, title) {
  const t = String(title || '').trim();
  const md = String(markdown || '').trim();
  if (!md) return '';
  if (!t) return md + '\n';
  return `# ${t}\n\n${md}\n`;
}

function wordCount(s) {
  const trimmed = String(s || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} html
 * @param {string} urlForBase
 */
async function htmlToMarkdownWithMeta(html, urlForBase, options) {
  const html2 = ensureBaseHref(html, urlForBase);
  // linkedom is ESM-only
  const linkedom = await import('linkedom');
  const parsed = linkedom.parseHTML(html2);
  const document = parsed.document;

  const selector = options && options.selector ? String(options.selector).trim() : '';
  const fallbackTitle = options && options.title ? String(options.title).trim() : '';
  const td = makeTurndown();

  let selectorMarkdown = '';
  if (selector) {
    try {
      const nodes = Array.from(document.querySelectorAll(selector));
      const contentHtml = concatOuterHtml(nodes, 50);
      const md = contentHtml ? td.turndown(contentHtml).trim() : '';
      if (md) {
        const title = (document && document.title ? String(document.title).trim() : '') || fallbackTitle;
        selectorMarkdown = addTitleHeading(md, title);
      }
    } catch {
      selectorMarkdown = '';
    }
  }

  let article = null;
  try {
    article = new Readability(document).parse();
  } catch {
    article = null;
  }

  if (article && article.content) {
    const md = td.turndown(article.content);
    const title = String(article.title || '').trim();
    let readabilityMarkdown = '';
    if (title) readabilityMarkdown = `# ${title}\n\n${md.trim()}\n`;
    else if (fallbackTitle) readabilityMarkdown = addTitleHeading(md.trim(), fallbackTitle);
    else readabilityMarkdown = md.trim() + '\n';

    if (!selectorMarkdown) {
      return { markdown: readabilityMarkdown, mode: 'readability' };
    }

    const rwc = wordCount(readabilityMarkdown);
    const swc = wordCount(selectorMarkdown);

    // Prefer rules when Readability under-extracts; otherwise keep Readability as the safer default.
    if (rwc < 150 && swc >= 150) return { markdown: selectorMarkdown, mode: 'selector' };
    if (swc > 0 && swc <= Math.floor(rwc * 1.8) && swc >= Math.floor(rwc * 0.6)) {
      if (swc > rwc) return { markdown: selectorMarkdown, mode: 'selector' };
    }
    return { markdown: readabilityMarkdown, mode: 'readability' };
  }

  const bodyHtml = document.body && document.body.innerHTML ? document.body.innerHTML : html2;
  const md = td.turndown(bodyHtml).trim();
  const bodyMarkdown = fallbackTitle ? addTitleHeading(md, fallbackTitle) : md + '\n';
  if (!selectorMarkdown) return { markdown: bodyMarkdown, mode: 'body' };

  const bwc = wordCount(bodyMarkdown);
  const swc = wordCount(selectorMarkdown);
  if (bwc < 150 && swc >= 150) return { markdown: selectorMarkdown, mode: 'selector' };
  if (swc > 0 && swc <= Math.floor(bwc * 1.8) && swc >= Math.floor(bwc * 0.6)) {
    if (swc > bwc) return { markdown: selectorMarkdown, mode: 'selector' };
  }
  return { markdown: bodyMarkdown, mode: 'body' };
}

async function htmlToMarkdown(html, urlForBase, options) {
  const out = await htmlToMarkdownWithMeta(html, urlForBase, options);
  return out.markdown;
}

module.exports = {
  htmlToMarkdown,
  htmlToMarkdownWithMeta,
};
