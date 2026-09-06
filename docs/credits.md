# Credits

Two free generations per device, then packs bought through the App Store or Play. No
subscription. This document is the design, the things that were measured, and the four places
where what was asked for and what a phone can actually do are not the same.

```
new device ──► 2 free generations ──► create an account ──► buy a pack ──► generate
                    (no account)         (only to buy)      (store + webhook)
```

## What a generation costs, honestly

About **$0.053** at `openai/gpt-image-2/edit`, `quality: medium`, ~2.09 megapixels. The two free
generations are therefore about **11c per device**, which is the customer-acquisition cost of
this feature and is cheap.

On the revenue side the brief assumed a 15% store commission. That number is **achievable but
not automatic**: Apple's Small Business Program and Play's first-$1M tier both need enrolment,
and the default for both stores is 30%. Budget at 30% and treat 15% as upside:

| Pack | Price | At 30% | At 15% | Model cost | Margin at 30% |
| --- | --- | --- | --- | --- | --- |
| 5 | $4.99 | $3.49 | $4.24 | $0.27 | 64.6% |
| 10 | $9.99 | $6.99 | $8.49 | $0.53 | 64.7% |
| 20 | $14.99 | $10.49 | $12.74 | $1.06 | 62.9% |

Still a strong business at the pessimistic rate, which is the point of writing it down this way.

### The 20-pack is not sold with a struck-through price

The brief describes it as "$19.99, discounted to $14.99, a 25% saving". It is sold at $14.99 and
described as **75c per generation against a dollar**, which is the same saving stated in terms
that are true.

A reference price the product was never actually sold at is a *fictitious* reference price. The
EU Omnibus Directive requires a prior price to have been genuinely charged (30 days, in most
member states) before it can be shown as a "was"; the FTC treats the same thing as deceptive
pricing; and both stores review price claims. The saving is real either way, so there was
nothing to gain by dressing it up — and a struck-through price reads as a trick to anyone who
has seen one before.

If a genuine promotion is wanted later, the compliant route is to list at $19.99, sell at it for
a period, and then run $14.99 through the stores' own promotional-price machinery.

## The free allowance, and what "tied to the device" can actually mean

The requirement is that uninstalling and reinstalling must not hand out two more. That is
**mostly** achievable and the two platforms get there differently.

**iOS already worked, by accident of an earlier good decision.** `src/lib/deviceId.ts` keeps the
device secret in `expo-secure-store`, which is the Keychain, and Keychain items outlive the app
that wrote them. Delete Luvo, reinstall it, and the same 32 bytes come back — so the device is
the same device to the server with nothing added. There is no iOS identifier worth layering on
top: `identifierForVendor` *resets* once every app from the vendor is gone, which is strictly
worse than the Keychain.

**Android did not.** The Keystore is cleared with the package, so a reinstall minted a fresh
secret and was owed two more. The fix is `ANDROID_ID` — stable per app-signing-key and device,
surviving a reinstall, reset only by a factory reset — sent as `X-Install-Anchor` on every
request.

### Anchors, and the direction the arithmetic runs

The allowance hangs off `install_anchors`, not off `devices`. A device may present several, and
two rules make the scheme one-directional:

- **A hold is taken against every anchor**, and only if every one of them has something left.
- **Remaining is the minimum across them**, never the sum, the maximum or the newest.

So a reinstalled Android phone — new `device` anchor with two remaining, old `android_id` anchor
with none — is owed zero. There is no arrangement of anchors that produces a third free
generation, which is the property worth having; taking the maximum would hand out exactly what
this exists to withhold.

The stored id is a **salted hash**, never the raw identifier. What an allowance needs from an
anchor is equality, and a hash has that; a raw `ANDROID_ID` in a database is a device identifier
with no use for it. `ANCHOR_SALT` is a deployment secret and **rotating it resets every
allowance**, because every anchor hashes to an id that has never been seen.

### What defeats it, said plainly

A factory reset, a restore-as-new, or a second phone. All three produce a genuinely new device
and are treated as one. The answer to somebody doing that repeatedly is **App Attest and Play
Integrity**, which is its own piece of work and is the same answer `deviceId.ts` already gives to
"what proves the caller is a real copy of the app". At 11c a cycle the arms race is not yet worth
entering.

What is deliberately *not* done is fingerprinting — no IP address, no screen metrics, no model
string, nothing composed from them. Apple's guidelines forbid it, and being probabilistic it
would deny free generations to people who had never had any. A false positive here tells a
stranger they have already used their two.

## The ledger

### Reserve, then settle

A generation is not charged when it is asked for and not when it finishes. It is **held** at
submit and **settled** when the job reaches a terminal state:

| Transition | Free | Paid |
| --- | --- | --- |
| submit | `held +1` | `balance −1, held +1` |
| → `ready` | `used +1, held −1` | `held −1` |
| → `failed` / `cancelled` | `held −1` | `balance +1, held −1` |

