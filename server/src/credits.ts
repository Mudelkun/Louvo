/**
 * The credit ledger: what a generation costs, and who pays for it.
 *
 * The rule this module exists to enforce is one sentence from the brief — *the
 * client is never trusted to determine how many credits a user has* — and the
 * shape that enforces it is the one `jobs.ts` already uses for the queue:
 * compare-and-set on a single row.
 *
 *     update credit_balances set balance = balance - 1
 *      where user_id = $1 and balance > 0
 *
 * Two requests reaching for the last credit produce one winner and one zero-row
 * result, at any isolation level, without a lock held across a round trip. The
 * balance cannot go negative because the guard is in the statement rather than
 * in a check the application performed a moment earlier.
 *
 * ## Reserve, then settle
 *
 * A generation is not charged when it is asked for and it is not charged when it
 * finishes. It is **held** at submit and **settled** when the job reaches a
 * terminal state:
 *
 *     submit            hold   (balance -1, held +1)
 *     ready/collected   spend  (held -1)                 the credit is gone
 *     failed/cancelled  release(balance +1, held -1)     the credit comes back
 *
 * Holding rather than deducting is what makes "users cannot generate twice on
 * one credit" true across a crash: the credit leaves the balance before any
 * money is spent at fal, so a second submit sees the reduced balance
 * immediately. Refunding rather than keeping is a product decision and a plain
 * one — a model that fails is not the user's mistake, and charging for it is how
 * an app earns a one-star review that is entirely deserved.
 *
 * ## Free first, and recorded as such
 *
 * `reserve()` tries the free allowance before the purchased balance, and writes
 * which one it took onto the job. The brief asks that we always know where a
 * generation came from; that is `preview_jobs.charge_source`, decided at the
 * moment of spending rather than reconstructed afterwards from timestamps.
 *
 * ## Why these functions take a `Queryer`
 *
 * Because settling has to happen in the same transaction as the status change it
 * belongs to. The balance is in one table and the job is in another, so the
 * single-statement trick that makes the photograph scrub atomic is unavailable
 * — see the note on `withTransaction` in `db.ts`. Every function here therefore
 * takes the connection it should run on, and `jobs.ts` hands it the transaction
 * it is already inside.
 */

import { randomBytes } from 'node:crypto';

import { allowanceFor, anchorsForDevice, registerAnchors, type Anchor } from './anchors.js';
import { placeholders, query, withTransaction, type Queryer } from './db.js';
import { env } from './env.js';

/** Which pot a generation came out of. */
export type ChargeSource = 'free' | 'paid';

export interface Charge {
  source: ChargeSource;
  userId: string | null;
  anchorIds: string[];
}

export interface CreditState {
  /** Free generations left on this device's anchors. */
  free: number;
  /** Purchased credits on the signed-in account, or 0 when there is none. */
  credits: number;
  /** What a generation can actually be started with right now. */
  total: number;
  freeGranted: number;
  signedIn: boolean;
}

const id = (prefix: string): string => `${prefix}_${randomBytes(12).toString('base64url')}`;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * What this device may generate with, from the server's point of view.
 *
 * The one number the app is allowed to render, and it is recomputed on every
 * request rather than cached: a balance the client holds is a balance that is
 * wrong the moment a purchase lands on another device.
 */
export async function creditState(deviceId: string, db: Queryer = query): Promise<CreditState> {
  const anchorIds = await anchorsForDevice(deviceId, db);
  const { remaining, granted } = await allowanceFor(anchorIds, db);
  const userId = await userForDevice(deviceId, db);
  const credits = userId ? await balanceFor(userId, db) : 0;
  return {
    free: remaining,
    credits,
    total: remaining + credits,
    freeGranted: granted || env.credits.freeGenerations,
    signedIn: !!userId,
  };
}

export async function userForDevice(deviceId: string, db: Queryer = query): Promise<string | null> {
  const rows = await db<{ user_id: string | null }>('select user_id from devices where id = $1', [deviceId]);
  return rows[0]?.user_id ?? null;
}

export async function balanceFor(userId: string, db: Queryer = query): Promise<number> {
  const rows = await db<{ balance: number }>('select balance from credit_balances where user_id = $1', [userId]);
  return rows[0]?.balance ?? 0;
}

// ---------------------------------------------------------------------------
// Reserving
// ---------------------------------------------------------------------------

