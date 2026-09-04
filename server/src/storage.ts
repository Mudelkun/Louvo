/**
 * The transient object store: signed uploads in, signed downloads out, and a
 * delete that actually runs.
 *
 * A TypeScript sibling of `scripts/lib/r2.mjs` rather than a shared module, for
 * the reason the rest of this repo mirrors instead of sharing: that one runs on
 * a laptop under plain node during a publish, this one runs inside the deployed
 * server. What is genuinely new here is **presigning** — putting the signature in
 * the query string instead of the headers — and it is what keeps image bytes out
 * of this process entirely.
 *
 * That property is the whole scaling story of the preview backend. The phone
 * PUTs its photograph straight to R2 with a url this process signed in about
 * twenty microseconds; fifteen hundred simultaneous uploads are fifteen hundred
 * connections to Cloudflare and none to us. The only bytes we ever touch are the
 * finished preview, once, on its way from fal to the bucket.
 *
 * Signing is AWS Signature V4, which R2 implements, and nothing here is
 * Cloudflare-specific — the same code works against S3 or B2, which is the
 * portability the storage decision was made for (docs/catalog-architecture.md).
 */

import { createHash, createHmac } from 'node:crypto';

import { env } from './env.js';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
/** A presigned url signs no body, and says so where the payload hash would go. */
const UNSIGNED = 'UNSIGNED-PAYLOAD';

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 3986 unreserved. `encodeURIComponent` leaves `!'()*` alone and S3 rejects
 * the resulting signature rather than the request — a miserable thing to debug,
 * which is why this is spelled out here as it is in the publish script's copy. */
const escape = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `/` separates path segments and is left alone; everything else is escaped. */
const encodeKey = (key: string): string => key.split('/').map(escape).join('/');

export interface StorageConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface Storage {
  /** A url the phone may `PUT` bytes to, and nothing else, for a few minutes. */
  presignPut(key: string, ttlSeconds: number): string;
  /** A url the phone may `GET` once it has been told the preview is ready. */
  presignGet(key: string, ttlSeconds: number): string;
  /** Uploads bytes from this process. Used for exactly one thing: the result. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Removes an object. The primary mechanism by which nothing is retained. */
  remove(key: string): Promise<void>;
  /** Byte length and type, or null when the object is not there. */
  head(key: string): Promise<{ bytes: number; contentType: string | null } | null>;
  /**
   * Whether the bucket exists and these credentials can see it.
   *
   * Worth a method of its own because a missing bucket and a missing object are
   * *both* a 404, and a `head()` that cannot tell them apart reports a
   * misconfigured deployment as an empty one. That distinction cost an afternoon:
   * every presigned PUT came back `NoSuchBucket`, the phone's upload failed at
   * Cloudflare where no server of ours could see it, and the job sat in
   * `awaiting_upload` looking exactly like a slow queue.
   */
  bucketExists(): Promise<boolean>;
}