Holding rather than deducting is what makes *"users cannot generate twice on one credit"* true
across a crash: the credit leaves the balance before any money is spent at fal, so a second
submit sees the reduced number immediately.

**Refunding a failed generation** is a product decision and a plain one. A model that fails is
not the user's mistake, and charging for it earns a one-star review that is entirely deserved.

One case is deliberately *not* refunded: a preview that was generated, notified, and never
collected within `PREVIEW_RETENTION_DAYS`. The work was done and made available for a week; the
credit stays spent. That judgement is a single line in `worker.ts` and is commented as the place
to change if it is ever revisited.

### Nothing can go negative, and nothing is checked-then-acted-on

The balance moves by compare-and-set — the same shape `jobs.ts` claims queue rows with:

```sql
update credit_balances set balance = balance - 1, held = held + 1
 where user_id = $1 and balance > 0
```

Two taps on Generate produce one winner and one zero-row result at any isolation level. The
`/v1/previews` route *also* reads the balance before creating a job, and that check is explicitly
not the guard — it exists so somebody with no credits sees a paywall rather than a job that
appears and is cancelled a second later. The comment there says so, because a reader who mistook
it for the enforcement would eventually "simplify" the real one away.

### Settling is one transaction, and that is the one exception in this service

Everywhere else, an invariant here lives inside a single row: the photograph scrub in `jobs.ts`
is one `update` that moves the status and nulls the key together, which is why
`docs/preview-generation.md` can call it a state transition rather than a cleanup job.

A credit cannot be written that way — the balance is in `credit_balances` or `free_allowance` and
the status is in `preview_jobs`. Two alternatives were considered and rejected:

- **A data-modifying CTE** would be one statement, and `pg-mem` does not run one. That would make
  the credit path untestable, which this repo already has a rule about.
- **Settling in a second call** leaves a window where a crash strands a user's credit in `held`
  forever.

So the three terminal transitions open a transaction, and `check-credits.mjs` points
`withTransaction` at its in-memory client so the atomic path is genuinely executed rather than
asserted about from outside.

Idempotency comes from a compare-and-set on `charge_settled`, not from a flag that is read and
then written: `where charge_settled is null` returns zero rows the second time. That makes a
retried transition, a sweeper replay and two racing workers all safe — and all three happen.

`unsettledCharges()` is asserted empty after every branch of the check, exactly as `unscrubbed()`
is for the photograph. **If a new status or a new path out of `running` is added, that assertion
is the thing to keep passing.**

## Accounts

An account exists for one reason: purchased credits have to survive a phone. Free generations do
not need one, favourites and saved looks are still device-local files, and this schema holds an
id, an email and nothing about hair.

### Signing in adopts the device

There is no session table and no second bearer token. Signing in sets `devices.user_id` — the
column `003_previews.sql` created on day one and left unread, with a comment predicting this
exact update — and from then on the device header identifies both the device and the person.

A second token would have been conventional and would have bought nothing: same keystore, same
channel, exactly as strong as the secret already there. What it adds is an expiry, a refresh flow,
and a class of bug where the device is authenticated and the user is not. Signing out is the same
update with a null.

### Three providers, and Apple is not optional

Apple's guideline 4.8 requires an equivalent private sign-in option wherever a third-party one is
offered, and Sign in with Apple satisfies it — so Google-only is not a shipping configuration on
iOS. Email is there because somebody who uses neither should not be locked out of credits they
paid for.

Apple and Google tokens are verified properly — signature against the provider's published keys,
issuer, audience, expiry, via `jose`. A hand-rolled JWT verifier is the archetypal security code
that looks right and is not.

**The account is keyed on `(provider, subject)` and never on email.** Matching on email would
merge a Google account and an Apple private-relay address that happen to forward to the same
inbox, and — far worse — would let anybody who can receive mail at an address take over the
account of whoever signed in with it through a provider.

### Deletion is real, and required

App Store guideline 5.1.1(v) requires in-app account deletion, and requires a deletion rather
than a deactivation. Two things survive it, both `on delete set null` rather than by oversight:
**purchases**, because a refund six weeks later has to reconcile against something, and **ledger
rows**, because that is what a dispute is answered with. Neither identifies anyone once the user
row is gone.

The free allowance is untouched — it belongs to the device. Deleting an account is not a way to
be given two more, and the check asserts it.

## Purchases

The app calls RevenueCat, RevenueCat validates the receipt with Apple or Google, and RevenueCat
posts to `/v1/webhooks/revenuecat`. **Nothing the phone says adds to a balance.** An app that
credits itself when `purchase()` resolves is an app whose credits are free to anyone willing to
run a proxy.

