/**
 * Buying generations.
 *
 * Reached two ways, and the difference is only in the opening line: from
 * Settings, where somebody is topping up on purpose, and from the try-on flow,
 * where they have just run out and were on their way to a haircut. `?reason=out`
 * is that second case.
 *
 * ## Three things this screen refuses to do
 *
 * **It does not show a struck-through price it never charged.** The 20-pack is
 * better value and says so in the terms that are actually true — 75c a
 * generation against a dollar — rather than as a discount off a price nobody has
 * ever paid. A fictitious reference price is non-compliant under the EU Omnibus
 * Directive and deceptive under FTC guidance, and it reads as a trick to anybody
 * who has seen one before. The saving is real either way, so there is nothing to
 * gain by dressing it up.
 *
 * **It does not compute prices.** Every amount on this screen is the string
 * StoreKit or Play Billing handed over, localised and in the user's own
 * currency. The per-generation figure is derived from that same number, so a
 * user in Japan sees yen throughout rather than dollars with a yen label.
 *
 * **It does not claim the credits have arrived until they have.** The purchase
 * resolving means the store took the money; the balance moves when RevenueCat's
 * webhook reaches our server, a moment later. So the button stays busy through
 * `awaitCredit`, and on the rare timeout it says the credits are on their way
 * rather than showing a number that is not yet true.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { LegalLinks } from '@/components/LegalLinks';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { useAccount } from '@/state/AccountContext';
import { fetchOffers, purchase, purchasesConfigured, restore, type Offer } from '@/api/purchases';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

export default function CreditsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { account, credits, products, purchaserId, refresh, awaitCredit } = useAccount();

  const [offers, setOffers] = React.useState<Offer[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const signedIn = !!account && !!purchaserId;

  /**
   * The store's prices, fetched once there is a purchaser to fetch them for.
   *
   * Deliberately not fetched while signed out: RevenueCat is configured with the
   * account id, and configuring it with a placeholder would mean re-configuring
   * on sign-in anyway, with a window in which a purchase could be attributed to
   * the placeholder.
   */
  React.useEffect(() => {
    let cancelled = false;
    if (!signedIn || !products.length) {
      setOffers(signedIn ? [] : null);
      return;
    }
    void fetchOffers(purchaserId!, products).then((next) => {
      if (!cancelled) setOffers(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, purchaserId, products]);

  const buy = async (offer: Offer) => {
    if (!purchaserId) return;
    setNote(null);
    setBusy(offer.productId);
    // Captured before the sheet opens: `awaitCredit` waits for the balance to be
    // higher than this, rather than for a specific total that another webhook
    // landing in the same second would invalidate.
    const before = credits.credits;
    try {
      const outcome = await purchase(purchaserId, offer.productId);
      if (outcome.status === 'cancelled') return;
      if (outcome.status === 'unavailable') {
        setNote('Purchases are not available in this build.');
        return;
      }
      if (outcome.status === 'failed') {
        setNote(outcome.message);
        return;
      }
      const landed = await awaitCredit(before);
      if (landed) {
        setNote(`${offer.credits} generations added.`);
      } else {
        // Not an error. The store has the money and the webhook is retried for
        // hours; saying "failed" here would be the app reporting a problem it
        // does not have.
        setNote('Payment received. Your generations will appear here shortly.');
      }
    } finally {
      setBusy(null);
    }
  };

  const restorePurchases = async () => {
    if (!purchaserId) return;
    setNote(null);
    setBusy('restore');
    try {
      const outcome = await restore(purchaserId);
      setNote(
        outcome.status === 'paid'
          ? 'Checked with the store. Anything missing has been re-sent.'
          : outcome.status === 'unavailable'
            ? 'Purchases are not available in this build.'
            : outcome.status === 'failed'
              ? outcome.message
              : null,
      );
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen padded={false}>
      <Header title="Generations" />
      <View style={styles.body}>
        <View style={styles.balanceCard}>
          <Text style={[type.caption, { color: colors.onDarkMuted }]}>
            {reason === 'out' ? 'You have used your free generations' : 'Your balance'}
          </Text>
          <Text style={[type.display, { color: colors.onDark }]}>{credits.total}</Text>
          <Text style={[type.caption, { color: colors.onDarkMuted }]}>
            {balanceLine(credits.free, credits.credits)}
          </Text>
        </View>

        {!signedIn ? (
          <View style={styles.gate}>
            <Ionicons name="person-circle-outline" size={30} color={colors.accentInk} />
            <Text style={[type.body, { color: colors.ink, fontWeight: '600' }]}>
              Create an account to buy generations
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              Your generations are kept on your account, so they follow you to a new phone. Your photos and saved
              looks stay on this device either way.
            </Text>
            <Button label="Sign in or create an account" icon="log-in-outline" onPress={() => router.push('/sign-in')} />
          </View>
        ) : (
          <View>
            <SectionLabel>Packs</SectionLabel>
            {offers === null || (offers.length === 0 && products.length > 0 && purchasesConfigured()) ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[type.caption, { color: colors.muted }]}>Asking the store for prices…</Text>
              </View>
            ) : offers.length === 0 ? (
              /* Honest rather than empty. This is what a dev build with no
                 RevenueCat key looks like, and it is also what a misconfigured
                 store listing looks like — worth telling apart from a bug. */
              <View style={styles.loading}>
                <Text style={[type.caption, { color: colors.muted }]}>
                  {purchasesConfigured()
                    ? 'The store has no packs configured for this build yet.'
                    : 'This build has no store keys, so generations cannot be bought here.'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.md }}>
                {offers.map((offer) => (
                  <PackRow
                    key={offer.productId}
                    offer={offer}
                    busy={busy === offer.productId}
                    disabled={!!busy}
                    onPress={() => void buy(offer)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {note ? (
          <View style={styles.note}>
            <Text style={[type.caption, { color: colors.ink }]}>{note}</Text>
          </View>
        ) : null}

        {signedIn ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void restorePurchases()}
            disabled={!!busy}
            style={styles.restore}
          >
            <Text style={[type.caption, { color: colors.accentInk, fontWeight: '600' }]}>
              {busy === 'restore' ? 'Checking with the store…' : 'Restore purchases'}
            </Text>
          </Pressable>
        ) : null}

        <Text style={[type.caption, { color: colors.muted }]}>
          One generation is one credit. Generations do not expire, and there is no subscription. If a generation
          fails, its credit is returned to you automatically.
        </Text>

        {/* Required on any screen that takes money: App Store review guideline
            3.1.2 asks for the terms of use and the privacy policy to be
            reachable from the purchase screen itself, and Google Play asks the
            same of a store listing. It is also where the sentence above is
            spelled out — what a credit is, and that it is not money. */}
        <LegalLinks action="buying generations" />
      </View>
    </Screen>
  );
}

/**
 * One pack.
 *
 * The per-generation figure is the whole comparison and is computed from the
 * store's own amount, so it is in the same currency as the price above it. When
 * the store reports no numeric amount — which happens in some sandbox
 * configurations — the line is simply absent rather than guessed.
 */
function PackRow({
  offer,
  busy,
  disabled,
  onPress,
}: {
  offer: Offer;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const best = offer.badge === 'best_value';
  const each = offer.priceAmount !== null ? offer.priceAmount / offer.credits : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${offer.credits} generations for ${offer.price}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pack,
        best && { borderColor: colors.accent, borderWidth: 2 },
        pressed && !disabled && { backgroundColor: colors.surfaceAlt },
        disabled && !busy && { opacity: 0.5 },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={[type.heading, { color: colors.ink }]}>{offer.credits} generations</Text>
          {best ? (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>BEST VALUE</Text>
            </View>
          ) : null}
        </View>
        {each !== null ? (
          <Text style={[type.caption, { color: colors.muted }]}>
            {formatMoney(each, offer.currency)} per generation
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={[type.heading, { color: colors.ink }]}>{offer.price}</Text>
      )}
    </Pressable>
  );
}

/**
 * The two pots, said separately.
 *
 * The brief asks that free and purchased generations be tracked apart, and this
 * is the user-facing half of that: somebody with one free trial left and a pack
 * they bought should be able to see both, not a single total that hides which is
 * being spent first.
 */
function balanceLine(free: number, paid: number): string {
  if (free && paid) return `${free} free · ${paid} purchased`;
  if (free) return free === 1 ? '1 free generation left' : `${free} free generations left`;
  if (paid) return paid === 1 ? '1 purchased generation' : `${paid} purchased generations`;
  return 'No generations left';
}

/**
 * A per-unit figure in the store's own currency.
 *
 * `Intl.NumberFormat` is present in Hermes with the `intl` variant that Expo
 * ships, and falls back to two decimals and the currency code if it is not —
 * which is wrong-looking rather than broken, and only on a build that would have
 * other problems.
 */
function formatMoney(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingTop: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.xl },
  balanceCard: {
    backgroundColor: colors.stage,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: 2,
    alignItems: 'center',
  },
  gate: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm },
  loading: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  note: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  restore: { alignSelf: 'center', paddingVertical: spacing.sm },
}));
