/**
 * The Postgres pool.
 *
 * One pool for the process, small on purpose: this API is read-only and every
 * endpoint it serves is answered from a cached payload most of the time, so
 * connections sit idle rather than working. Railway's smaller Postgres plans cap
 * connections in the low tens and a generous pool here is how a single service
 * exhausts them.
 */

import pg from 'pg';

import { env } from './env.js';

/**
 * Railway's internal `postgres.railway.internal` host speaks plain TCP; the
 * public proxy speaks TLS with a certificate this process has no root for. So
 * `auto` means "TLS if the URL looks external, and do not verify" — which is
 * what every Railway guide ends up doing, stated out loud rather than hidden in
 * a connection string parameter.
 */
function ssl(): pg.PoolConfig['ssl'] {
  if (env.databaseSsl === 'off') return false;
  if (env.databaseSsl === 'on') return { rejectUnauthorized: false };
  return env.databaseUrl.includes('.railway.internal') ? false : { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: ssl(),
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query<T extends pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

/**
 * The same signature as `query`, bound to one connection.
 *
 * Passed into `withTransaction` so that a function which needs a transaction and
 * one which does not can be written the same way — every module here takes a
 * `Queryer` rather than reaching for the pool itself.
 */
export type Queryer = <T extends pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<T[]>;

export const queryer: Queryer = query;

/**
 * `$1, $2, $3` for an `in (...)` list.
 *
 * The obvious way to write these queries is `where id = any($1)` with a JavaScript
 * array, and that is what they said first. It is also the one piece of Postgres
 * syntax in this service that `pg-mem` silently answers wrongly: `any()` with a
 * parameter matches nothing and raises nothing, so the free-allowance queries
 * returned empty and every assertion about them would have been testing the
 * failure instead of the feature.
 *
 * An expanded placeholder list is exactly equivalent on real Postgres and runs
 * on both, which is the same trade `jobs.ts` makes by computing timestamps in
 * JavaScript rather than writing `now() + interval`. The lists here are two or
 * three anchors long; there is no plan-cache argument against it at this size.
 */
export const placeholders = (count: number, from = 1): string =>
  Array.from({ length: count }, (_, index) => `$${from + index}`).join(', ');

/**
 * Runs a unit of work inside one transaction, on one connection.
 *
 * There is exactly one reason this exists, and it is worth being precise about
 * because the rest of this service deliberately avoids transactions. Every other
 * invariant here lives inside a single row — the photograph scrub in `jobs.ts`
 * is one `update` that moves the status and nulls the key together, which is why
 * `docs/preview-generation.md` can call it a state transition rather than a
 * cleanup job.
 *
 * A credit cannot be written that way: the balance is in `credit_balances` or
 * `free_allowance` and the status is in `preview_jobs`, and two tables cannot be
 * moved by one statement. The alternatives were a data-modifying CTE, which
 * `pg-mem` does not run and would therefore make the credit path untestable, and
 * settling in a second call, which leaves a window where a crash strands a
 * user's credit in `held` forever. So: one transaction, both tables, and a check
 * that can actually execute it.
 *
 * `BEGIN`/`COMMIT` rather than a library, and `pool.connect()` rather than
 * `pool.query`, so that `check-credits.mjs` can point this at its in-memory
 * database by substituting one function.
 */
export async function withTransaction<T>(work: (tx: Queryer) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const tx: Queryer = async <R extends pg.QueryResultRow>(text: string, values: unknown[] = []) =>
    (await client.query<R>(text, values)).rows;
  try {
    await client.query('begin');
    const result = await work(tx);
    await client.query('commit');
    return result;
  } catch (error) {
    // Best effort: if the rollback itself fails the connection is broken, and
    // the original error is the one worth reporting.
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Fails fast at boot rather than on the first request. */
export async function assertConnectable(): Promise<void> {
  await pool.query('select 1');
}
