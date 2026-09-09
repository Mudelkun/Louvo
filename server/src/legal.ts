/**
 * The Privacy Policy and the Terms of Use, as public web pages.
 *
 * Both stores require a url a reviewer can open without installing anything —
 * App Store Connect asks for a privacy policy url on the listing and Apple's own
 * licence terms have to be reachable, and the Play Console refuses a submission
 * without one — so the documents cannot only be screens inside the app. They are
 * both, and the text is written once: `src/lib/legal.ts` in the app is the
 * source, `src/generated/legal.ts` here is the mechanical copy of it, and this
 * file is the second renderer.
 *
 * Same shape as `landing.ts` and for the same reasons: one HTML document per
 * request, served from this process, no build step, no framework, no assets and
 * no JavaScript. A legal document is the last page that should need a bundler to
 * be readable.
 *
 * The palette is the same hand-copied slice of the app's *light* scheme the
 * landing page uses, and it is light-only for the same reason: this is a
 * document somebody may print, save or send to a regulator, so what it looks
 * like is a fact about Louvo rather than about the browser opening it.
 */

import { OPERATOR } from './generated/legal.js';
import type { LegalBlock, LegalDocument } from './generated/legal.js';

/** Everything that reaches the document as text, escaped once, at the edge. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** A heading's own anchor, so a clause can be linked to directly. */
const anchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function renderBlock(block: LegalBlock): string {
  if (block.kind === 'p') return `<p>${escapeHtml(block.text)}</p>`;
  if (block.kind === 'list') {
    return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
  // A description list rather than a table: the details are whole sentences, and
  // a table narrow enough for a phone puts two words on each line of the second
  // column.
  return `<dl>${block.rows
    .map((row) => `<dt>${escapeHtml(row.term)}</dt><dd>${escapeHtml(row.detail)}</dd>`)
    .join('')}</dl>`;
}

/**
 * One document.
 *
 * `canonicalUrl` is passed in rather than derived, because this process does not
 * know whether it is behind `SHARE_BASE_URL`, a Railway domain or a local port,
 * and a canonical link that names the wrong origin is worse than none.
 */
export function legalPage(document: LegalDocument, canonicalUrl: string, otherUrl: string, otherTitle: string): string {
  // The wordmark points at the operator's own site rather than at this origin's
  // root: this process serves an API, a share landing page and these two
  // documents, and its root is a 404.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(document.title)} — Louvo</title>
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<meta name="description" content="${escapeHtml(document.summary)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Louvo">
<meta property="og:title" content="${escapeHtml(`${document.title} — Louvo`)}">
<meta property="og:description" content="${escapeHtml(document.summary)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 72px; background: #F9F8FC; color: #16121F;
    font: 400 16px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 680px; margin: 0 auto; }
  .mark {
    font-size: 11px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
    color: #4B23A8; text-decoration: none;
  }
  h1 { font-size: 32px; line-height: 1.16; letter-spacing: -0.8px; margin: 14px 0 10px; }
  h2 {
    font-size: 19px; line-height: 1.28; letter-spacing: -0.3px; margin: 38px 0 10px;
    padding-top: 22px; border-top: 1px solid #EAE6F4;
  }
  .summary { font-size: 17px; color: #453D57; margin: 0 0 6px; }
  .effective { font-size: 13px; color: #837C93; margin: 0; }
  p { margin: 0 0 12px; color: #453D57; }
  ul { margin: 0 0 12px; padding-left: 20px; color: #453D57; }
  li { margin-bottom: 7px; }
  dl { margin: 0 0 12px; }
  dt { font-weight: 700; color: #16121F; margin-top: 14px; }
  dd { margin: 3px 0 0; color: #453D57; }
  footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #EAE6F4; font-size: 13px; color: #837C93; }
  a { color: #4B23A8; }
</style>
</head>
<body>
  <main>
    <a class="mark" href="${escapeHtml(OPERATOR.website)}">Louvo</a>
    <h1>${escapeHtml(document.title)}</h1>
    <p class="summary">${escapeHtml(document.summary)}</p>
    <p class="effective">Effective ${escapeHtml(document.effective)}</p>
${document.sections
  .map(
    (section) =>
      `    <h2 id="${escapeHtml(anchor(section.heading))}">${escapeHtml(section.heading)}</h2>\n` +
      section.blocks.map((block) => `    ${renderBlock(block)}`).join('\n'),
  )
  .join('\n')}
    <footer>
      Also available inside the Louvo app, under Settings.
      See also our <a href="${escapeHtml(otherUrl)}">${escapeHtml(otherTitle)}</a>.
    </footer>
  </main>
</body>
</html>`;
}
