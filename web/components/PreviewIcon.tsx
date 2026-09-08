/**
 * The mark for a preview, which is the one thing this product counts.
 *
 * ## Why a gem and not an eye
 *
 * The first version of this was an eye, on the reading that a preview is a
 * *look* at yourself with a haircut on. That describes the thing correctly and
 * marks it wrongly. The mark does not appear where a preview is being looked at
 * — it appears beside a **number**: in the header pill, over the balance on
 * `/account`, and on the pack somebody is deciding whether to buy. In all three
 * it stands for a countable token that is held, spent and refunded, and an eye
 * is not something anybody has three of. Worse, an eye beside a count in a
 * top bar is the mark for *views* — the thing a page has had, not the thing a
 * visitor owns — which is the opposite of what this number means.
 *
 * A cut gem is the shape every product that sells a spendable unit has settled
 * on, and that convention is worth inheriting rather than arguing with: it reads
 * as one-of-many, as valuable, and as something that leaves you when it is used.
 *
 * ## The rest of it
 *
 * Drawn rather than imported, in the same 24-box and at the same stroke weight
 * as the header's other marks (`GridIcon`, `FrameIcon` in `SiteHeader.tsx`), so
 * a balance beside a nav link reads as part of one set. The facet lines are what
 * keep it a gem rather than a rhombus at 15px, which is the size it is smallest
 * at; do not simplify them away.
 *
 * It is `currentColor` rather than a hardcoded violet: the caller decides, which
 * is what lets the same mark sit in the brand accent beside a balance and in
 * muted ink inside a menu row without a second component. Everywhere it stands
 * for the count it is `text-violet`, the colour the app *is* — never the pink,
 * which by the rule in `globals.css` is only ever the far end of a gradient.
 *
 * It is decoration in every place it appears: the number it sits beside is the
 * information, so every caller carries the words in an `aria-label` or beside it
 * in the flow. A mark on its own is not a label.
 */

export function PreviewIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {/* Crown, girdle and pavilion: the outline, the widest line across it,
            and the two facets that meet at the point. */}
        <path d="M6.4 3.7h11.2l3.7 5.6L12 20.4 2.7 9.3z" />
        <path d="M2.7 9.3h18.6" />
        <path d="M11 3.7 8.4 9.3 12 20.4l3.6-11.1-2.6-5.6" />
      </g>
    </svg>
  );
}
