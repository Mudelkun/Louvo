/**
 * The words at the top of `/`, in a component both the flow and its fallback
 * render.
 *
 * This exists to fix one defect, and it is the most consequential one on the
 * site: **the html served for `/` contained no `<h1>` and none of this copy.**
 *
 * `<TryOnFlow>` reads `useSearchParams`, which opts its whole subtree out of the
 * static render, so `app/page.tsx` wraps it in a `<Suspense>` — and what Next
 * writes into the static html for a bailed-out boundary is the *fallback*. The
 * fallback was four grey rectangles. So a crawler on its first pass received a
 * page whose only heading was `<HomeSeo>`'s `<h2>` far below the fold, and the
 * front door of a site meant to rank for "virtual hairstyle try-on" had no
 * headline in it at all.
 *
 * What that looks like in a result is not a missing feature, it is a wrong one:
 * with no heading to corroborate the title tag Google rewrites the title, and
 * with no prose near the top of the document it composes a description out of
 * whatever text it can find — which on this site was the *footer*. Both were
 * visible on the live listing before this.
 *
 * So the heading is lifted out of `<TryOnFlow>` and rendered by the fallback
 * too. It is deliberately not a second copy of the copy: one component, two
 * callers, so the words a crawler reads and the words a visitor reads cannot
 * drift — which is the same rule `sync-contract.mjs` enforces across the three
 * programs, applied to a sentence.
 *
 * It carries no client hooks and no state, so it costs the fallback nothing and
 * hydration replaces it with an identical tree.
 */
export function HeroHeading() {
  return (
    <>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-violet-ink">
        Virtual hairstyle try-on
      </p>
      <h1 className="mt-4 font-display text-[clamp(2.3rem,5.4vw,3.7rem)] leading-[1.02] tracking-[-0.02em] text-ink">
        Try any Hairstyle on <span className="text-gradient italic">your own</span> photo.
      </h1>
      <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-ink-soft">
        Upload one selfie and see yourself in any cut in the catalogue — bobs, fades, pixies,
        braids and the rest.
      </p>
    </>
  );
}
