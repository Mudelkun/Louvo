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

/** Fails fast at boot rather than on the first request. */
export async function assertConnectable(): Promise<void> {
  await pool.query('select 1');
}
