/**
 * Buying credits, through RevenueCat.
 *
 * ## Why a vendor at all
 *
 * StoreKit and Play Billing are native, different from each other, and the part
 * that actually matters — proving to *our* server that money changed hands —
 * needs an App Store Server API credential and a Play Developer API service
 * account, each with its own signing, its own sandbox and its own set of ways to
 * be subtly wrong. RevenueCat does that half, and posts a webhook we credit
 * from. Free under $2.5k/month.
 *
 * ## Nothing here grants a credit
 *
 * `purchase()` resolving means the *store* took the money. It does not mean the
 * balance has moved: the balance moves when RevenueCat's webhook reaches
 * `server/src/purchases.ts`. So this module returns "the store is happy" and the
 * caller then waits for the server to agree — see `awaitCredit` in
 * `AccountContext`. That gap is usually under a second and occasionally longer,
 * and the paywall waits through it rather than showing a number it hopes is
 * right.
 *
 * The alternative — trusting the client's word that a purchase happened — is how
 * an app gives its credits away to anyone willing to run a proxy.
 *
 * ## The module is loaded lazily, and may not be there at all
 *
 * `react-native-purchases` is native, so it does not exist in the web build and
 * does not exist in Expo Go. Importing it at module scope would take those
 * targets down at startup over a feature they cannot use. Everything here is
 * therefore behind `load()`, and every entry point degrades to "purchasing is
 * unavailable" rather than throwing — which is also exactly what a checkout with
 * no RevenueCat key should do.
 */

import { Platform } from 'react-native';

import type { CreditProduct } from '@/api/account';

/**
 * The public SDK keys. Safe in the bundle by design — they identify the app to
 * RevenueCat and authorise nothing but a purchase the store has to approve
 * anyway. Not to be confused with the *secret* key, which lives on the server
 * and is not in this repo.
 */
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

const apiKey = (): string => (Platform.OS === 'ios' ? IOS_KEY : Platform.OS === 'android' ? ANDROID_KEY : '');

/** Whether this build can take money at all. */
export const purchasesConfigured = (): boolean => !!apiKey();

type PurchasesModule = typeof import('react-native-purchases');

let module: PurchasesModule | null = null;
let configuredFor: string | null = null;

/**
 * Loads and configures the SDK, once per user.
 *
 * `appUserID` is our own account id, which is what makes the webhook's
 * `app_user_id` land on a row the server can credit. Re-configuring on a
 * different id is how signing in as somebody else moves the purchaser across
 * without a restart; re-configuring on the *same* id every time would log the
 * user out of their own receipts.
 */
async function load(purchaserId: string): Promise<PurchasesModule | null> {
  if (!apiKey()) return null;
  try {
    module ??= await import('react-native-purchases');
  } catch {
    // Native module absent: Expo Go, the web build, or a dev client built before
    // this dependency was added. All three are "cannot purchase", not a crash.
    return null;
  }
  if (configuredFor !== purchaserId) {
    await module.default.configure({ apiKey: apiKey(), appUserID: purchaserId });
    configuredFor = purchaserId;
  }
  return module;
}

export interface Offer {
  /** The store product id, and the key back to the server's credit count. */
  productId: string;
  credits: number;
  badge: string | null;
  /** Localised, from the store. Never computed here — see the note below. */
  price: string;
  /** For "$0.75 per generation". Null when the store did not report a number. */
  priceAmount: number | null;
  currency: string | null;
}

/**
 * The packs, with the store's own prices against our own credit counts.
 *
 * The join is the whole point of this function and the split is deliberate:
 * **we own the credits, the store owns the price.** A price in our database
 * would be a second answer, in one currency, that eventually disagrees with what
 * the user is actually charged — and stores localise, run regional pricing and
 * change VAT without telling us. So the number of generations comes from
 * `/v1/credits` and the money comes from StoreKit.
 *
 * A product the store has never heard of is dropped rather than shown at a
 * guessed price: an unbuyable button is worse than a missing one.
 */
