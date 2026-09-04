#!/usr/bin/env node
/**
 * The two signatures the preview pipeline cannot work without.
 *
 *   npm run build && node scripts/check-signing.mjs
 *
 * `src/storage.ts` is a second SigV4 implementation in this repo, and it is the
 * one nothing else exercises: a wrong signature there is not a subtle bug, it is
 * every upload failing with a 403 that says nothing useful, in a code path that
 * only runs against a real bucket with real credentials. So it is checked two
 * ways, neither of which needs either.
 *
 * **The header-signed path is compared against `scripts/lib/r2.mjs`**, which has
 * been publishing the catalog to R2 for months and is therefore known-good.
 * `exists()` there and `head()` here sign exactly the same three headers, so the
 * two `Authorization` values must be byte-identical — which pins the canonical
 * request, the credential scope, the key derivation and the key escaping all at
 * once.
 *
 * **The presigned path is recomputed from the specification**, deliberately
 * written out here from AWS's description rather than copied from the module
 * under test. Copying it would only prove the file equals itself; writing it
 * again catches the thing that actually goes wrong, which is a line of the
 * canonical request in the wrong order.
 */

import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import process from 'node:process';

const CONFIG = {
  bucket: 'hairify-transient',
  endpoint: 'https://account123.r2.cloudflarestorage.com',
  region: 'auto',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

// A key with a segment separator and a base64url token in it, so the escaping is
// part of what is being compared rather than an incidental detail.
const KEY = 'in/pv_aB3-x_9/Qm9uZS1icmFzcw';

// --- everything happens at one instant -------------------------------------
// Both implementations read the wall clock inside the signing call, so the two
// runs would otherwise be signed for different seconds and could never match.
const FROZEN = new Date('2026-09-04T12:00:00.000Z');
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [FROZEN.getTime()]));
  }
  static now() {
    return FROZEN.getTime();
  }
}
globalThis.Date = FixedDate;

// --- capture the request instead of making it ------------------------------
let captured = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  captured = { url: String(url), init };
  return new Response('', { status: 200, headers: { 'content-length': '1234', 'content-type': 'image/jpeg' } });
};

// `env.ts` validates at import time and this check has no deployment behind it.
process.env.DATABASE_URL ??= 'postgres://signing/local';

const storageModule = await import('../dist/storage.js').catch((error) => {
  console.error(`  ! could not load the compiled server: ${error.message}`);
  console.error('    run `npm run build` first.');
  return null;
});
if (!storageModule) process.exit(1);
const { createStorage } = storageModule;
const { createStorage: createProven } = await import('./lib/r2.mjs');

const mine = createStorage(CONFIG);
const proven = createProven({ ...CONFIG, publicBaseUrl: 'https://cdn.example.test' });

// --- 1. the header-signed path against the proven implementation -----------
await mine.head(KEY);
const ours = captured.init.headers.authorization;

await proven.exists(KEY);
const theirs = captured.init.headers.Authorization;

assert.ok(ours, 'src/storage.ts sent no authorization header');
assert.equal(
  ours,
  theirs,
  'src/storage.ts and scripts/lib/r2.mjs disagree on a HEAD signature — ' +
    'one of the two canonical requests is wrong',
);

// --- 2. the presigned path, recomputed from the specification --------------
const url = new URL(mine.presignGet(KEY, 900));
const params = url.searchParams;

assert.equal(url.origin + url.pathname, `${CONFIG.endpoint}/${CONFIG.bucket}/${KEY}`, 'presigned path');
assert.equal(params.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
assert.equal(params.get('X-Amz-Expires'), '900');
assert.equal(params.get('X-Amz-SignedHeaders'), 'host', 'only host may be signed — see the note in storage.ts');
assert.match(params.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/, 'signature is 64 hex characters');

const amzDate = params.get('X-Amz-Date');
const dateStamp = amzDate.slice(0, 8);
const scope = `${dateStamp}/${CONFIG.region}/s3/aws4_request`;
assert.equal(params.get('X-Amz-Credential'), `${CONFIG.accessKeyId}/${scope}`, 'credential scope');

// Written from the spec: METHOD, canonical URI, canonical query string, canonical
// headers (each trailing a newline), signed headers, payload hash — and for a
// presigned url the payload hash is the literal UNSIGNED-PAYLOAD.
const canonicalQuery = [
  ['X-Amz-Algorithm', params.get('X-Amz-Algorithm')],
  ['X-Amz-Credential', params.get('X-Amz-Credential')],
  ['X-Amz-Date', amzDate],
  ['X-Amz-Expires', params.get('X-Amz-Expires')],
  ['X-Amz-SignedHeaders', 'host'],
]
  .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
  .join('&');

const canonicalRequest = [
  'GET',
  `/${CONFIG.bucket}/${KEY}`,
  canonicalQuery,
  `host:${new URL(CONFIG.endpoint).host}`,
  '',
  'host',
  'UNSIGNED-PAYLOAD',
].join('\n');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
const signingKey = hmac(
  hmac(hmac(hmac(`AWS4${CONFIG.secretAccessKey}`, dateStamp), CONFIG.region), 's3'),
  'aws4_request',
);
const expected = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

assert.equal(
  params.get('X-Amz-Signature'),
  expected,
  'the presigned signature does not match the canonical form written out from the spec',
);

// A PUT url must differ from a GET url of the same object: the method is the
// first line of the canonical request, and signing the wrong one is a mistake
// that only shows up as a 403 against a real bucket.
const put = new URL(mine.presignPut(KEY, 900));
assert.notEqual(
  put.searchParams.get('X-Amz-Signature'),
  params.get('X-Amz-Signature'),
  'PUT and GET presign to the same signature — the method is not in the canonical request',
);

globalThis.fetch = realFetch;
globalThis.Date = RealDate;

console.log('Signing clean.');
console.log('  header-signed: byte-identical to scripts/lib/r2.mjs, the signer that publishes the catalog.');
console.log('  presigned: matches the canonical form recomputed from the AWS specification.');
