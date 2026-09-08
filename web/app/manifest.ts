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
     * The svg first, because it is the only one at a size an installer wants.
     *
     * `luvo-mark.png` is 128px — the header's mark, not an app icon — and it is
     * listed at its real size rather than at a flattering one. A manifest that
     * claims 512 and serves 128 is an install prompt that either refuses or
     * renders a blurred icon, which is worse than the browser falling back to
     * the vector. A real 512px maskable PNG is what `npm run icons` cuts for the
     * phone app; putting one here is a file to add, not a line to change.
     */
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/luvo-mark.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
    ],
  };
}