The consequence is a race the UI is written *around* rather than against: the purchase can resolve
a second or two before the webhook lands. `awaitCredit()` polls for the balance to actually rise,
and on the rare timeout the paywall says the credits are on their way — which is true, the store
has the money and the webhook is retried for hours — rather than showing an error for something
that worked.

### Two idempotency guards, because there are two ways to replay

RevenueCat retries any non-2xx, so a replay is a normal Tuesday. `event_id` stops the same
delivery being applied twice; `(store, store_transaction_id)` stops the same *purchase* being
applied twice even under two event ids. The second is the one that matters — RevenueCat re-sends
historical events after some configuration changes.

Every event the handler declines to act on returns **200**. A subscription renewal for an app that
sells consumables is *handled*, not failed, and answering 500 would build a permanent retry queue
out of events that will never be wanted.

### We own the credits, the store owns the price

`credit_products` maps a store product id to a number of generations. There is no price column and
the API never sends one. StoreKit and Play Billing quote the price, localised and in the user's own
currency; a second copy in our database is a number that eventually disagrees with the till, and
stores localise, run regional pricing and change VAT without telling us.

Adding a pack is therefore a row plus a store listing, not a release — the same argument the
catalog makes in `docs/catalog-architecture.md`.

### A refund clamps at zero

A user who buys ten, generates ten and then charges back is left at zero, not at −10. A hidden
debt means the next pack they buy silently buys them nothing, which reads as theft; the ledger
records the full revocation either way, so the shortfall is visible to us and invisible to them.

## What the app is allowed to believe

**The balance shown is the balance the server last reported, and nothing is ever adjusted
locally.** No optimistic decrement when a generation starts, no optimistic increment when a
purchase resolves. Both are tempting and both are wrong for the same reason: the number moves
without this app being involved — a purchase on an iPad, a refund granted by Apple, a generation
that failed and was refunded — so a locally-maintained copy drifts.

What replaces optimism is a refresh after anything that could have moved it, which is one small
request. `AccountContext` does it on mount, on every return to the foreground, and when
`GenerationProvider` sees a job settle.

Two states that are easy to conflate and must not be:

- **`ready: false` is not "no credits".** Until the first response lands the app does not know the
  balance, and drawing a paywall during that half-second would land it on people who have twenty.
  `canGenerate` is therefore true while loading — being wrong in that direction costs one refused
  submit, and being wrong in the other costs the flow.
- **A failed refresh does not reset the balance to zero.** It means we do not know it right now,
  not that it is empty, and blanking it would paywall somebody whose train went into a tunnel. The
  previous answer stands, and the server is the real gate anyway.

## Testing

`server/scripts/check-credits.mjs`, in `npm --prefix server run check`. No database, no store, no
webhook — the real migrations, the real SQL and the real webhook handler against `pg-mem`. It
guards the four silent failures of a ledger:

| Failure | How it is caught |
| --- | --- |
| A credit spent twice | The balance is drained to zero and one more is asked for |
| A credit lost | `unsettledCharges()` asserted empty after every branch |
| A free generation given twice | A simulated reinstall: new device secret, same `ANDROID_ID` |
| A purchase granted twice | Replayed by event id *and* by transaction id — two indexes |

It also covers the partial case the brief names by hand: one free generation used, then a
reinstall, leaves exactly one — not two and not zero.

### One thing the test changed about the code

`= any($1)` with a parameter array is idiomatic Postgres and `pg-mem` answers it **wrongly and
silently** — it matches nothing and raises nothing, so the free-allowance queries returned empty
and every assertion about them would have been testing the failure rather than the feature. The
queries use an expanded `in ($1, $2, …)` list instead, which is exactly equivalent on real
Postgres and runs on both. Same trade `jobs.ts` makes by computing timestamps in JavaScript rather
than writing `now() + interval`.

## Configuration

Everything is in `server/.env.example`. The three worth knowing before a deploy:

- **`CREDITS_ENFORCED`** defaults to **on**. Off is for a local checkout, where two generations is
  not enough to iterate on a prompt. A production deployment with it off is giving previews away.
- **`ANCHOR_SALT`** — set once, keep it. Rotating it resets every free allowance.
- **`REVENUECAT_WEBHOOK_SECRET`** — without it the webhook refuses everything, which is correct.
  It is the only thing in the service that adds a credit.

## Not done yet

- **A per-device daily cap and a global spend ceiling.** `docs/preview-generation.md` names these
  as the minimum before the endpoint is public. Credits are now most of that — an unauthenticated
  device can cost us 11c and no more — but a signed-in account with a stolen device secret can
  still spend its own credits fast, and there is no global brake if something goes wrong.
- **App Attest / Play Integrity.** Still the real answer to both free-generation abuse and to
  "prove the caller is this app".
- **A custom generation count.** The brief raises it as a maybe; it needs either a lot of store
  products or a non-store payment path, and the second one is not permitted for digital content.
