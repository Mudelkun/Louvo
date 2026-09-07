'use client';

/**
 * The packs.
 *
 * The counts are the API's — `credit_products`, published rows, in their own
 * sort order — so adding a pack is a row and a Stripe Price rather than a
 * release. That is the same argument the catalogue makes about hairstyles, and
 * it is why nothing here is a hardcoded list of three.
 *
 * The prices are *indicative* until Stripe is wired, and the section says so in
 * a line the visitor will actually read rather than in a footnote. A buy button
 * that opens nothing is worse than one that says it is not open yet — the same
 * reasoning `server/src/env.ts` applies to store links.
 *
 * It lives on `/account` rather than on a pricing page of its own, and that is
 * deliberate. A price shown to somebody who has not yet seen a preview is a
 * number with nothing attached to it — the same argument the app makes for
 * having no paywall in its first run. The packs belong where somebody who has
 * spent their free previews goes looking for more, which is their balance.
 */

import { useEffect, useState } from 'react';

import { fetchCredits, type CreditProduct } from '../lib/api';
import { hasApi, hasStripe } from '../lib/config';
import { formatPrice, formatUnit, packName, priceFor } from '../lib/pricing';
import { Notice, Skeleton } from './ui';

export function Pricing() {
  const [products, setProducts] = useState<CreditProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasApi) return;
    void fetchCredits()
      .then((response) => setProducts(response.products))
      .catch(() => setFailed(true));
  }, []);

  if (!hasApi || failed) {
    return (
      <Notice
        tone="warn"
        title="Packs are not available in this build"
        body="This deployment has no connection to the Luvo service, so there is nothing to quote. Every visitor still gets two free previews once it does."
      />
    );
  }

  return (
    <>
      {/* The balance is not repeated here: it is the three stats this section
          sits under, and a second copy of a number is a second thing that can
          disagree with the server. */}
      <div className="grid gap-5 sm:grid-cols-3">
        {products === null
          ? Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[260px] w-full rounded-[22px]" />
            ))
          : products.map((product) => {
              const price = priceFor(product.id);
              const featured = product.badge === 'best_value';
              return (
                <div
                  key={product.id}
                  className={
                    'relative flex flex-col rounded-[22px] p-6 ring-1 ring-inset transition-colors ' +
                    'duration-300 ' +
                    (featured
                      ? 'bg-surface ring-violet/40'
                      : 'bg-surface/55 ring-line hover:bg-surface/80')
                  }
                >
                  {featured ? (
                    <span
                      className={
                        'absolute -top-2.5 left-6 rounded-full brand-gradient px-2.5 py-1 text-[10px] ' +
                        'font-extrabold uppercase tracking-[0.1em] text-on-violet'
                      }
                    >
                      Best value
                    </span>
                  ) : null}

                  <h3 className="font-display text-[26px] leading-none text-ink">
                    {packName(product.credits)}
                  </h3>

                  <div className="mt-5">
                    {price ? (
                      <>
                        <p className="tnum font-display text-[40px] leading-none text-ink">
                          {formatPrice(price)}
                        </p>
                        <p className="mt-1.5 text-[12.5px] text-muted">
                          {formatUnit(price, product.credits)} a preview
                        </p>
                      </>
                    ) : (
                      <p className="text-[13px] text-muted">Price not set yet</p>
                    )}
                  </div>

                  <p className="mt-5 flex-1 text-[13px] leading-relaxed text-muted">
                    {product.credits} generations, yours to spend whenever. They do not expire,
                    and a preview that fails is refunded automatically.
                  </p>

                  <button
                    type="button"
                    disabled
                    title="Checkout is not live yet"
                    className={
                      'mt-6 h-11 rounded-full text-[13.5px] font-semibold ' +
                      (featured
                        ? 'bg-violet text-on-violet opacity-45'
                        : 'bg-white/6 text-ink ring-1 ring-inset ring-line-strong opacity-55')
                    }
                  >
                    {hasStripe ? 'Buy' : 'Coming soon'}
                  </button>
                </div>
              );
            })}
      </div>

      <p className="mt-8 text-center text-[12.5px] leading-relaxed text-amber">
        Checkout is not open yet. The prices above are what these packs will cost — they are
        shown so you can tell us whether they are right, not because you can be charged them
        today.
      </p>
    </>
  );
}
