'use client';

/**
 * The packs, and the button that charges for one.
 *
 * The counts are the API's — `credit_products`, published rows, in their own
 * sort order — so adding a pack is a row and a Stripe Price rather than a
 * release. That is the same argument the catalogue makes about hairstyles, and
 * it is why nothing here is a hardcoded list of three.
 *
 * **The prices are the API's too, and that is the change this file exists to
 * record.** They were indicative figures in `web/lib/pricing.ts` under a
 * disabled button, marked as not-yet-charged, because a pricing page with no
 * prices tests nothing. That file is deleted: the server reads the Stripe Price
 * each pack points at and sends the amount, so what is on screen is what the
 * till will charge, and there is no second copy of it anywhere in this
 * repository to drift.
 *
 * It lives on `/account` and inside `<TopUpDialog>` rather than on a pricing
 * page of its own, and that is deliberate. A price shown to somebody who has not
 * yet seen a preview is a number with nothing attached to it — the same argument
 * the app makes for having no paywall in its first run. The packs belong where
 * somebody who has spent their free previews goes looking for more.
 *
 * ## Three states, and none of them is a button that does nothing
 *
 * - **No service.** No `NEXT_PUBLIC_API_URL`, or the call failed: there is
 *   nothing to quote and the notice says so.
 * - **No till.** The API answers `checkout: false` — no Stripe key on that
 *   deployment. The packs are still listed, because they are still what the
 *   product sells, and the line under them says buying is not open here. This is
 *   the state a fresh checkout is in, and the state the old "coming soon" button
 *   described from the wrong side of the wire.
 * - **Open.** A real button, which spends real money.
 *
 * ## Buying requires an account, and the button says so rather than failing
 *
 * Credits live on an account — that is the entire reason accounts exist here —
 * so a purchase made anonymously would be money spent into a browser's
 * `localStorage`, where clearing site data is a refund nobody gets. Rather than
 * let the server refuse it, pressing Buy while signed out **goes to `/sign-in`
 * carrying the pack**, and the return brings it back: `?buy=<product>` is put on
 * the path handed over as `next`, and this component picks it up on the way in.
 * One interruption, not a dead end and a second attempt.
 *
 * ## `compact` is the same shelf with the prose taken out
 *
 * One prop, and it changes no state, no price and no button — only how much is
 * said around them. The two surfaces are read in different postures: `/account`
 * is somewhere a visitor went on purpose to look at their account, and a card
 * there can afford a rubric and a sentence; `<TopUpDialog>` is raised over
 * somebody who pressed Generate and wants to press it again, and every line
 * between them and the Buy button is a line they did not ask for. So the
 * compact card is the mark, the pack, the price, the per-preview figure and the
 * button, and the footnote is one sentence instead of three.
 *
 * What it does **not** drop is anything a reader would be worse off not knowing.
 * "One-time payment" comes off the card and stays in the footnote, because the
 * thing it guards against — a price of this shape read as a monthly one — is
 * still worth ruling out, and in a dialogue this short the footnote is on the
 * same screen as the number rather than under a scroll. The three amber states
 * are untouched: a misconfigured deployment says so at the same volume wherever
 * the packs are drawn.
 *
 * That used to be a dialogue over this page holding the pack in state, which is
 * a shorter road to the same place. Sign-in is a page now (see
 * `components/auth/AuthScreen.tsx`), so the pack has to survive a navigation,
 * which means it has to be in the url. The parameter is stripped before the
 * checkout is opened, so it never reaches Stripe's `success_url` and a reload
 * does not re-buy.
 *
 * **The resume only runs where this component is mounted**, which is the one
 * thing to hold on to if the packs are ever drawn somewhere new. On `/account`
 * that is free — the packs are the page. Inside `<TopUpDialog>` it is not: the
 * dialogue is closed when the visitor comes back, so the style page reopens it
 * on `?buy=` before this ever renders (`TryOnAction` in `StyleDetail.tsx` has
 * that half). A third surface raising the packs owes the same.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, createCheckout, fetchCredits, type CreditProduct } from '../lib/api';
import { hasApi } from '../lib/config';
import { formatPrice, formatUnit, packName } from '../lib/money';
import { useAccount } from '../lib/state/AccountContext';
import { authHref } from './AuthButtons';
import { PreviewIcon } from './PreviewIcon';
import { Notice, Skeleton, Spinner } from './ui';

/**
 * Where to come back to after paying.
 *
 * The current path rather than `/account`, so somebody who topped up while
 * standing on a haircut comes back to that haircut with its length and texture
 * as they left them. Read at press time rather than at render, since the dialog
 * can be opened from a page the visitor then navigates within.
 */
const currentPath = (): string =>
  typeof window === 'undefined' ? '/account' : `${window.location.pathname}${window.location.search}`;