export async function fetchOffers(purchaserId: string, products: CreditProduct[]): Promise<Offer[]> {
  const rc = await load(purchaserId);
  if (!rc) return [];

  try {
    const offerings = await rc.default.getOfferings();
    const packages = [
      ...(offerings.current?.availablePackages ?? []),
      // Everything else RevenueCat knows about, so a pack that is in the
      // database but not in the "current" offering still appears. The dedupe
      // below keeps the current one when both are present.
      ...Object.values(offerings.all ?? {}).flatMap((offering) => offering.availablePackages ?? []),
    ];

    const byProduct = new Map<string, (typeof packages)[number]>();
    for (const pkg of packages) if (!byProduct.has(pkg.product.identifier)) byProduct.set(pkg.product.identifier, pkg);

    return products
      .map((product): Offer | null => {
        const pkg = byProduct.get(product.id);
        if (!pkg) return null;
        return {
          productId: product.id,
          credits: product.credits,
          badge: product.badge,
          price: pkg.product.priceString,
          priceAmount: typeof pkg.product.price === 'number' ? pkg.product.price : null,
          currency: pkg.product.currencyCode ?? null,
        };
      })
      .filter((offer): offer is Offer => offer !== null);
  } catch {
    return [];
  }
}

export type PurchaseOutcome =
  | { status: 'paid' }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed'; message: string };

/**
 * Puts the store's own purchase sheet in front of the user.
 *
 * `cancelled` is separated from `failed` because it is not an error and must not
 * be shown as one — somebody closing the sheet has made a decision, and an
 * apologetic red banner about it is the app arguing with them.
 *
 * `paid` means the store is satisfied. It does not mean the credits have landed;
 * see the module header.
 */
export async function purchase(purchaserId: string, productId: string): Promise<PurchaseOutcome> {
  const rc = await load(purchaserId);
  if (!rc) return { status: 'unavailable' };

  try {
    const offerings = await rc.default.getOfferings();
    const pkg = [
      ...(offerings.current?.availablePackages ?? []),
      ...Object.values(offerings.all ?? {}).flatMap((offering) => offering.availablePackages ?? []),
    ].find((candidate) => candidate.product.identifier === productId);
    if (!pkg) return { status: 'failed', message: 'that pack is not available right now' };

    await rc.default.purchasePackage(pkg);
    return { status: 'paid' };
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' };
    return { status: 'failed', message: error instanceof Error ? error.message : 'the purchase did not go through' };
  }
}

/**
 * Restore, which iOS requires to exist as a control of its own.
 *
 * Consumables are not, strictly, restorable — a credit pack is spent, not owned —
 * so what this actually does is re-sync the receipt with RevenueCat, which
 * re-posts any purchase whose webhook never reached us. That is the case it is
 * genuinely for: somebody who paid on a flaky connection and never got their
 * credits. The button has to be there either way (App Store guideline 3.1.1),
 * and having it do something real is better than having it do nothing.
 */
export async function restore(purchaserId: string): Promise<PurchaseOutcome> {
  const rc = await load(purchaserId);
  if (!rc) return { status: 'unavailable' };
  try {
    await rc.default.restorePurchases();
    return { status: 'paid' };
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' };
    return { status: 'failed', message: error instanceof Error ? error.message : 'nothing could be restored' };
  }
}

/**
 * Forgets the purchaser when somebody signs out.
 *
 * Without it the next person to sign in on this phone inherits the previous
 * account's RevenueCat identity, and a purchase they make is credited to
 * somebody else. `configuredFor` is reset rather than the SDK being torn down,
 * because the next `load()` re-configures anyway.
 */
export function forgetPurchaser(): void {
  configuredFor = null;
}

/**
 * RevenueCat reports a user backing out as an error with a flag on it.
 *
 * Read defensively rather than through the SDK's own type, because the shape
 * differs slightly between platforms and getting this wrong turns "no thanks"
 * into an error message.
 */
function isCancellation(error: unknown): boolean {
  const value = error as { userCancelled?: boolean; code?: string | number } | null;
  return value?.userCancelled === true || value?.code === '1' || value?.code === 1;
}
