'use client';

/**
 * What this account has paid, under the packs it can pay for.
 *
 * ## Why it is here and the credit ledger is not
 *
 * `<AccountPanel>` records a deletion: a per-credit audit trail used to sit
 * under the shelf and was cut, because "held, spent, released, granted" is a
 * support tool and putting it on the account page made it read like a bank
 * statement. That argument is unchanged and this is not that list. A payment
 * history answers a question somebody actually arrives with — *what have I paid
 * you, and can I have the paperwork* — and it is one row per completed
 * checkout rather than one per movement of a credit, which is the difference
 * between a receipt book and a journal.
 *
 * It sits **below** the packs on purpose. Somebody who navigates here is nearly
 * always out of previews and looking for more; the history is what they came for
 * second, if at all, so it goes under the thing they came for first.
 *
 * ## Nothing here is computed in this browser
 *
 * The total, the credit count and the per-currency split are all the server's,
 * for the same reason the balance is: a number added up on the client is a
 * number that can disagree with the till. That also settles the two-currency
 * case honestly — `spent` is a list, because a euro and a dollar cannot be
 * summed without a rate, and a rate is a second price this codebase refuses to
 * hold. Almost always one entry, and drawn as one figure when it is.
 *
 * ## The document is fetched at the moment it is asked for
 *
 * Not on load. Listing five payments would otherwise be five Stripe calls on
 * every page view, and the url that comes back is one Stripe controls the
 * lifetime of — worth reading when it is about to be followed and not before.
 * The tab is opened **synchronously on the click** and pointed at the url when
 * it arrives, because a tab opened after an `await` is a popup and browsers
 * block it.
 *
 * `kind` is what came back rather than what was asked for: a payment taken
 * before Stripe was issuing invoices has a hosted receipt instead, so the row
 * re-labels itself to say so. A receipt drawn as an invoice is a small untruth
 * told to somebody's accountant.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { fetchInvoice, fetchPurchases, type Purchase, type PurchaseHistory } from '../lib/api';
import { formatPrice, packName } from '../lib/money';
import { useAccount } from '../lib/state/AccountContext';
import { Skeleton, Spinner } from './ui';

/** `12 Mar 2026`. The reader's own locale, for the reason `formatPrice` uses it. */
const formatDate = (at: number): string =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(at));

/**
 * Where the money went in, named as the buyer would name it.
 *
 * `stripe` is drawn as "Card" rather than as "Stripe": the visitor bought from
 * Luvo and paid by card, and the processor's name on a line of their own history
 * is an implementation detail wearing a brand. The store rows say the store,
 * because there the store genuinely is where the purchase lives — and where its
 * receipt lives, which is why those rows have no button.
 */
const STORE_LABELS: Record<string, string> = {
  stripe: 'Card',
  app_store: 'App Store',
  play_store: 'Google Play',
};

