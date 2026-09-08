# Testing credits

Two sandboxes, and they test different halves. Use the first for everything except the money;
use the second only for the money, because it is the slower one to set up and the one that needs
other people's approval.

| | Local sandbox | Store sandbox |
| --- | --- | --- |
| Tests | free allowance, the ledger, refunds, accounts, the webhook, the whole app flow | StoreKit / Play Billing, RevenueCat, real receipts |
| Needs | nothing | App Store Connect, Play Console, RevenueCat, an EAS build |
| Setup | `npm run sandbox` | days — Apple Developer enrolment gates all of it |
| Risk | none | none, but it spends your time |

Start with the local one. Almost every bug in a credit system is in the ledger and the wiring,
not in the store.

---

# 1. The local sandbox

A whole backend on your laptop with nothing behind it: the real Fastify routes, the real
migrations, the real credit ledger and the real job queue, against an **in-memory Postgres**, an
**in-process bucket** and a **worker that never calls a model**.

```bash
npm run sandbox
```

Nothing it does can reach Railway, R2 or fal. That matters here specifically: `DATABASE_URL` in
this checkout points at the **production** database through Railway's public proxy, and testing
credits means granting them, refunding them, resetting free allowances and deleting accounts. An
in-memory database also starts empty every run, which is what makes *"does a reinstall get two
more free generations"* a question you can ask twice.

## Driving it without a phone

```bash
npm run sandbox:drive scenario
```

Walks the entire credit story over real HTTP and asserts at every step:

```
 1. A new Android phone asks what it may generate with.
    ✓ two free generations, no account required
 2. It generates once. The credit is held at submit, not on completion.
 3. The next generation is forced to fail. Nobody pays for that.
    ✓ failed → refunded, back to 1 free
 4. It spends the last one properly, then asks for a third.
    ✓ 402 insufficient_credits — the paywall, not an error
 5. The app is deleted and reinstalled. New keystore secret, same ANDROID_ID.
    ✓ still zero — the install anchor saw through it
 …
14. The account is deleted, which App Store 5.1.1(v) requires to be real.
```

### Why this exists when `check-credits.mjs` already passes

They test different layers and both are worth having. `check-credits.mjs` calls the credit
modules **directly** — it is the unit test for the ledger and it is what runs in
`npm run catalog:check`. The scenario goes through the **HTTP routes**: the device header, the
install-anchor header, the 402 body, sign-in, the PUT to a presigned url, the job poll. That is
where a wiring mistake lives — a route that never registered, a header the app sends and the
server ignores, a status code the client branches on.

## Driving it with the app

```bash
# .env.local — then restart the dev server, EXPO_PUBLIC_* is inlined at bundle time
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8099
```

The banner prints the right address; it defaults to your LAN IP rather than `127.0.0.1`, because
a phone cannot reach your loopback.

Two things will look wrong and are not. **The mannequins are line drawings** — the sandbox serves
the catalog with no render manifest, so `<Mannequin>` falls through to the procedural silhouette.
And **the preview is your own photo, unchanged**, because no model ran. Both are the sandbox being
honest about what it did not do.

Sign in with **email**. Apple and Google verify their tokens against the providers' live signing
keys, so neither can work here — which is a decent argument for having built the third option.
The sandbox returns the six-digit code in the API response instead of mailing it, and the sign-in
screen prints it for you.

## The control room

The part that makes testing with the app bearable. `curl` these while the app is open:

```bash
BASE=http://127.0.0.1:8099

# Make the next generation fail — the one thing you cannot ask a real model to do
curl -X POST $BASE/__sandbox/next -H 'content-type: application/json' \
     -d '{"outcome":"failed"}'        # or "ready", or "hang" (so you can cancel it)

# Grant a pack, through the real webhook handler
curl -X POST $BASE/__sandbox/purchase -H 'content-type: application/json' \
     -d '{"device":"<device secret>","productId":"com.luvoai.luvo.credits.10"}'

# Refund it
curl -X POST $BASE/__sandbox/refund -H 'content-type: application/json' \
     -d '{"device":"<secret>","transactionId":"<from /__sandbox/purchases>"}'

# Refund a Stripe purchase — the web's half, through the same signed webhook
curl -X POST $BASE/__sandbox/stripe/refund -H 'content-type: application/json' \
     -d '{"paymentIntent":"pi_sbx_..."}'   # from the sandbox log when you paid

# Hand back the free two, so you can run the paywall walkthrough again
curl -X POST $BASE/__sandbox/reset-free -H 'content-type: application/json' \
     -d '{"device":"<secret>"}'

# Everything about a device: credits, anchors, jobs, ledger
curl "$BASE/__sandbox/state?device=<secret>"

# A fresh device with a printed secret, for curl-ing by hand
npm run sandbox:drive fresh
```

