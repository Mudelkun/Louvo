/**
 * The page a shared link actually lands on.
 *
 * One HTML document, served from this process, with no build step, no framework
 * and no assets of its own. That is not minimalism for its own sake — it is what
 * lets the whole share loop close without adding a second deployment to a repo
 * whose brief says not to introduce infrastructure unless it is genuinely
 * needed. The one image on the page is a catalog render already sitting on the
 * CDN, and the one font is the system's.
 *
 * The page has two audiences and they want different things:
 *
 * **A scraper.** WhatsApp, Facebook, iMessage and Slack all fetch the url and
 * render a card from its Open Graph tags before any human sees it, with no
 * JavaScript. So the title, the description and `og:image` are in the markup,
 * and the image is the catalog's own mannequin render of the cut that was
 * shared — not the sharer's photograph, which never reaches this server and must
 * never be the thing that unfurls in somebody else's group chat.
 *
 * **A person.** Who either has the app, in which case the point of this page is
 * to get out of the way as fast as possible, or does not, in which case it is to
 * be a small clear advertisement with one button.
 *
 * ## Why it tries the app first and why that is done the way it is
 *
 * `location.href = 'hairify://s/<code>'` on a phone with the app installed opens
 * it and the page is never seen. On a phone without it, the scheme fails — and
 * how it fails is the part that has to be handled: iOS shows an error dialogue
 * unless the navigation happens without a user gesture and is quickly followed
 * by something else, and Android's Chrome ignores an unknown scheme silently.
 * So the attempt is fired once, immediately, and a timer sends the browser to
 * the store shortly after *unless the page was backgrounded* — which is the one
 * observable signal that the app did open. `document.hidden` is that signal.
 *
 * Universal links (an `https://` url the OS routes into the app without ever
 * loading this page) are the better mechanism and are configured separately;
 * `wellKnown()` below serves both association files when the ids are set. This
 * page is what happens when they are not, or when the link was opened somewhere
 * the association does not apply — a desktop browser, an in-app webview.
 */

import type { Gender } from './types.js';

export interface LandingContent {
  code: string;
  hairstyleName: string;
  /** The catalog's own mannequin render of the cut. Never the user's photo. */
  imageUrl: string | null;
  gender: Gender | null;
  /** `hairify://s/<code>`. */
  deepLink: string;
  iosUrl: string | null;
  androidUrl: string | null;
  /** Where the buttons point when neither store is configured yet. */
  fallbackUrl: string | null;
  canonicalUrl: string;
  iosAppId: string | null;
}

/** Everything that reaches the document as text, escaped once, at the edge. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** And once more for the few values that land inside a `<script>` string. */
const escapeJs = (value: string): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * The copy, in one place.
 *
 * The brief for this feature is that a shared look should read as somebody
 * showing their friends a haircut, not as an ad — so the headline is about the
 * cut and the app is the small print under it. The cut's name is the only
 * variable, and it is what makes the card in a group chat worth opening.
 */
export const shareTitle = (hairstyleName: string): string =>
  `See yourself with a ${hairstyleName} — Hairify`;

export const shareDescription =
  'Upload one photo and see how any haircut looks on you before you sit in the chair.';

export function landingPage(content: LandingContent): string {
  const title = shareTitle(content.hairstyleName);
  const store = content.iosUrl ?? content.androidUrl ?? content.fallbackUrl;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(content.canonicalUrl)}">
