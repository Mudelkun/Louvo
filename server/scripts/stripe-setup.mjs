#!/usr/bin/env node
/**
 * Points each credit pack at a Stripe Price, once.
 *
 *   node scripts/stripe-setup.mjs --list        # what is pointed where — free
 *   node scripts/stripe-setup.mjs --dry-run     # what it would create — free
 *   node scripts/stripe-setup.mjs               # create the missing ones
 *   node scripts/stripe-setup.mjs --amount 50=2999   # a pack this file has no seed for
 *   node scripts/stripe-setup.mjs --map com.hairify.credits.5=price_1AbC
 *
 * ## What this is, and why it is a script rather than a migration
 *
 * `credit_products` has a credit count and no amount, deliberately — the rule is
 * in `005_credits.sql` and `007_stripe.sql`: **we own the credits, the till owns
 * the price.** What the database holds is a *pointer* to the Stripe Price that
 * is the authority, and this is the thing that creates that Price and writes the
 * pointer back.
 *
 * It cannot be a migration because a migration runs against a database and this
 * has to run against a Stripe account: test and live are two different accounts
 * with two different sets of Price ids, and the same database schema is deployed
 * to both. So the pointer is data, set per deployment, exactly as
 * `catalog:publish` sets the render urls.
 *
 * ## The amounts in here are seeds, not a source of truth
 *
 * `DEFAULT_AMOUNTS` exists so that a first run produces something correct
 * without three dashboard visits, and the figures are the ones in
 * `docs/credits.md` — the same product means the same price wherever somebody
 * meets it. The moment a Price exists, **this file stops being consulted**:
 * nothing reads an amount from here at runtime, the API reads the Price object,
 * and changing what a pack costs is a Stripe dashboard job plus `--map`, not an
 * edit here and a deploy.
 *
 * Re-running is safe. A pack that already has a Price id is left alone unless
 * `--force` is passed, and `--force` creates a *new* Price rather than editing
 * the old one — Stripe prices are immutable by design, because the alternative
 * is a receipt that no longer matches what was charged.
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { loadEnv } from './lib/env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const values = (name) =>
  args.reduce((found, arg, index) => (arg === `--${name}` && args[index + 1] ? [...found, args[index + 1]] : found), []);

const listOnly = has('list');
const dryRun = has('dry-run');
const force = has('force');
const currency = (values('currency')[0] ?? 'usd').toLowerCase();

/**
 * The opening prices, in minor units, **keyed by the credit count**.
 *
 * Not a price list — a set of starting values for `stripe prices create`. See
 * the header.
 *
 * Keyed on the count rather than on the product id, and that is a correction
 * rather than a preference. A store product id is a *per-deployment* string:
 * `005_credits.sql` seeds `com.luvoai.luvo.credits.*`, this repository's own
 * database carries `com.hairify.credits.*`, and a live App Store listing will
 * carry whatever was registered in the console. Keying seeds on it meant every
 * pack fell through to "no amount" on any database that had not been seeded by
 * that exact migration — which is most of them. The credit count is the one
 * thing that genuinely identifies a pack: it *is* the product, which is the same
 * reason `packName()` derives a pack's label from it rather than storing one.
 *
 * The 20-pack is deliberately **not** listed anywhere with a struck-through
 * higher price it has never been sold at: it is 75c a generation against a
 * dollar, which is the same saving stated in a way that is true.
 */
const DEFAULT_AMOUNTS = {
  5: 499,
  10: 999,
  20: 1499,
};

/**
 * `--amount <productId|credits>=<cents>`, overriding the seed for one pack.
 *
 * Both spellings, because both are unambiguous here and the id is a mouthful:
 * `--amount 50=2999` prices the fifty-pack, `--amount com.hairify.credits.50=2999`
 * says the same thing. A pack with a count this file has never heard of has no
 * seed at all and must be given one — a script that guessed a price for it would
 * be inventing revenue.
 */
const overrides = Object.fromEntries(
  values('amount').map((entry) => {
    const [id, amount] = entry.split('=');
    return [id, Number.parseInt(amount, 10)];
  }),
);

/** `--map <productId>=<priceId>`, for a Price created by hand in the dashboard. */
const mapped = Object.fromEntries(values('map').map((entry) => entry.split('=')));

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

const KEY = process.env.STRIPE_SECRET_KEY;
const API = (process.env.STRIPE_API_BASE ?? 'https://api.stripe.com').replace(/\/$/, '');
const VERSION = process.env.STRIPE_API_VERSION ?? '2024-06-20';

/**
 * The same form encoding `src/stripe.ts` does, in eight lines rather than
 * imported from it.
 *
 * A script under `scripts/` importing from `src/` would mean building the server
 * before it could be run, which is exactly the friction that makes a setup tool
 * go unused. The bodies here are two levels deep at most, which is what keeps a
 * second copy honest — this is the same judgement `scripts/lib/variants.mjs`
 * makes about mirroring `src/lib/hairTypes.ts`.
 */
