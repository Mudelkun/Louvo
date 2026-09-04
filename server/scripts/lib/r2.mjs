/**
 * A minimal S3-compatible client: PUT an object, ask whether one exists.
 *
 * Two methods is the whole of what publishing needs, so this is signed by hand
 * rather than by pulling in `@aws-sdk/client-s3` and its hundred packages —
 * the same call this repo already makes for `scripts/lib/fal.mjs`, which is a
 * hand-written queue client for the same reason.
 *
 * Signing is AWS Signature V4, which R2 implements. Nothing here is
 * Cloudflare-specific: point `endpoint` at S3, B2 or Bunny's S3 gateway and the
 * same code works, which is the portability the storage decision was partly
 * made for (docs/catalog-architecture.md).
 *
 * Path-style addressing (`<endpoint>/<bucket>/<key>`) rather than virtual-host
 * style, because R2 only speaks path style on its `*.r2.cloudflarestorage.com`
 * endpoint.
 */

import { createHash, createHmac } from 'node:crypto';

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * Percent-encodes a key for the canonical request.
 *
 * `/` is left alone because it separates path segments; everything else follows
 * RFC 3986 unreserved. `encodeURIComponent` is close but leaves `!'()*` alone,
 * and S3 rejects the resulting signature rather than the request, which is a
 * miserable thing to debug.
 */
const encodeKey = (key) =>
  key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`),
    )
    .join('/');

/**
 * @param {{ accountId?: string, endpoint?: string, bucket: string,
 *           accessKeyId: string, secretAccessKey: string, region?: string,
 *           publicBaseUrl: string }} config
 */
export function createStorage(config) {
  const endpoint = (
    config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`
  ).replace(/\/$/, '');
  const region = config.region ?? 'auto';
  const publicBase = config.publicBaseUrl.replace(/\/$/, '');
  const { host } = new URL(endpoint);

  function sign({ method, key, payloadHash, headers }) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    // Lower-cased on the way in, so the canonical form and the headers actually
    // sent are built from one object and cannot drift.
    const signed = Object.fromEntries(
      Object.entries({
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...headers,
      }).map(([name, value]) => [name.toLowerCase(), String(value).trim()]),
    );

    const names = Object.keys(signed).sort();
    const canonicalHeaders = names.map((name) => `${name}:${signed[name]}\n`).join('');
    const signedHeaders = names.join(';');

    const canonicalRequest = [
      method,
      `/${config.bucket}/${encodeKey(key)}`,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
    const stringToSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join('\n');

    const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, SERVICE);
    const signature = Buffer.from(hmac(hmac(kService, 'aws4_request'), stringToSign)).toString('hex');

    // `host` is signed but not sent: undici derives it from the URL and setting
    // it by hand is either ignored or rejected depending on the runtime. Leaving
    // it in the returned headers is a signature mismatch waiting to happen on
    // whichever Node version changes its mind.
    const { host: _host, ...sendable } = signed;
    return {
      ...sendable,
      Authorization:
        `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  const url = (key) => `${endpoint}/${config.bucket}/${encodeKey(key)}`;

  return {
    /** The URL a phone will fetch this object from — the CDN, never the bucket. */
    publicUrl: (key) => `${publicBase}/${encodeKey(key)}`,

    /**
     * Whether the object is already there.
     *
     * The keys are content hashes, so "already there" means "byte-identical",
     * which is what makes a republish of an unchanged catalog upload nothing.
     */
    async exists(key) {
      const headers = sign({ method: 'HEAD', key, payloadHash: sha256(''), headers: {} });
      const response = await fetch(url(key), { method: 'HEAD', headers });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`HEAD ${key} -> ${response.status} ${response.statusText}`);
      return true;
    },

    /**
     * @param {string} key
     * @param {Buffer} body
     * @param {{ contentType: string, cacheControl?: string }} opts
     */
    async put(key, body, { contentType, cacheControl = 'public, max-age=31536000, immutable' }) {
      const headers = sign({
        method: 'PUT',
        key,
        payloadHash: sha256(body),
        headers: { 'content-type': contentType, 'cache-control': cacheControl },
      });
      const response = await fetch(url(key), { method: 'PUT', headers, body });
      if (!response.ok) {
        throw new Error(`PUT ${key} -> ${response.status} ${response.statusText}\n${await response.text()}`);
      }
    },
  };
}

/**
 * Reads the storage config from the environment, or explains what is missing.
 *
 * `R2_PUBLIC_BASE_URL` is separate from the endpoint on purpose: uploads go to
 * the bucket's S3 endpoint with credentials, and reads come from a public
 * custom domain or `r2.dev` subdomain with none. Writing the bucket endpoint
 * into the catalog would put signed-only URLs on every phone.
 */
export function storageFromEnv() {
  // Cloudflare's own dashboard calls it "Bucket name", so both spellings are
  // accepted rather than making anyone re-read a doc to find out which one this
  // happens to want.
  const bucket = process.env.R2_BUCKET ?? process.env.R2_BUCKET_NAME;

  const missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL'].filter(
    (name) => !process.env[name],
  );
  if (!bucket) missing.unshift('R2_BUCKET (or R2_BUCKET_NAME)');
  if (!process.env.R2_ENDPOINT && !process.env.R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID (or R2_ENDPOINT)');
  if (missing.length) throw new Error(`storage is not configured — missing ${missing.join(', ')}`);

  return createStorage({
    accountId: process.env.R2_ACCOUNT_ID,
    endpoint: process.env.R2_ENDPOINT,
    bucket,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    region: process.env.R2_REGION,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  });
}