/**
 * The same path with the pack written into it, which is what `/sign-in` is
 * handed as `next`.
 *
 * The pack has to be in the url because the sign-in it survives is a navigation
 * — see the header. `#packs` goes with it *where that anchor exists*, so the
 * return lands on the row that was pressed rather than at the top of a long
 * account page; from the dialogue over a haircut there is no such section, and a
 * fragment naming nothing is a link that scrolls somewhere arbitrary on arrival.
 * Asked of the document rather than inferred from the path, so it stays true if
 * the packs are ever drawn under that anchor somewhere else.
 */
const returnWithPack = (productId: string): string => {
  if (typeof window === 'undefined') return '/account#packs';
  const params = new URLSearchParams(window.location.search);
  params.set('buy', productId);
  const hash = document.getElementById('packs') ? '#packs' : '';
  return `${window.location.pathname}?${params.toString()}${hash}`;
};

export function Pricing({ compact = false }: { compact?: boolean } = {}) {
  const { credits, ready } = useAccount();
  const [products, setProducts] = useState<CreditProduct[] | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [failed, setFailed] = useState(false);

  /** The pack being bought, so only its own button shows the wait. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (!hasApi) return;
    void fetchCredits()
      .then((response) => {
        setProducts(response.products);
        setCheckout(response.checkout);
      })
      .catch(() => setFailed(true));
  }, []);

  /**
   * Leaves for Stripe.
   *
   * `window.location.assign` rather than a router push: Checkout is not part of
   * this application and rendering it inside the SPA's history would give the
   * browser's Back button a page it cannot re-enter. A full navigation is what
   * actually happens and is what the visitor's Back button expects.
   */
  const start = useCallback(async (productId: string) => {
    setBusy(productId);
    setError(null);
    try {
      const session = await createCheckout(productId, currentPath());
      window.location.assign(session.url);
    } catch (cause) {
      setBusy(null);
      setError(
        cause instanceof ApiError
          ? cause.code === 'account_required'
            ? 'Sign in first — credits live on an account.'
            : cause.message
          : 'Checkout could not be opened.',
      );
    }
  }, []);

  /**
   * The pack somebody pressed Buy on before signing in, picked back up.
   *
   * Everything has to be true at once — the products are loaded, the till is
   * open, the account read has *landed* and says signed in — which is why this
   * is an effect on all of them rather than something done on the way out of
   * sign-in. `ready` is the one that is easy to miss: `signedIn` is false while
   * the first account read is in flight, and resuming on that would be reading
   * "not signed in" off a request that has not answered.
   *
   * The parameter is removed from the address bar **before** the checkout is
   * created, so it is not in the `success_url` the return comes back to and a
   * reload of this page does not open a second session. `replaceState` rather
   * than a router navigation, for the reason `AccountContext` uses it on the
   * Stripe return: Back should go where the visitor was, not to a url that
   * re-buys.
   */
  useEffect(() => {
    if (!ready || !credits.signedIn || products === null || !checkout || busy) return;
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('buy');
    if (!productId) return;

    params.delete('buy');
    const rest = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);

    if (products.some((product) => product.id === productId && product.purchasable)) {
      void start(productId);
    }
  }, [ready, credits.signedIn, products, checkout, busy, start]);

  if (!hasApi || failed) {
    return (
      <Notice
        tone="warn"
        title="Packs are not available in this build"
        body="This deployment has no connection to the Luvo service, so there is nothing to quote. Every visitor still gets their free previews once it does."
      />
    );
  }

  return (
    <>
      {/* The balance is not repeated here: on `/account` it is the number this
          section sits under and in `<TopUpDialog>` it is the reason the dialog
          opened, and a second copy of a number is a second thing that can
          disagree with the server. */}
      <div className={`grid sm:grid-cols-3 ${compact ? 'gap-3' : 'gap-5'}`}>
        {products === null
          ? Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                key={index}
                className={`w-full rounded-[22px] ${compact ? 'h-[190px]' : 'h-[260px]'}`}
              />
            ))
          : products.map((product) => {
              const featured = product.badge === 'best_value';
              const buyable = checkout && product.purchasable;
              const waiting = busy === product.id;
              return (
                <div
                  key={product.id}
                  className={
                    'relative flex flex-col items-center rounded-[22px] text-center ring-1 ' +
                    'ring-inset transition-colors duration-300 ' +
                    (compact ? 'px-4 pb-5 pt-6 ' : 'p-6 ') +
                    (featured
                      ? 'bg-surface ring-violet/40'
                      : 'bg-surface/55 ring-line hover:bg-surface/80')
                  }
                >
                  {featured ? (
                    <span
                      className={
                        'absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full brand-gradient px-2.5 ' +
                        'py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-on-violet'
                      }
                    >
                      Best value
                    </span>
                  ) : null}

                  {/* The mark on the product, not only on the balance.
                      Somebody deciding whether to spend money is being asked to
                      buy a unit they have so far only seen as a number in the
                      header, and a pack that names it in words alone leaves them
                      to work out that "20 previews" and the count they have been
                      watching are the same thing. It is the same component at
                      the same violet, which is what makes that obvious without a
                      sentence. */}
                  <h3
                    className={
                      'flex items-center gap-2 font-display leading-none text-ink ' +
                      (compact ? 'text-[21px]' : 'text-[26px]')
                    }
                  >
                    <PreviewIcon
                      className={compact ? 'h-[17px] w-[17px] text-violet' : 'h-[21px] w-[21px] text-violet'}
                    />
                    {packName(product.credits)}
                  </h3>

                  <div className={compact ? 'mt-4' : 'mt-5'}>
                    {product.price ? (
                      <>
                        <p
                          className={
                            'tnum font-display leading-none text-ink ' +
                            (compact ? 'text-[32px]' : 'text-[40px]')
                          }
                        >
                          {formatPrice(product.price)}
                        </p>
                        {/* Said on the card, beside the figure, and not only in
                            the line under the shelf. A price of this shape is
                            almost always a monthly one, and somebody who reads a
                            subscription into it has stopped before reaching any
                            footnote — so the two words that rule it out sit
                            where the number is.

                            The compact card drops it, and that is not a
                            reversal: in a dialogue this short the footnote is on
                            the same screen as the figure rather than under a
                            scroll, so the words are still read before the
                            button is pressed. */}
                        {compact ? null : (
                          <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">
                            One-time payment
                          </p>
                        )}
                        <p className={`text-[12.5px] text-muted ${compact ? 'mt-2' : 'mt-1.5'}`}>
                          {formatUnit(product.price, product.credits)} a preview
                        </p>
                      </>
                    ) : (
                      <p className="text-[13px] text-muted">Price not set yet</p>
                    )}
                  </div>

                  {/* The count is in the heading above, so it is not repeated
                      here — one number per card, and no second copy to disagree
                      with the row it came from. */}
                  {compact ? (
                    <div className="flex-1" />
                  ) : (
                    <p className="mt-5 flex-1 text-[13px] leading-relaxed text-muted">
                      Yours to spend whenever, on any cut in the catalogue.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={!buyable || !!busy}
                    onClick={() => {
                      // Signed out is not a refusal: the pack rides along to
                      // sign-in and the return picks it up. See the header.
                      if (!credits.signedIn) {
                        router.push(authHref('sign-in', returnWithPack(product.id)));
                        return;
                      }
                      void start(product.id);
                    }}
                    className={
                      'grid h-11 w-full place-items-center rounded-full text-[13.5px] font-semibold ' +
                      'transition-opacity duration-200 ' +
                      (compact ? 'mt-5 ' : 'mt-6 ') +
                      (featured
                        ? 'bg-violet text-on-violet'
                        : 'bg-white/6 text-ink ring-1 ring-inset ring-line-strong') +
                      (buyable && !busy ? ' hover:opacity-90' : ' cursor-not-allowed opacity-45')
                    }
                  >
                    {waiting ? <Spinner /> : buyable ? 'Buy' : 'Not for sale here'}
                  </button>
                </div>
              );
            })}
      </div>

      {error ? (
        <p role="alert" className="mt-6 text-center text-[12.5px] text-amber">
          {error}
        </p>
      ) : null}

      {/* Said only when it is true, and said as a fact about this deployment
          rather than about the product. A site with checkout open says nothing
          here, because a working button needs no caption. */}
      {products !== null && !checkout ? (
        <p
          className={`text-center text-[12.5px] leading-relaxed text-amber ${compact ? 'mt-5' : 'mt-8'}`}
        >
          Checkout is not open on this deployment, so nothing here can be bought yet. The packs
          are what Luvo sells; the till is not connected.
        </p>
      ) : null}

      {/* The third state, which had no words at all until it was walked into:
          the till is connected and a pack still has no Stripe Price pointed at
          it, so the card reads "price not set yet" over a dead button and says
          nothing about why. `checkout: false` and `purchasable: false` are two
          different misconfigurations one step apart, and an interface that
          explains the first and not the second sends whoever is setting this up
          looking in the wrong place. Named the same way the missing
          `NEXT_PUBLIC_API_URL` is. */}
      {products !== null && checkout && products.some((product) => !product.purchasable) ? (
        <p
          className={`text-center text-[12.5px] leading-relaxed text-amber ${compact ? 'mt-5' : 'mt-8'}`}
        >
          Some packs have no price yet on this deployment — nothing has been pointed at a Stripe
          Price for them, so they cannot be bought. <code>npm run stripe:setup</code> is what fills
          that in.
        </p>
      ) : null}

      {products !== null && checkout && products.every((product) => product.purchasable) ? (
        <p
          className={
            'text-center leading-relaxed text-faint ' +
            (compact ? 'mt-5 text-[11.5px]' : 'mt-8 text-[12px]')
          }
        >
          {compact ? (
            <>Secure by Stripe</>
          ) : (
            <>
              Payment is handled by Stripe on their own page — no card details ever reach Luvo.
              One payment, no subscription, nothing renews, and a generation that fails is
              refunded automatically.
            </>
          )}
        </p>
      ) : null}

    </>
  );
}