`device` is always the **secret**, never the id — the server hashes it. The two are
indistinguishable by eye (32 random bytes as hex, and a sha256 of them as hex, are both 64 hex
characters), which is a bug this file's own control endpoints shipped with for about ten minutes.

### Buying a pack from the website, with no Stripe account

The sandbox serves a **miniature Stripe** from its own process — that is what
`STRIPE_API_BASE` exists for, and it is the only test hook in the service. Point
the site at the sandbox (`NEXT_PUBLIC_API_URL`), sign in on `/account`, press
Buy, and a stand-in checkout page opens; pressing Pay marks the session paid,
delivers a **correctly signed** `checkout.session.completed` to the deployment's
own webhook, and redirects back to the page the purchase started from.

What that exercises is nearly all of it: the request the server builds, the form
encoding, the session read back on confirmation, the HMAC check, both
idempotency indexes, the ledger row and the redirect. What it does not exercise
is the card, the money, and Stripe's own idea of what a Price costs.

`--web <url>` sets where the checkout returns to, if the site is not on
`http://localhost:3000`.

### Getting the app's device secret

It is in the keystore and deliberately never displayed. The quickest way is the sandbox's own
log at `--verbose`, or `GET /__sandbox/state` after `npm run sandbox:drive fresh` and using that
secret from curl. For app-driven testing you usually do not need it: use `/__sandbox/next` and
`/__sandbox/wipe`, which take no device.

## Options

```bash
npm run sandbox -- --port 8099      # default
npm run sandbox -- --delay 500      # how long the fake worker pretends to be busy (default 4000)
npm run sandbox -- --free 1         # a shorter walk to the paywall
npm run sandbox -- --unmetered      # credits off, to check the app behaves as it did before
npm run sandbox -- --host 10.0.0.5  # if LAN-IP detection picks the wrong interface
npm run sandbox -- --verbose        # request logging
```

## What it does and does not cover

**Real:** every route, the migrations, the credit ledger and its transactions, install anchors and
the reinstall case, the queue's compare-and-set claim, email sign-in, account deletion, the
RevenueCat webhook including both idempotency indexes, and SigV4 presigning — the app really does
PUT its photograph to a signed url and the server really does `HEAD` it before queueing.

**Not real:** the model, so no image is generated and no five cents is spent; Apple and Google
sign-in; push notifications; and R2. The store half is section 2.

---

# 2. The store sandbox — iOS

For the one thing the local sandbox cannot fake: whether Apple will actually take money.

## First, the thing people go looking for and will not find

**There are no RevenueCat sandbox keys.** You get one *public SDK key per platform* —
`appl_…` for Apple, `goog_…` for Google — and it is the same key in sandbox and in production.

What makes a purchase a sandbox purchase is the **store account doing the buying**: a Sandbox
Apple Account on the device, or a Play licence tester. RevenueCat then tags the webhook
`environment: SANDBOX`, which is why the server has `REVENUECAT_IGNORE_SANDBOX` — off while you
test, **on in production**, or a TestFlight build could mint credits for free.

So there is nothing to "get" from RevenueCat that is sandbox-specific. The work is all in App
Store Connect, and it starts with an enrolment that takes days.

## The critical path

Everything below is blocked by step 0, so start it today and do the parallel work while waiting.

```
enrol ──► Paid Apps agreement ──► App ID ──► app record ──► consumables ──► IAP key
 1-2d     (tax + banking, hours     (both capabilities)     (Ready to Submit)
           to days, and silent)
                                        └──► RevenueCat ──► dev build ──► buy
                                              (~20 min)
```

### 0. Enrol in the Apple Developer Program — do this first

<https://developer.apple.com/programs/enroll/> · **$99/year**

- **Individual** is the fast path: an Apple ID with two-factor on, a payment card, and usually
  24–48 hours. Your legal name becomes the seller name on the store listing.
- **Organization** needs a **D-U-N-S number** and can take one to two weeks. Only worth it if
  Luvo must be sold by a company rather than by you.

Nothing else on iOS can be created until this clears. It is the whole schedule.

### While you wait — three things that need no Apple account