/**
 * Takes one generation's worth of credit, or returns null.
 *
 * Free first. The order matters to the user in one direction only — spending a
 * purchased credit while a free one was available is taking money somebody did
 * not have to give yet — and it matters to us in the other, since a free
 * allowance that is never consumed is a permanent liability on every device.
 *
 * The whole thing is one transaction because a partial hold is worse than no
 * hold: a device with two anchors that took a hold on one of them and failed on
 * the other has silently lost a free generation to nothing.
 */
export async function reserve(deviceId: string, anchors: Anchor[]): Promise<Charge | null> {
  return withTransaction(async (tx) => {
    const { ids } = await registerAnchors(deviceId, anchors, tx);
    const userId = await userForDevice(deviceId, tx);

    // The free path: hold against *every* anchor, and only if every one of them
    // has something left. `returning` counts the rows that actually moved, so a
    // device whose oldest anchor is spent gets nothing even though its newest is
    // untouched — which is exactly the reinstall case.
    if (ids.length) {
      const held = await tx<{ anchor_id: string }>(
        `update free_allowance set held = held + 1, updated_at = now()
          where anchor_id in (${placeholders(ids.length)}) and granted - used - held > 0
          returning anchor_id`,
        ids,
      );
      if (held.length === ids.length) {
        await record(tx, {
          userId,
          anchorId: ids[0] ?? null,
          deviceId,
          kind: 'hold',
          source: 'free',
          delta: -1,
          reason: 'generation reserved',
        });
        return { source: 'free', userId, anchorIds: ids };
      }
      // Not enough free allowance: give back whatever this attempt took. Inside
      // the transaction a rollback would do it, but the paid path below still
      // has to run, and it has to run without these holds outstanding.
      if (held.length) {
        await tx(
          `update free_allowance set held = held - 1, updated_at = now()
            where anchor_id in (${placeholders(held.length)})`,
          held.map((row) => row.anchor_id),
        );
      }
    }

    if (!userId) return null;

    const spent = await tx<{ balance: number }>(
      `update credit_balances set balance = balance - 1, held = held + 1, updated_at = now()
        where user_id = $1 and balance > 0
        returning balance`,
      [userId],
    );
    if (!spent.length) return null;

    await record(tx, {
      userId,
      anchorId: ids[0] ?? null,
      deviceId,
      kind: 'hold',
      source: 'paid',
      delta: -1,
      reason: 'generation reserved',
    });
    return { source: 'paid', userId, anchorIds: ids };
  });
}

