-- Stripe, and the one column it adds.
--
-- The rule this migration is written against is the one `005` states at length:
-- **we own the credits, the till owns the price.** `credit_products` has a
-- credit count and no amount, because a second copy of a price in this database
-- is a number that eventually disagrees with the thing that actually charged
-- somebody — and on the web that is worse than on a store, since Stripe quotes
-- in the visitor's currency with their tax and we cannot.
--
-- So what is added here is a **pointer**, not a price. `stripe_price_id` names
-- the Stripe Price object that is the authority; the amount is read from Stripe
-- when the packs are listed and is never stored. A pack whose pointer is null is
-- a pack that cannot be bought yet, and the site says exactly that rather than
-- quoting a figure nothing stands behind.
--
-- It is a column rather than an environment variable for the same reason the
-- credit count is a row: adding the 50-pack somebody asks for should be an
-- insert plus a Stripe Price, not a redeploy. `scripts/stripe-setup.mjs` is what
-- fills it in.
alter table credit_products add column if not exists stripe_price_id text;

-- One Price per pack, so a mis-pasted id cannot silently point two packs at one
-- Price and sell ten previews for the price of five.
create unique index if not exists credit_products_stripe_price_idx
  on credit_products (stripe_price_id)
  where stripe_price_id is not null;

-- Stripe's identity for the money that moved, on the row that records it.
--
-- Nothing is added to `purchases` — `store = 'stripe'` and `store_transaction_id`
-- = the PaymentIntent id were already the right shape, and the two unique
-- indexes 005 created are exactly the two replays Stripe produces: the same
-- event delivered twice (`event_id`), and the same payment arriving under two
-- event ids, which is what a webhook retry plus the post-redirect confirmation
-- below actually looks like.
--
-- That second path is the one worth naming. A browser comes back from Checkout a
-- second or two before the webhook lands, so `POST /v1/checkout/confirm` reads
-- the session from Stripe and grants from it directly rather than making
-- somebody watch a spinner for a delivery. Both paths write the same
-- PaymentIntent id, so whichever arrives second updates nothing. Without that
-- index the confirmation would be a way to buy one pack and be granted two.
