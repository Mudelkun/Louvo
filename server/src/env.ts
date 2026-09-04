/**
 * Configuration, read once and validated loudly.
 *
 * A server that boots with a missing `DATABASE_URL` and fails on the first
 * request is a server whose deploy looked green. Everything required is checked
 * here, at startup, so Railway's health check is the thing that goes red.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see server/.env.example`);
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

export const env = {
  /** Railway injects this. */
  databaseUrl: required('DATABASE_URL'),

  /** Railway injects `PORT`; the default is only for a local run. */
  port: integer('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',

  logLevel: process.env.LOG_LEVEL ?? 'info',

  /**
   * How long a built catalog may be reused without checking the revision.
   *
   * The catalog changes only when someone runs a publish, so this is the
   * staleness a publisher is willing to wait through, not a correctness knob.
   * Zero means check the revision on every request, which is one cheap query.
   */
  catalogCacheMs: integer('CATALOG_CACHE_MS', 30_000),

  /**
   * Allowed browser origins. Native clients do not send `Origin` and are
   * unaffected; this is for `npm run web` and for any future admin UI.
   * `*` is the default because the catalog is public, read-only data.
   */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  /**
   * `require` unless told otherwise: Railway's internal Postgres URL is not TLS,
   * its public one is, and neither presents a certificate this process has a
   * root for.
   */
  databaseSsl: (process.env.DATABASE_SSL ?? 'auto') as 'auto' | 'off' | 'on',
} as const;