export function createStorage(config: StorageConfig): Storage {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const { host } = new URL(endpoint);
  const canonicalPath = (key: string) => `/${config.bucket}/${encodeKey(key)}`;
  const objectUrl = (key: string) => `${endpoint}${canonicalPath(key)}`;

  function stamps(): { amzDate: string; dateStamp: string } {
    const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    return { amzDate, dateStamp: amzDate.slice(0, 8) };
  }

  function signingKey(dateStamp: string): Buffer {
    return hmac(
      hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), SERVICE),
      'aws4_request',
    );
  }

  function signature(canonicalRequest: string, amzDate: string, dateStamp: string, scope: string): string {
    const toSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join('\n');
    return createHmac('sha256', signingKey(dateStamp)).update(toSign).digest('hex');
  }

  /**
   * A url that carries its own authorisation.
   *
   * Only `host` is signed, so the client may send whatever headers its platform
   * insists on adding — a phone's HTTP stack is not something this process gets
   * to control, and a signature over `content-type` turns a harmless
   * `image/jpeg; charset=utf-8` into a rejected upload. What actually protects
   * the object is that the key is 32 random bytes and the url expires in
   * minutes.
   */
  function presign(method: 'GET' | 'PUT', key: string, ttlSeconds: number): string {
    const { amzDate, dateStamp } = stamps();
    const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;

    const params: Record<string, string> = {
      'X-Amz-Algorithm': ALGORITHM,
      'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(Math.max(1, Math.floor(ttlSeconds))),
      'X-Amz-SignedHeaders': 'host',
    };
    const canonicalQuery = Object.keys(params)
      .sort()
      .map((name) => `${escape(name)}=${escape(params[name] as string)}`)
      .join('&');

    const canonicalRequest = [
      method,
      canonicalPath(key),
      canonicalQuery,
      `host:${host}\n`,
      'host',
      UNSIGNED,
    ].join('\n');

    const signed = signature(canonicalRequest, amzDate, dateStamp, scope);
    return `${objectUrl(key)}?${canonicalQuery}&X-Amz-Signature=${signed}`;
  }

  /** The header-signed form, for the calls this process makes itself. */
  async function request(
    method: 'PUT' | 'DELETE' | 'HEAD',
    key: string,
    body: Buffer | null,
    contentType?: string,
  ): Promise<Response> {
    return signedFetch(method, canonicalPath(key), objectUrl(key), body, contentType);
  }

  async function signedFetch(
    method: string,
    path: string,
    target: string,
    body: Buffer | null,
    contentType?: string,
  ): Promise<Response> {
    const { amzDate, dateStamp } = stamps();
    const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
    const payloadHash = body ? sha256(body) : sha256('');

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(contentType ? { 'content-type': contentType } : {}),
    };
    const names = Object.keys(headers).sort();
    const canonicalRequest = [
      method,
      path,
      '',
      names.map((name) => `${name}:${(headers[name] as string).trim()}\n`).join(''),
      names.join(';'),
      payloadHash,
    ].join('\n');

    const signed = signature(canonicalRequest, amzDate, dateStamp, scope);
    const authorization =
      `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${names.join(';')}, Signature=${signed}`;

    const { host: _host, ...sendable } = headers;
    return fetch(target, {
      method,
      headers: { ...sendable, authorization },
      body: body ?? undefined,
    });
  }

  return {
    presignPut: (key, ttlSeconds) => presign('PUT', key, ttlSeconds),
    presignGet: (key, ttlSeconds) => presign('GET', key, ttlSeconds),

    async put(key, body, contentType) {
      const response = await request('PUT', key, body, contentType);
      if (!response.ok) {
        throw new Error(`PUT ${key} -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
      }
    },

    /**
     * Deleting something that is not there is a success, not an error.
     *
     * The scrub runs on every path a job can leave — completion, failure,
     * cancellation, expiry, and the sweeper picking up after all of them — so it
     * is expected to run twice on the same key. A 404 that threw would turn the
     * second run into a logged failure and, worse, into a reason for somebody to
     * make the scrub conditional.
     */
    async remove(key) {
      const response = await request('DELETE', key, null);
      if (!response.ok && response.status !== 404) {
        throw new Error(`DELETE ${key} -> ${response.status}`);
      }
    },

    async head(key) {
      const response = await request('HEAD', key, null);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HEAD ${key} -> ${response.status}`);
      const length = Number(response.headers.get('content-length') ?? '0');
      return { bytes: Number.isFinite(length) ? length : 0, contentType: response.headers.get('content-type') };
    },

    /**
     * `HEAD /<bucket>` — S3's HeadBucket, which R2 implements.
     *
     * Signed against the bucket path rather than an object path, which is why
     * `signedFetch` takes a canonical path instead of deriving one from a key.
     */
    async bucketExists() {
      const response = await signedFetch('HEAD', `/${config.bucket}`, `${endpoint}/${config.bucket}`, null);
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`HEAD bucket -> ${response.status}`);
      return true;
    },
  };
}

/**
 * The process-wide store, or null when the deployment has no bucket configured.
 *
 * Null is why the catalog API still boots on a checkout with no credentials —
 * see the note on `previewStorage()` in `env.ts`.
 */
export const storage: Storage | null = env.previews.storage ? createStorage(env.previews.storage) : null;
