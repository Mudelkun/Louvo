/**
 * The worker as its own Railway service (`npm run start:worker`).
 *
 * The loop itself is `worker.ts`; with `WORKER_IN_API=true` the API runs the same
 * loop in its own process instead and this service can be deleted.
 */

import { startWorker } from './worker.js';

await startWorker({ ownsProcess: true });