1. **Create the RevenueCat account** at <https://app.revenuecat.com>. Free. Make a project called
   Luvo. You cannot add the iOS app until you have a bundle id registered, but the account and
   project can exist.
2. **Get the API publicly reachable.** RevenueCat's webhook is a server-to-server POST and it
   *cannot reach your laptop*. Either deploy this API to Railway (you already have a deployment),
   or run a tunnel to the local sandbox — `cloudflared tunnel --url http://localhost:8099` gives
   you a public https URL in about ten seconds. Without one, purchases will succeed at the store
   and never become credits, which looks exactly like a bug in the ledger and is not.
3. **Keep testing everything else** against `npm run sandbox`. The ledger, the paywall, the
   refunds and the reinstall guard are all already testable and none of them need Apple.

### 0.5 Sign the Paid Applications Agreement — before anything else

App Store Connect → **Business** (formerly *Agreements, Tax, and Banking*).

This is the second long pole and it is the one that fails quietly. Three things, and all three
must show **Active**:

1. **Paid Applications agreement** — accept it.
2. **Tax forms** — a W-9 if you are in the US, a W-8BEN otherwise. There is a short interview.
3. **Bank details** — a real account Apple can pay into.

**Until this is Active, in-app purchase products do not load.** Not "cannot be sold" — they do not
appear at all, in sandbox or anywhere. StoreKit returns an empty product list, RevenueCat returns
an offering with no packages, and `fetchOffers` correctly drops what the store does not know, so
Luvo shows a paywall with no packs on it. There is no error message anywhere in that chain
saying "your agreement is not signed", which is what makes this worth an entire section.

The free apps agreement is accepted for you at enrolment; this is a *different* one and nothing
prompts you for it. Do it the hour your membership activates — the tax and banking steps can take
their own day or two, and they can run while you do everything below.

### 1. Register the App ID

Developer portal → **Certificates, Identifiers & Profiles** → Identifiers → **+** → App IDs →
App → Bundle ID `com.luvoai.luvo` (explicit, not wildcard).

Enable two capabilities, and **both matter to this app**:

- **In-App Purchase** — on by default; confirm it.
- **Sign in with Apple** — *not* on by default. `app.json` already sets
  `ios.usesAppleSignIn: true`, which adds the entitlement to the build, but a build carrying an
  entitlement the App ID does not grant fails to install with a provisioning error that does not
  mention Sign in with Apple at all.

### 2. Create the app record

App Store Connect → **Apps** → **+** → New App. Platform iOS, bundle id `com.luvoai.luvo`, SKU
anything (`luvo-001`). No screenshots or review needed yet — the record only has to exist so
products can hang off it.

### 3. Create the three consumables

Your app → **Monetization** → **In-App Purchases** → **+** → **Consumable**.

| Product ID | Reference name | Price |
| --- | --- | --- |
| `com.luvoai.luvo.credits.5` | Luvo 5 generations | $4.99 |
| `com.luvoai.luvo.credits.10` | Luvo 10 generations | $9.99 |
| `com.luvoai.luvo.credits.20` | Luvo 20 generations | $14.99 |

The product ids must match `credit_products` in `005_credits.sql` **exactly** — that table is
what turns a product id into a number of credits, and a mismatch means the webhook arrives, finds
no product, and grants nothing.

**Consumable, not Non-Consumable.** A credit is spent; a non-consumable is owned forever and
cannot be bought twice. Choosing wrong is not fixable — the type is permanent once the product is
created, and you would have to make new ids.

Each product needs a **Display Name**, a **Description**, a **price**, and a **review
screenshot** (any image; it is for the reviewer). Fill all four until the status reads **Ready to
Submit** — a product below that state is invisible to sandbox, and RevenueCat simply returns
nothing for it. `fetchOffers` drops a product the store does not know, so the symptom is a pack
missing from the paywall, which looks identical to a typo in the id.

### 4. Generate the In-App Purchase key

App Store Connect → **Users and Access** → **Integrations** → **In-App Purchase** → **+**.

Download the **`.p8` once** — Apple will not show it again. Note the **Key ID** beside it and the
**Issuer ID** at the top of the page. All three go into RevenueCat.

Also grab the **App-Specific Shared Secret**: your app → App Information → *App-Specific Shared
Secret* → Generate. RevenueCat asks for it for older receipt validation.

Keep the `.p8` out of this repo. `.gitignore` already refuses `*.p8`, which is the belt to that
braces.

### 5. Create a Sandbox Apple Account

Users and Access → **Sandbox** → **Test Accounts** → **+**.