<meta name="description" content="${escapeHtml(shareDescription)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hairify">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(shareDescription)}">
<meta property="og:url" content="${escapeHtml(content.canonicalUrl)}">
${content.imageUrl ? `<meta property="og:image" content="${escapeHtml(content.imageUrl)}">
<meta property="og:image:alt" content="${escapeHtml(`A ${content.hairstyleName}, shown on a Hairify mannequin`)}">` : ''}
<meta name="twitter:card" content="${content.imageUrl ? 'summary_large_image' : 'summary'}">
${content.iosAppId ? `<meta name="apple-itunes-app" content="app-id=${escapeHtml(content.iosAppId)}, app-argument=${escapeHtml(content.canonicalUrl)}">` : ''}
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #FAF8F5; color: #181513;
    font: 500 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    width: 100%; max-width: 380px; background: #fff; border: 1px solid #EBE5DD; border-radius: 28px;
    padding: 28px; text-align: center; box-shadow: 0 8px 18px rgba(42, 32, 24, 0.07);
  }
  .mark { font-size: 11px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #9A6B24; }
  .shot {
    margin: 20px auto 0; width: 100%; aspect-ratio: 1 / 1; border-radius: 20px; overflow: hidden;
    background: #F2EEE8; display: flex; align-items: center; justify-content: center;
  }
  .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
  h1 { font-size: 24px; line-height: 1.2; letter-spacing: -0.5px; margin: 22px 0 8px; }
  p { margin: 0; color: #443E38; }
  .cta {
    display: block; margin-top: 22px; padding: 17px 20px; border-radius: 14px;
    background: #9A6B24; color: #fff; font-weight: 700; font-size: 16px; text-decoration: none;
  }
  .secondary { display: block; margin-top: 12px; color: #8C857C; font-size: 13px; text-decoration: none; }
  .foot { margin-top: 22px; font-size: 12px; color: #8C857C; }
</style>
</head>
<body>
  <main class="card">
    <div class="mark">Hairify</div>
    <div class="shot">${
      content.imageUrl
        ? `<img src="${escapeHtml(content.imageUrl)}" alt="${escapeHtml(`A ${content.hairstyleName}`)}" width="512" height="512">`
        : ''
    }</div>
    <h1>See yourself with a ${escapeHtml(content.hairstyleName)}</h1>
    <p>${escapeHtml(shareDescription)}</p>
    ${
      store
        ? `<a class="cta" id="get" href="${escapeHtml(store)}">Try it on your photo</a>`
        : `<a class="cta" id="get" href="${escapeHtml(content.deepLink)}">Open Hairify</a>`
    }
    <a class="secondary" href="${escapeHtml(content.deepLink)}">Already have Hairify? Open the app</a>
    <div class="foot">Free to try. No account needed.</div>
  </main>
<script>
(function () {
  var deepLink = ${escapeJs(content.deepLink)};
  var ios = ${escapeJs(content.iosUrl ?? '')};
  var android = ${escapeJs(content.androidUrl ?? '')};
  var fallback = ${escapeJs(content.fallbackUrl ?? '')};
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var store = (isIOS ? ios : isAndroid ? android : '') || fallback || '';

  // The button gets the right store for this device before anything else
  // happens, so a person who ignores the redirect still lands in the right
  // place — and so a desktop visitor is never sent to an App Store page they
  // cannot install from.
  var get = document.getElementById('get');
  if (get && store) get.href = store;

  if (!isIOS && !isAndroid) return;

  // Try the app. If it opens, this document is backgrounded and the timer below
  // finds \`document.hidden\` true and does nothing; if it does not, the store is
  // where this person needs to go and two seconds is long enough to be sure.
  var tried = Date.now();
  try { window.location.href = deepLink; } catch (error) { /* unknown scheme */ }

  setTimeout(function () {
    if (document.hidden || Date.now() - tried > 4000) return;
    if (store) window.location.replace(store);
  }, 1600);
})();
</script>
</body>
</html>`;
}

/**
 * The page for a code that does not resolve.
 *
 * Deliberately not a 404 shape with an apology. Somebody arrived here from a
 * friend's message, which makes them the most qualified visitor this server ever
 * gets, and a dead link is no reason to waste that — the download button is the
 * same one, and only the sentence above it changes.
 */
export function unknownLinkPage(content: Omit<LandingContent, 'hairstyleName' | 'imageUrl'>): string {
  return landingPage({
    ...content,
    hairstyleName: 'new haircut',
    imageUrl: null,
  });
}

/**
 * The two association files that turn `https://<host>/s/<code>` into a link the
 * OS opens in the app rather than in a browser.
 *
 * Served only when the ids are configured, and absent otherwise — an
 * `apple-app-site-association` naming a team id that is not ours is worse than
 * none, because iOS caches it. Both are plain JSON on well-known paths and both
 * must be served over HTTPS with no redirect, which is what a Railway domain
 * already does.
 */
export function appleAppSiteAssociation(teamId: string, bundleId: string): unknown {
  return {
    applinks: {
      details: [{ appIDs: [`${teamId}.${bundleId}`], components: [{ '/': '/s/*', comment: 'share links' }] }],
    },
  };
}

export function assetLinks(packageName: string, fingerprints: string[]): unknown {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
