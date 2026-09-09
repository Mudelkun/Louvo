import { join } from 'node:path';
import { ImageResponse } from 'next/og';

import { SITE_NAME } from '../lib/seo';

/**
 * The card every page without one of its own unfurls into.
 *
 * A style page carries the catalogue's render of its cut and needs nothing from
 * here; this is for `/`, `/styles`, `/hairstyles` and the collections, which had
 * no `og:image` at all — and a link with no image is a bare grey row in a chat,
 * on a timeline and in Slack, which is where a lot of a new site's first traffic
 * comes from.
 *
 * **It is a photograph of somebody, not a slide.** It was six lines of type on a
 * violet gradient: correct, on brand, and an advertisement for an entirely
 * visual product carrying no evidence that the product works. The objection a
 * reader has to Louvo is *this will not look like me*, and nothing written
 * answers it. So the right of the card is a real before-and-after — the same
 * pairs the hero on `/` wipes between, joined down the middle of one face. That
 * is the whole proposition in one frame, and it is the only part of the card
 * that still reads at the ~92px Google draws a result thumbnail at: type does
 * not survive that reduction and a face does.
 *
 * The words stay generated rather than committed for the reason they always
 * were — `SITE_NAME` is read from `lib/seo.ts`, so the card cannot drift from
 * the title tag. Next renders this once at build time and serves it as a static
 * file, so the composition below costs nothing per request.
 *
 * No custom font is loaded. Fetching one at build time is a network dependency
 * in the build for a difference nobody comparing two chat cards would name, and
 * the site's own display serif is loaded by `next/font` in a way this renderer
 * cannot reach.
 */

/**
 * The headline, and it is deliberately not the brand line.
 *
 * "See the haircut before the chair" is a good sentence and it is one nobody has
 * ever typed into a search box — it describes the product to somebody who
 * already knows what it is. What goes on the card is the clause the `<h1>` on
 * `/` uses, because a card is a promise the page then has to keep, and two
 * different first sentences for one product read as two products.
 */
const HEADLINE = 'Try any Hairstyle with your photo';
const SUBLINE =
  'Upload one selfie and see yourself in any cut in the catalogue — bobs, fades, pixies, braids and the rest.';

export const alt = `${SITE_NAME} — one photograph, shown before and after a haircut`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The photograph panel's own width; the words take the rest of the card. */
const PANEL = 470;

export default async function OpengraphImage() {
  const split = await heroSplit();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          // `--color-canvas`, and the violet the palette is measured from.
          background: 'linear-gradient(135deg, #08060e 0%, #14102a 55%, #23103a 100%)',
          color: '#f4f1fa',
        }}
      >
        {/* The words. They take the whole card when there is no photograph on
            disk, which is the state a fresh checkout is in — see `heroSplit`. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: split ? '76px 54px 76px 80px' : '90px',
            width: split ? size.width - PANEL : size.width,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: '#a98cfb',
            }}
          >
            {SITE_NAME}
          </div>

          <div
            style={{
              marginTop: '26px',
              fontSize: split ? 70 : 84,
              lineHeight: 1.06,
              letterSpacing: '-0.03em',
            }}
          >
            {HEADLINE}
          </div>

          <div style={{ marginTop: '26px', fontSize: 28, lineHeight: 1.35, color: '#c9c2d8' }}>
            {SUBLINE}
          </div>

          {/* The brand gradient, as the one piece of ornament — the same violet
              and pink the launcher icon is measured from. */}
          <div
            style={{
              marginTop: '42px',
              height: '10px',
              width: '300px',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #a98cfb 0%, #fc73ac 100%)',
            }}
          />
        </div>

        {split ? (
          <div style={{ display: 'flex', position: 'relative', width: PANEL, height: size.height }}>
            <img src={split} width={PANEL} height={size.height} alt="" />

            {/* The seam. It is what tells a reader the two halves are one
                picture rather than two photographs stood side by side. */}
            <div
              style={{
                position: 'absolute',
                left: PANEL / 2 - 1,
                top: 0,
                width: 2,
                height: size.height,
                background: 'rgba(255,255,255,0.85)',
              }}
            />

            {/* The card's own ground, carried a little way into the photograph,
                so the panel reads as part of the card rather than as a crop
                pasted onto the side of it. */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 96,
                height: size.height,
                background: 'linear-gradient(90deg, #1a1230 0%, rgba(26,18,48,0) 100%)',
              }}
            />

            <Tag label="Before" left={20} />
            <Tag label="After" left={PANEL / 2 + 20} />
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}

