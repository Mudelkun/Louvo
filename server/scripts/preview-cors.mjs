#!/usr/bin/env node
/**
 * The preview bucket's CORS policy, which the web build cannot upload without.
 *
 *   node scripts/preview-cors.mjs                        # read what is set
 *   node scripts/preview-cors.mjs http://localhost:8081  # set it
 *
 * The upload is the one request in the whole flow that does not go to our API:
 * the phone PUTs the photograph straight to a presigned url on the bucket. On a
 * phone that is an ordinary HTTPS request and nothing else is involved. In a
 * browser it is a cross-origin `PUT`, so it preflights — and a bucket with no
 * CORS policy answers that preflight `403 CORS not configured for this bucket`.
 *
 * The browser reports that to JavaScript as a bare `TypeError: Failed to fetch`
 * with no status and no body, which the app can only describe as "no connection
 * to the generator". The job then sits in `awaiting_upload` forever, looking
 * exactly like a slow queue. Nothing server-side sees any of it, which is why
 * this is a script rather than a line in a README.
 *
 * ## What is and is not protecting the object
 *
 * CORS is not access control and this policy grants nothing. What protects a
 * photograph in this bucket is that its key is 32 random bytes, its url expires
 * in minutes, and the bucket has no public domain and no CDN. This only says
 * which browser origins are allowed to *use* a url they were already handed.
 *
 * Still worth listing origins rather than `*`: the list is a statement of where
 * this app is served from, and a wildcard would quietly cover a page nobody
 * meant to serve it from.
 */

import { createHash, createHmac } from 'node:crypto';
import process from 'node:process';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** How long a browser may cache the preflight. Long: this policy rarely moves. */
const MAX_AGE_SECONDS = 3600;

function config() {
  const bucket = process.env.PREVIEW_BUCKET;
  const endpoint =
    process.env.R2_ENDPOINT ??
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  const missing = [];
  if (!bucket) missing.push('PREVIEW_BUCKET');
  if (!endpoint) missing.push('R2_ENDPOINT (or R2_ACCOUNT_ID)');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (missing.length) {
    console.error(`preview storage is not configured — missing ${missing.join(', ')}`);
    process.exit(1);
  }

  return { bucket, endpoint: endpoint.replace(/\/$/, ''), accessKeyId, secretAccessKey, region: process.env.R2_REGION ?? 'auto' };
}

/**
 * SigV4 over `<method> /<bucket>?cors`.
 *
 * Written out here rather than reached for in `src/storage.ts`, whose
 * `signedFetch` signs an empty canonical query string: every request that module
 * makes is against an object, and `?cors` is a bucket subresource that has to
 * appear in the canonical request or the signature is over a different request
 * than the one being sent.
 */
function sign({ method, cfg, body }) {
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`;
  const payloadHash = sha256(body ?? '');

  const headers = {
    host: new URL(cfg.endpoint).host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(body ? { 'content-type': 'application/xml' } : {}),
  };
  const names = Object.keys(headers).sort();

  const canonicalRequest = [
    method,
    `/${cfg.bucket}`,
    'cors=',
    names.map((name) => `${name}:${headers[name].trim()}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');

  const toSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), SERVICE), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');

  const { host: _host, ...sendable } = headers;
  return {
    ...sendable,
    authorization:
      `${ALGORITHM} Credential=${cfg.accessKeyId}/${scope}, ` +
      `SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

const target = (cfg) => `${cfg.endpoint}/${cfg.bucket}?cors`;

/**
 * The policy itself.
 *
 * `PUT` is the upload and `GET` is nothing the app does — the finished preview
 * is fetched by a presigned url from the same bucket, and a build that ever
 * downloads it in a browser needs the method here rather than a second trip to
 * this script. `ETag` is exposed because a PUT's only useful response header is
 * one a browser hides by default.
 */
const policy = (origins) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CORSConfiguration>',
    ...origins.map((origin) =>
      [
        '  <CORSRule>',
        `    <AllowedOrigin>${origin}</AllowedOrigin>`,
        '    <AllowedMethod>PUT</AllowedMethod>',
        '    <AllowedMethod>GET</AllowedMethod>',
        '    <AllowedMethod>HEAD</AllowedMethod>',
        '    <AllowedHeader>*</AllowedHeader>',
        '    <ExposeHeader>ETag</ExposeHeader>',
        `    <MaxAgeSeconds>${MAX_AGE_SECONDS}</MaxAgeSeconds>`,
        '  </CORSRule>',
      ].join('\n'),
    ),
    '</CORSConfiguration>',
  ].join('\n');

async function read(cfg) {
  const response = await fetch(target(cfg), { method: 'GET', headers: sign({ method: 'GET', cfg }) });
  const text = await response.text();
  if (response.status === 404 || /CORS not configured/i.test(text)) {
    console.log(`${cfg.bucket}: no CORS policy — a browser cannot upload to this bucket.`);
    console.log('Set one:  npm run previews:cors -- http://localhost:8081 <other origins…>');
    return;
  }
  if (!response.ok) throw new Error(`GET ?cors -> ${response.status}: ${text.slice(0, 300)}`);
  console.log(`${cfg.bucket}: current policy\n`);
  console.log(text.trim());
}

async function write(cfg, origins) {
  const body = policy(origins);
  const response = await fetch(target(cfg), { method: 'PUT', headers: sign({ method: 'PUT', cfg, body }), body });
  if (!response.ok) throw new Error(`PUT ?cors -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
  console.log(`${cfg.bucket}: CORS set for ${origins.length} origin${origins.length === 1 ? '' : 's'}`);
  for (const origin of origins) console.log(`  ${origin}`);
}

const cfg = config();
const origins = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const fromEnv = (process.env.PREVIEW_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const wanted = origins.length ? origins : fromEnv;

try {
  if (wanted.length) await write(cfg, wanted);
  else await read(cfg);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
