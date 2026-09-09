import type { MetadataRoute } from 'next';

import { SITE_DESCRIPTION, SITE_NAME, TAGLINE } from '../lib/seo';

/**
 * The web app manifest.
 *
 * Not a ranking factor and never claimed to be one — it is here because it is
 * half of what "installable" means on Android and because Lighthouse's PWA and
 * best-practices audits are what a lot of people actually check a site against.
 * The colours are the palette's own: `--color-canvas` and the measured violet.
 *
 * `display: browser` rather than `standalone`, which is the honest answer for
 * this site. A standalone window takes away the url bar, and the try-on's whole
 * navigation — a shared link, a search result, a style page somebody wants to
 * send to a friend — is urls. There is a phone app for the standalone case.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'browser',
    background_color: '#08060e',
    theme_color: '#08060e',
    categories: ['lifestyle', 'photo', 'beauty'],
    /**
     * The real mark, cut from the launcher artwork by `npm run icons`.
     *
     * These were a hand-drawn `icon.svg` — a single gradient stroke, on the
     * argument that the artwork is drawn for a rounded tile at 48px and arrives
     * as a smudge at 16. The argument was sound and the result was not what
     * anybody wanted in their tab: a letterform that is not the logo reads as a
     * different product to somebody who has the app on their home screen, which
     * is the whole thing a favicon is for.
     *
     * Both files are Next.js file conventions in `app/`, so the `<link>` tags
     * are emitted for us and these entries only have to name them for an
     * installed window. Sizes are the files' real ones — a manifest claiming 512
     * and serving 180 is an install prompt that refuses or renders blurred.
     */
    icons: [
      { src: '/icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
}
