/**
 * The Hairify catalog API.
 *
 * Fastify rather than Express for two reasons that are specific to this service:
 * `/v1/catalog` is a single large JSON document served to every app start, and
 * Fastify's serializer plus `@fastify/compress` and `@fastify/etag` turn that
 * into a ~45 KB gzipped response with conditional revalidation and no code of
 * ours. The rest is a handful of read-only routes where the framework barely
 * matters.
 *
 * Deploy on Railway with the root directory set to `server/`:
 *   build   npm ci && npm run build
 *   start   npm run start
 *   health  /health
 */

import compress from '@fastify/compress';
import cors from '@fastify/cors';
import etag from '@fastify/etag';
import Fastify, { type FastifyError } from 'fastify';

import { assertConnectable, pool } from './db.js';
import { env } from './env.js';
import { routes } from './routes.js';
import { storage } from './storage.js';

const app = Fastify({
  logger: { level: env.logLevel },
  // Railway terminates TLS in front of the process, so the client's real
  // address and protocol arrive in headers. Without this every log line says
  // the proxy's address.
  trustProxy: true,
});

await app.register(cors, { origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') });

/**
 * ETag before compress.
 *
 * Both are `onSend` hooks and the order they are registered is the order they
 * run, so this hashes the payload the client semantically received rather than
 * the particular gzip stream it happened to get — which is what keeps the tag
 * stable across clients that negotiate different encodings.
 */
await app.register(etag, { weak: true });
await app.register(compress, { global: true, threshold: 1024 });

await app.register(routes);

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error({ err: error }, 'request failed');
  reply.code(error.statusCode ?? 500).send({
    error: 'internal_error',
    // The message is safe to return: everything this service can fail at is a
    // database or a query, and none of it carries user data.
    message: error.message,
  });
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal));
}

try {
  // Fail the deploy rather than the first request — see `assertConnectable`.
  await assertConnectable();
  await app.listen({ port: env.port, host: env.host });
  // Said out loud at boot, because the alternative is finding out from a phone.
  // A deployment whose `PREVIEW_BUCKET` disagrees with the worker's mints upload
  // urls into a bucket nothing reads, and every symptom of that appears three
  // hops away — as a job that never leaves `awaiting_upload`.
  app.log.info(
    { previews: !!(storage && env.previews.falKey), bucket: env.previews.storage?.bucket ?? null },
    'ready',
  );
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
