import { ImageResponse } from 'next/og';

import { SITE_NAME, TAGLINE } from '../lib/seo';

/**
 * The card every page without one of its own unfurls into.
 *
 * A style page carries the catalogue's render of its cut and needs nothing from
 * here; this is for `/`, `/styles`, `/hairstyles` and the collections, which had
 * no `og:image` at all — and a link with no image is a bare grey row in a chat,
 * on a timeline and in Slack, which is where a lot of a new site's first traffic
 * comes from.
 *
 * It is generated rather than a committed PNG for one reason: it is drawn from
 * `SITE_NAME` and `TAGLINE`, so the words in the card are the same values the
 * title tag is built from and cannot drift from them. Next renders it once at
 * build time and serves it as a static file, so there is no per-request cost.
 *
 * No custom font is loaded. Fetching one at build time is a network dependency
 * in the build for a difference nobody comparing two chat cards would name, and
 * the site's own display serif is loaded by `next/font` in a way this renderer
 * cannot reach. The type here is the renderer's default, sized and spaced to
 * carry the brand rather than to imitate the page.
 */
export const alt = `${SITE_NAME} — ${TAGLINE.toLowerCase()}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          // `--color-canvas`, and the violet the palette is measured from.
          background: 'linear-gradient(135deg, #08060e 0%, #14102a 55%, #23103a 100%)',
          color: '#f4f1fa',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            fontSize: 30,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#a98cfb',
          }}
        >
          {SITE_NAME}
        </div>

        <div
          style={{
            marginTop: '28px',
            fontSize: 84,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            maxWidth: '900px',
          }}
        >
          See the haircut before the chair.
        </div>

        <div style={{ marginTop: '32px', fontSize: 34, color: '#c9c2d8', maxWidth: '860px' }}>
          Upload one photo and try any cut in the catalogue on your own face.
        </div>

        {/* The brand gradient, as the one piece of ornament — the same violet
            and pink the launcher icon is measured from. */}
        <div
          style={{
            marginTop: '54px',
            height: '10px',
            width: '320px',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #a98cfb 0%, #fc73ac 100%)',
          }}
        />
      </div>
    ),
    size,
  );
}
