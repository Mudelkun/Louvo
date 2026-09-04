/**
 * Environment for the publish tools.
 *
 * The API server itself reads a real environment — Railway injects it — and has
 * no dotenv dependency. These scripts run on somebody's laptop against a
 * production database and a production bucket, so they read the files that are
 * already in this repo's habit: `server/.env` for the database and the bucket,
 * and the root `.env.local` that the generator scripts already use.
 *
 * `process.loadEnvFile` is Node's own, so this needs no package. Existing
 * variables win: an env var set in the shell is an explicit choice and must
 * outrank a file.
 */

import path from 'node:path';
import process from 'node:process';

/** @param {string} serverRoot the `server/` directory */
export function loadEnv(serverRoot) {
  const repoRoot = path.resolve(serverRoot, '..');
  // Later files must not clobber earlier ones, and `loadEnvFile` does not
  // overwrite what is already set — so the most specific file goes first.
  for (const file of [
    path.join(serverRoot, '.env'),
    path.join(serverRoot, '.env.local'),
    path.join(repoRoot, '.env.local'),
  ]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Absent is the normal case for two of the three.
    }
  }
}