/** One of the two words over the photograph. */
function Tag({ label, left }: { label: string; left: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: 24,
        display: 'flex',
        padding: '8px 17px',
        borderRadius: 999,
        fontSize: 19,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: '#ffffff',
        background: 'rgba(9,7,16,0.62)',
      }}
    >
      {label}
    </div>
  );
}

/**
 * Which of the six pairs the card uses, named rather than picked.
 *
 * The hero on `/` rotates through all of them because a *set* is the argument
 * there — one face answers "will this look like me" for one person. A card has
 * room for one frame, so this is a choice: the pair where the two halves differ
 * most while the face stays plainly the same person, on a subject whose hair
 * type a hairstyle app is most often assumed not to serve.
 */
const HERO_PAIR = { before: 'before-1-locs.webp', after: 'after-1-locs.webp' };

/**
 * One face, before down the left of the frame and after down the right.
 *
 * Two things about this are not free choices.
 *
 * **It is composed here rather than drawn as two clipped `<img>`s**, because the
 * two source frames have to be cropped identically or the eyes do not land on
 * one line and the seam reads as a collage. Cutting both from the same `cover`
 * box and butting them together is exact by construction; two elements offset
 * inside overflow boxes is the same arithmetic done twice, in a renderer with no
 * way to check its own output.
 *
 * **The pair is converted to PNG**, and that is a hard requirement rather than
 * tidiness: the hero files are WebP and satori — the renderer behind
 * `ImageResponse` — cannot decode WebP at all. It does not warn or skip the
 * image; the whole render throws, which at build time is a failed deploy. If the
 * hero set is ever re-shot in another format, this is the line that decides
 * whether the card still has a picture in it.
 *
 * A missing directory, a renamed pair or a missing `sharp` all return null and
 * the card falls back to the words alone. A fresh checkout has no hero files, so
 * that is an ordinary state rather than an error — the same rule `heroImages()`
 * in `app/page.tsx` follows about the hero itself.
 */
async function heroSplit(): Promise<string | null> {
  const dir = join(process.cwd(), 'public', 'hero');
  const half = PANEL / 2;

  try {
    // Imported at call time so a checkout without it degrades to the words
    // rather than failing to build, and named in `package.json` so that its
    // presence is a fact rather than a hope — it arrives as Next's own image
    // dependency, which is not a contract.
    //
    // `?? loaded` is the interop and it is load-bearing rather than defensive:
    // `sharp` is CommonJS, and a native module at that, so whether the callable
    // lands on `.default` or on the namespace itself is decided by the bundler
    // rather than by this file. Getting it wrong throws below, and the only
    // symptom is a card with no photograph in it.
    const loaded = await import('sharp');
    const sharp = (loaded.default ?? loaded) as unknown as typeof loaded.default;

    const cut = async (file: string, side: 'left' | 'right') => {
      const covered = await sharp(join(dir, file))
        .resize(PANEL, size.height, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      return sharp(covered)
        .extract({ left: side === 'left' ? 0 : half, top: 0, width: half, height: size.height })
        .png()
        .toBuffer();
    };

    const [before, after] = await Promise.all([
      cut(HERO_PAIR.before, 'left'),
      cut(HERO_PAIR.after, 'right'),
    ]);

    const joined = await sharp({
      create: { width: PANEL, height: size.height, channels: 3, background: '#08060e' },
    })
      .composite([
        { input: before, left: 0, top: 0 },
        { input: after, left: half, top: 0 },
      ])
      .png()
      .toBuffer();

    return `data:image/png;base64,${joined.toString('base64')}`;
  } catch (error) {
    // Noisy in the build log and silent in the output, which is the right way
    // round: a card with no photograph in it is still a usable card, and a
    // renamed hero file is not something anybody would notice by looking at a
    // deploy. A fresh checkout has no `public/hero` and logs this once.
    console.warn(`[opengraph-image] no before/after photograph in the card: ${String(error)}`);
    return null;
  }
}