function form(body, prefix = '') {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const name = prefix ? `${prefix}[${key}]` : key;
      return typeof value === 'object'
        ? form(value, name)
        : `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
}

async function stripe(pathname, body) {
  const response = await fetch(`${API}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Stripe-Version': VERSION,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? form(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`stripe ${pathname}: ${payload?.error?.message ?? response.status}`);
  }
  return payload;
}

const money = (amount, code) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: code.toUpperCase() }).format(amount / 100);

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — see server/.env.example');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('.railway.internal') ? false : { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  'select id, credits, badge, stripe_price_id, published from credit_products order by sort_order',
);

if (!rows.length) {
  console.error('No credit_products rows. Run `npm run migrate` first.');
  await client.end();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// --list
// ---------------------------------------------------------------------------

if (listOnly) {
  console.log('\n  Credit packs\n');
  for (const row of rows) {
    let quoted = '';
    if (row.stripe_price_id && KEY) {
      try {
        const price = await stripe(`/v1/prices/${row.stripe_price_id}`);
        quoted = `  ${money(price.unit_amount, price.currency)}${price.active ? '' : '  (INACTIVE)'}`;
      } catch (error) {
        quoted = `  ! ${error.message}`;
      }
    }
    console.log(
      `  ${row.published ? ' ' : '·'} ${row.id.padEnd(30)} ${String(row.credits).padStart(3)} credits  ` +
        `${row.stripe_price_id ?? '— no price —'}${quoted}`,
    );
  }
  if (!KEY) console.log('\n  STRIPE_SECRET_KEY is not set, so no amounts were read back.');
  console.log('');
  await client.end();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

if (!KEY && !dryRun) {
  console.error('STRIPE_SECRET_KEY is not set — see server/.env.example');
  await client.end();
  process.exit(1);
}

if (KEY?.startsWith('sk_live_')) {
  console.log('\n  ! This is a LIVE key. Prices created here will be real.\n');
}

let created = 0;
let attached = 0;

for (const row of rows) {
  const explicit = mapped[row.id];
  if (explicit) {
    // A Price made by hand in the dashboard. Verified before it is written, so a
    // typo is an error now rather than a 503 at the moment somebody tries to buy.
    if (!dryRun) {
      const price = await stripe(`/v1/prices/${explicit}`);
      if (!price.active) throw new Error(`${explicit} is not active`);
      await client.query('update credit_products set stripe_price_id = $2 where id = $1', [row.id, explicit]);
      console.log(`  attached  ${row.id} → ${explicit}  ${money(price.unit_amount, price.currency)}`);
    } else {
      console.log(`  would attach  ${row.id} → ${explicit}`);
    }
    attached += 1;
    continue;
  }

  if (row.stripe_price_id && !force) {
    console.log(`  skipped   ${row.id} already points at ${row.stripe_price_id}`);
    continue;
  }

  const amount = overrides[row.id] ?? overrides[row.credits] ?? DEFAULT_AMOUNTS[row.credits];
  if (!Number.isFinite(amount)) {
    console.log(
      `  ! ${row.id} (${row.credits} credits) has no amount — pass --amount ${row.credits}=<cents>, ` +
        'or --map it to a Price you made in the dashboard',
    );
    continue;
  }

  const name = `Louvo — ${row.credits} previews`;
  if (dryRun) {
    console.log(`  would create  ${name.padEnd(28)} ${money(amount, currency)}  → ${row.id}`);
    created += 1;
    continue;
  }

  /**
   * A Product and a Price, in that order.
   *
   * `metadata.luvo_product_id` is what makes the Stripe dashboard readable
   * during a refund: without it a support conversation about "the ten-pack" has
   * to be joined to our database by hand. Nothing reads it back — the pointer
   * goes the other way, from `credit_products` to the Price.
   */
  const product = await stripe('/v1/products', {
    name,
    description: `${row.credits} Louvo hairstyle previews. They do not expire and nothing renews.`,
    metadata: { luvo_product_id: row.id, luvo_credits: String(row.credits) },
  });
  const price = await stripe('/v1/prices', {
    product: product.id,
    unit_amount: amount,
    currency,
    metadata: { luvo_product_id: row.id },
  });
  await client.query('update credit_products set stripe_price_id = $2 where id = $1', [row.id, price.id]);
  console.log(`  created   ${name.padEnd(28)} ${money(amount, currency)}  ${price.id}`);
  created += 1;
}

await client.end();

console.log(
  `\n  ${dryRun ? 'Would create' : 'Created'} ${created}, attached ${attached}.` +
    (dryRun ? '  Nothing was written.' : '  Run --list to check.') +
    '\n',
);