/** Writes the charge onto the job, so settling knows what to give back. */
export async function attachCharge(jobId: string, charge: Charge, db: Queryer = query): Promise<void> {
  await db(
    `update preview_jobs
        set charge_source = $2, charge_user_id = $3, charge_anchors = $4, charge_settled = null
      where id = $1`,
    [jobId, charge.source, charge.userId, charge.anchorIds],
  );
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

export type Settlement = 'spent' | 'refunded';

/**
 * Turns a hold into a spend or gives it back. Idempotent, by construction.
 *
 * The compare-and-set is on `charge_settled`, not on a flag this function reads
 * and then writes: `where charge_settled is null` returns zero rows the second
 * time, and zero rows means there is nothing to move. That is what makes it safe
 * for a terminal transition to be retried, replayed by a sweeper, or raced by
 * two workers — all three of which happen.
 *
 * Must be called inside the same transaction as the status change. Called on its
 * own it is still correct; it is just no longer atomic with the thing it is
 * settling, which is the property `unsettledCharges()` is asserting.
 */
export async function settle(tx: Queryer, jobId: string, outcome: Settlement): Promise<void> {
  const claimed = await tx<{
    charge_source: ChargeSource;
    charge_user_id: string | null;
    charge_anchors: string[] | null;
  }>(
    `update preview_jobs set charge_settled = $2, updated_at = now()
      where id = $1 and charge_source is not null and charge_settled is null
      returning charge_source, charge_user_id, charge_anchors`,
    [jobId, outcome],
  );

  const charge = claimed[0];
  // Either already settled, or never charged at all — a simulated generation, or
  // one submitted before credits existed. Both are no-ops rather than errors.
  if (!charge) return;

  const anchors = charge.charge_anchors ?? [];

  if (charge.charge_source === 'free' && anchors.length) {
    const list = placeholders(anchors.length);
    await tx(
      outcome === 'spent'
        ? `update free_allowance set used = used + 1, held = held - 1, updated_at = now()
            where anchor_id in (${list}) and held > 0`
        : `update free_allowance set held = held - 1, updated_at = now()
            where anchor_id in (${list}) and held > 0`,
      anchors,
    );
  } else if (charge.charge_source === 'paid' && charge.charge_user_id) {
    await tx(
      outcome === 'spent'
        ? `update credit_balances set held = held - 1, updated_at = now()
            where user_id = $1 and held > 0`
        : `update credit_balances set balance = balance + 1, held = held - 1, updated_at = now()
            where user_id = $1 and held > 0`,
      [charge.charge_user_id],
    );
  }

  await record(tx, {
    userId: charge.charge_user_id,
    anchorId: anchors[0] ?? null,
    deviceId: null,
    kind: outcome === 'spent' ? 'spend' : 'release',
    source: charge.charge_source,
    delta: outcome === 'spent' ? 0 : 1,
    jobId,
    reason: outcome === 'spent' ? 'generation delivered' : 'generation did not complete',
  });
}

/**
 * Terminal jobs whose credit was never settled.
 *
 * The credit half of `unscrubbed()`, and it is asserted empty for the same
 * reason: "every terminal transition settles the charge" is exactly the kind of
 * claim that is true when it is written and false eight months later, when
 * somebody adds a status and a path out of `running` that does not know about
 * any of this. If this list is ever non-empty, a user is holding a credit that
 * neither bought them a preview nor came back to them.
 */
export async function unsettledCharges(db: Queryer = query): Promise<{ id: string; status: string }[]> {
  return db<{ id: string; status: string }>(
    `select id, status from preview_jobs
      where status in ('ready', 'collected', 'failed', 'cancelled')
        and charge_source is not null
        and charge_settled is null`,
  );
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

export interface Grant {
  userId: string;
  credits: number;
  purchaseId?: string;
  reason: string;
  kind?: string;
}

/**
 * Adds credits to an account.
 *
 * The upsert matters: a user's first purchase is also the creation of their
 * balance row, and making sign-up write an empty one would mean a purchase could
 * land against an account whose row a failed sign-up never created.
 */
export async function grant({ userId, credits, purchaseId, reason, kind = 'purchase' }: Grant, db: Queryer = query) {
  await db(
    `insert into credit_balances (user_id, balance) values ($1, $2)
     on conflict (user_id) do update
        set balance = credit_balances.balance + $2, updated_at = now()`,
    [userId, credits],
  );
  await record(db, { userId, anchorId: null, deviceId: null, kind, source: 'paid', delta: credits, purchaseId, reason });
}

/**
 * Takes credits back after a refund, and stops at zero.
 *
 * Clamped rather than allowed to go negative, and that is a deliberate choice
 * about who absorbs the loss. A user who buys ten, generates ten and then
 * charges back has already had the value; leaving them at −10 means the next
 * pack they buy silently buys them nothing, which reads as theft rather than as
 * a balanced ledger. The ledger row records the full revocation either way, so
 * the shortfall is visible to us and invisible to them.
 */
export async function revoke(userId: string, credits: number, reason: string, db: Queryer = query): Promise<void> {
  await db(
    `update credit_balances
        set balance = case when balance > $2 then balance - $2 else 0 end, updated_at = now()
      where user_id = $1`,
    [userId, credits],
  );
  await record(db, {
    userId,
    anchorId: null,
    deviceId: null,
    kind: 'revoke',
    source: 'paid',
    delta: -credits,
    reason,
  });
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

interface LedgerRow {
  userId: string | null;
  anchorId: string | null;
  deviceId: string | null;
  kind: string;
  source: ChargeSource;
  delta: number;
  jobId?: string;
  purchaseId?: string;
  reason: string;
}

async function record(db: Queryer, row: LedgerRow): Promise<void> {
  await db(
    `insert into credit_ledger (user_id, anchor_id, device_id, kind, source, delta, job_id, purchase_id, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.userId,
      row.anchorId,
      row.deviceId,
      row.kind,
      row.source,
      row.delta,
      row.jobId ?? null,
      row.purchaseId ?? null,
      row.reason,
    ],
  );
}

/** The user's own history, for the account screen. */
export async function history(userId: string, limit: number, db: Queryer = query) {
  return db<{ kind: string; source: string; delta: number; reason: string; created_at: Date }>(
    `select kind, source, delta, reason, created_at from credit_ledger
      where user_id = $1 and delta <> 0
      order by created_at desc limit $2`,
    [userId, limit],
  );
}

export const newPurchaseId = (): string => id('pur');
export const newUserId = (): string => id('usr');
