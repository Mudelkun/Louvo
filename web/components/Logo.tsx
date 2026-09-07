/**
 * The lockup: the app's mark, then the wordmark.
 *
 * The wordmark is set in the display serif with the brand gradient clipped to
 * the text, which is the one place the two logo colours are allowed to meet —
 * see the palette rule in `globals.css`.
 *
 * ## The mark is the launcher artwork, and it is here at 32px rather than 20
 *
 * This was a wordmark alone, on the argument that the launcher icon is drawn for
 * a rounded tile at 48px and arrives as a smudge inline. That argument still
 * holds *at the size it was made about*: the figure is a split head — a violet
 * crop on one side, pink waves on the other — and at 20px the strands close up
 * and it is a light blob on a dark square.
 *
 * At 32px it is not that. The split reads, the two colours read, and the tile is
 * the object somebody already has on their home screen if they have the app —
 * which is the whole reason to put it here. A site and an app that share a name
 * and share nothing visible are two products to anybody who has both.
 *
 * `web/public/luvo-mark.png` is cut from `assets/splash-icon.png`, which is the
 * `npm run icons` output whose ground is transparent rather than filled — so
 * what lands on the canvas is the tile and its lit rim, not a hard black square
 * with corners that do not match. Re-cut it from that file if the artwork
 * changes; do not hand-export a second one.
 *
 * It is `alt=""` on purpose. The word "Luvo" is next to it in text, and both
 * call sites wrap this in a link that names itself — a mark that repeated the
 * name would be read out twice.
 */

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local 128px
          asset drawn at 32; the optimiser has nothing to do here. */}
      <img
        src="/luvo-mark.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
        draggable={false}
      />
      <span className="font-display text-[26px] leading-none tracking-[-0.01em]">
        <span className="text-gradient">Luvo</span>
      </span>
    </span>
  );
}

/**
 * The gradient dot used as a bullet and as the favicon's shape.
 *
 * Small enough that a gradient in it is a suggestion rather than a statement,
 * which is exactly what a bullet should be.
 */
export function Dot({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`brand-gradient inline-block rounded-full ${className}`} />;
}