Use an email that is **not already an Apple ID** — a `+sandbox` alias on your own address works.
Remember the password; you will type it into a purchase sheet.

On the iPhone: **Settings → Developer → Sandbox Apple Account** (iOS 16+) and sign in there. Do
**not** sign into the main App Store with it — that converts nothing and confuses everything.

### 6. Wire up RevenueCat

In your project:

1. **Apps → + → App Store.** Bundle id `com.luvoai.luvo`, upload the `.p8`, paste the Key ID,
   the Issuer ID and the shared secret.
2. **Products → +.** Add all three ids. RevenueCat can import them once the key is connected.
3. **Offerings → +.** Call it `default` and make it *current*. Add three packages, one per
   product. This is the step that is easy to skip and it is what `getOfferings()` reads — no
   offering means an empty paywall even with every product correct.
   *(Entitlements are not needed. They model ongoing access; a credit pack is a one-off.)*
4. **Integrations → Webhooks → +.**
   - URL: `https://<your-public-api>/v1/webhooks/revenuecat`
   - Authorization header: the same string as `REVENUECAT_WEBHOOK_SECRET` on the server.

   If they do not match, the endpoint answers 401 to everything — correct behaviour, and
   indistinguishable from a purchase that silently granted nothing. RevenueCat's **delivery log**
   shows the response code it got, and it is the first place to look.
5. **Project Settings → API Keys.** Copy the **public app-specific key** for Apple. It starts
   `appl_`. This is the one that goes in the app.

   The **secret** key stays in RevenueCat. It never enters this repo.

### 7. Put the values where they belong

```bash
# .env.local — public by design; identifies the app, authorises nothing
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxxxxxxxxxxxxx
```

```bash
# server/.env — and the identical string in RevenueCat's webhook Authorization field
REVENUECAT_WEBHOOK_SECRET=<a long random string you invent>
# Leave OFF while testing. Turn it ON for production.
# REVENUECAT_IGNORE_SANDBOX=true
```

`EXPO_PUBLIC_*` is inlined at bundle time, so restart the dev server after changing it.

### 8. Build and install a dev build

Purchases are a native module. Expo Go has never had one, so this is where Expo Go stops.

```bash
npx eas-cli device:create     # register the iPhone — follow the link on the phone
npm run build:dev             # ~20 minutes on EAS
```

Install from the link EAS prints, then `npm start` attaches to it exactly as it attached to
Expo Go.

## What to actually check

The local scenario already proved the ledger. What is genuinely new here is short:

- **Three packs with localised prices.** An empty paywall has four causes and they are worth
  telling apart in this order: the **Paid Applications agreement is not Active** (by far the most
  common, and the only one with no error anywhere), no **current Offering**, a **product id
  mismatch** against `credit_products`, or products **not yet Ready to Submit**. A spinner forever
  is a different fault: that is the SDK key.
- **A purchase completes and the balance rises within a second or two.** If it never rises the
  webhook is not arriving — RevenueCat's delivery log first, then whether your API is actually
  public.
- **`app_user_id` on the webhook is our `usr_…` id**, not `$RCAnonymousID…`. Anonymous means the
  app bought before signing in, which the UI is built to prevent.
- **Restore purchases** does not error.
- **Buy the same pack twice → two grants.** This is where a Non-Consumable would have been caught.

## Testing a refund

No self-serve button. Ask at <https://reportaproblem.apple.com> with the sandbox account, or use
the App Store Server API's refund test endpoint. RevenueCat sends a `CANCELLATION`, the credits
come back out, clamped at zero.

If you only want to know that *our* half works, `/__sandbox/refund` runs the identical handler and
takes a second.

## Android, later

Much faster once you get to it — licence testers are instant and in-app products need no review.
One trap worth knowing in advance: **Play will not let you create in-app products until a build
has been uploaded to a track at least once**, and the Play service account credential can take up
to 36 hours to propagate into RevenueCat. Product ids and prices are identical to the table above.

---

## Which to reach for

| Question | Where |
| --- | --- |
| Does a failed generation refund the credit? | local — `/__sandbox/next` |
| Does a reinstall get two more free? | local — the scenario, step 5 |
| Does the paywall appear at the right moment? | local, with the app pointed at it |
| Is the balance ever wrong after a crash? | local — `check-credits.mjs` asserts it |
| Will Apple actually charge for this? | store |
| Are the prices right in Japan? | store |
| Does a refund reach us? | store, once — then local for every retest |