export function PurchaseHistory() {
  const { credits, ready, checkout } = useAccount();
  const [history, setHistory] = useState<PurchaseHistory | null>(null);
  const [failed, setFailed] = useState(false);

  /** The row whose document is being fetched, so only its own button waits. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What each row's document turned out to be, once one has been opened. */
  const [kinds, setKinds] = useState<Record<string, 'invoice' | 'receipt'>>({});

  /**
   * Read on sign-in, and again on the way back from a purchase.
   *
   * `bought` is the dependency that is easy to miss: a visitor who has just paid
   * lands back on this page and the payment they made thirty seconds ago is the
   * one row they will look for. It is that one outcome rather than `checkout`
   * itself, which passes through `confirming` on the way and would spend a
   * request on a history that cannot have changed yet.
   *
   * `ready` guards the other end — `signedIn` is false while the first account
   * read is in flight, and fetching on that would be reading "signed out" off a
   * request that has not answered.
   */
  const bought = checkout === 'bought';

  useEffect(() => {
    if (!ready || !credits.signedIn) {
      setHistory(null);
      return;
    }
    let live = true;
    // Cleared on every attempt: a browser that lost its connection once and has
    // since signed in should not be told for ever that its payments are
    // unavailable.
    setFailed(false);
    void fetchPurchases()
      .then((next) => live && setHistory(next))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [ready, credits.signedIn, bought]);

  const openDocument = useCallback(async (purchase: Purchase) => {
    setBusy(purchase.id);
    setError(null);
    // Opened now, empty, and pointed somewhere in a moment. A `window.open`
    // after the await is not attributed to this click and is blocked as a popup.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const document = await fetchInvoice(purchase.id);
      setKinds((previous) => ({ ...previous, [purchase.id]: document.kind }));
      if (tab) tab.location.href = document.url;
      else window.location.assign(document.url);
    } catch {
      tab?.close();
      setError('That document could not be fetched. Stripe holds it — try again in a moment.');
    } finally {
      setBusy(null);
    }
  }, []);

  // Signed out is not an empty history, it is no history to read: purchases hang
  // off an account and this browser is not on one. Drawn as the section with one
  // sentence in it rather than hidden, so somebody who bought a pack on their
  // phone can see where it went.
  const body = !ready ? (
    <div className="space-y-3 p-5 sm:p-6">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-[54px] w-full rounded-xl" />
      ))}
    </div>
  ) : !credits.signedIn ? (
    <Empty>Payments are kept on your account. Sign in and they will be here.</Empty>
  ) : failed ? (
    <Empty>Your payments could not be loaded just now.</Empty>
  ) : history === null ? (
    <div className="space-y-3 p-5 sm:p-6">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-[54px] w-full rounded-xl" />
      ))}
    </div>
  ) : history.purchases.length === 0 ? (
    <Empty>Nothing bought yet — your free previews cost nothing and are not listed here.</Empty>
  ) : (
    <>
      {/* The totals, inside the card and above the rows it totals, so the
          figure and the lines behind it are one object. Two numbers and not
          five: what was spent, and what it bought. */}
      <div className="flex flex-wrap gap-x-12 gap-y-5 border-b border-line px-5 py-5 sm:px-6">
        <Figure label="Total spent">
          {history.spent.length === 0 ? (
            <>&mdash;</>
          ) : (
            history.spent.map((total, index) => (
              <span key={total.currency}>
                {index > 0 ? <span className="px-1.5 text-faint">+</span> : null}
                {formatPrice(total)}
              </span>
            ))
          )}
        </Figure>
        <Figure label="Previews bought">{history.credits}</Figure>
      </div>

      <ul>
        {history.purchases.map((purchase) => {
          const refunded = purchase.status === 'revoked';
          const waiting = busy === purchase.id;
          const label = kinds[purchase.id] === 'receipt' ? 'Receipt' : 'Invoice';
          return (
            <li
              key={purchase.id}
              className="flex items-center gap-3 border-t border-line px-5 py-4 first:border-t-0 sm:gap-5 sm:px-6"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] leading-tight text-ink">
                  {packName(purchase.credits)}
                  {refunded ? (
                    <span className="ml-2 rounded-full bg-amber/12 px-2 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-[0.1em] text-amber">
                      Refunded
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {formatDate(purchase.at)}
                  <span className="px-1.5 text-faint">&middot;</span>
                  {STORE_LABELS[purchase.store] ?? purchase.store}
                </p>
              </div>

              {/* Struck through rather than hidden when it came back. The row is
                  a record of a payment that did happen, and an amount removed
                  from it would leave a history whose lines do not add up to its
                  own total. */}
              <p
                className={
                  'tnum shrink-0 text-[14px] ' +
                  (refunded ? 'text-faint line-through' : 'text-ink')
                }
              >
                {purchase.amount !== null && purchase.currency
                  ? formatPrice({ amount: purchase.amount, currency: purchase.currency })
                  : '—'}
              </p>

              {/* Absent rather than disabled where there is nothing to fetch: an
                  app-store purchase's receipt is in the buyer's own store
                  account, and a dead button beside it would promise otherwise. */}
              {purchase.documented ? (
                <button
                  type="button"
                  onClick={() => void openDocument(purchase)}
                  disabled={waiting}
                  className={
                    'grid h-8 shrink-0 place-items-center rounded-full px-3.5 text-[12px] font-semibold ' +
                    'text-ink-soft ring-1 ring-inset ring-line-strong transition-colors duration-200 ' +
                    (waiting ? 'cursor-wait opacity-60' : 'hover:bg-white/6 hover:text-ink')
                  }
                >
                  {waiting ? <Spinner /> : label}
                </button>
              ) : (
                <span className="w-[64px] shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <section id="payments" className="mt-20 scroll-mt-24 text-left sm:mt-24">
      <h2 className="font-display text-[24px] leading-tight text-ink">Payments</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        Every pack you have bought, and the invoice for each. Nothing is stored on file — Luvo keeps
        no card, so there is nothing here to manage or cancel.
      </p>

      <div className="mt-6 overflow-hidden rounded-[20px] bg-surface/55 ring-1 ring-inset ring-line">
        {body}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-[12.5px] text-amber">
          {error}
        </p>
      ) : null}

      {/* Said only where it can be true. `unpriced` is a purchase this service
          honoured for an amount it was never told — an app-store row from before
          the price was reported — and a total that quietly omitted it would be a
          figure the rows under it disagree with. */}
      {history && history.unpriced > 0 ? (
        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          {history.unpriced === 1 ? 'One payment has' : `${history.unpriced} payments have`} no amount
          recorded here and {history.unpriced === 1 ? 'is' : 'are'} not counted in the total. The store
          that took {history.unpriced === 1 ? 'it' : 'them'} holds the receipt.
        </p>
      ) : null}

      {history && history.purchases.length > 0 ? (
        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          Invoices are issued by Stripe and open on their site. A payment taken before Luvo started
          issuing them opens Stripe&rsquo;s receipt for that charge instead, which the row will say.
        </p>
      ) : null}
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="tnum mt-1.5 font-display text-[26px] leading-none text-ink">{children}</p>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-[13.5px] text-muted sm:px-6">{children}</p>;
}
