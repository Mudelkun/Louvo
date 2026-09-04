#!/usr/bin/env node
/**
 * The share loop, end to end, without a database or a browser.
 *
 *   npm run build && node scripts/check-shares.mjs
 *
 * `check-previews.mjs` guards the thing that goes silently wrong in a job queue.
 * This one guards the three that go silently wrong in a referral loop, and none
 * of them throws when it breaks:
 *
 * **A funnel that double-counts.** A share is worth measuring only if one press
 * is one row. A retried create that mints a second code, or a sharer opening
 * their own link and being counted as an install, turns the one number this
 * feature exists to produce into a number nobody can act on.
 *
 * **A card that does not unfurl.** The landing page's whole job is to be scraped
 * by WhatsApp and Facebook before a human ever sees it. That happens with no
 * JavaScript, so the title, the description and `og:image` have to be in the
 * markup — and the image has to be the *catalog's* render, because the sharer's
 * photograph is the one thing that must never appear in somebody else's group
 * chat.
 *
 * **Attribution that drifts.** First-write-wins is the rule; a second link must
 * not move the credit, and a device that never reported one must not acquire it.
 *
 * It runs the real migrations and the real SQL against `pg-mem`, and the real
 * page renderer against its own output. It needs no database, no credentials and
 * no network.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let newDb;
try {
  ({ newDb } = await import('pg-mem'));
} catch {
  console.log('pg-mem is not installed — skipping.');
  process.exit(0);
}

const db = newDb({ autoCreateForeignKeyIndices: true });
db.public.registerFunction({
  name: 'now',
  returns: db.public.getType?.('timestamptz') ?? undefined,
  implementation: () => new Date(),
  impure: true,
});

const { Client } = db.adapters.createPg();
const client = new Client();
await client.connect();

for (const file of (await readdir(path.join(SERVER_ROOT, 'migrations'))).filter((f) => f.endsWith('.sql')).sort()) {
  await client.query(await readFile(path.join(SERVER_ROOT, 'migrations', file), 'utf8'));
}

process.env.DATABASE_URL ??= 'postgres://shares/local';
const dbModule = await import('../dist/db.js').catch(() => null);
if (!dbModule) {
  console.error('  ! run `npm run build` first — this checks the compiled server.');
  process.exit(1);
}
dbModule.pool.query = (text, values) => client.query(text, values);

const links = await import('../dist/shareLinks.js');
const { landingPage, unknownLinkPage, appleAppSiteAssociation, assetLinks, shareTitle } = await import(
  '../dist/landing.js'
);
const { deviceIdFor, touchDevice } = await import('../dist/devices.js');

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

const code = links.newShareCode();
assert.match(code, /^[A-Za-z0-9]{10}$/, 'a code is ten base62 characters');
assert.ok(links.isShareCode(code), 'a freshly minted code must pass the guard that reads it back');
// The two characters a chat client is most likely to eat, and a path traversal
// for good measure — a code lands in a url path, so the guard is the only thing
// standing between `/s/:code` and a query with a surprise in it.
for (const bad of ['../etc', 'has-dash', 'has_underscore', '', 'a'.repeat(64)]) {
  assert.equal(links.isShareCode(bad), false, `"${bad}" must not read as a share code`);
}
assert.equal(new Set(Array.from({ length: 200 }, links.newShareCode)).size, 200, 'codes do not repeat');

// ---------------------------------------------------------------------------
// One press, one link
// ---------------------------------------------------------------------------

const sharer = deviceIdFor('check-shares-sharer-secret-000000000000');
const friend = deviceIdFor('check-shares-friend-secret-000000000000');
await touchDevice(sharer);
await touchDevice(friend);

const made = await links.createShareLink({
  code: links.newShareCode(),
  deviceId: sharer,
  hairstyleId: 'textured-crop',
  hairstyleName: 'Textured Crop',
  gender: 'male',
  hairType: 'curly',
  lengthId: null,
  channel: null,
  clientRef: 'look_abc',
});
assert.equal(made.opens, 0, 'a new link has never been opened');
assert.equal(made.hairstyle_name, 'Textured Crop');

// The retry that must not become a second row in the funnel.
const again = await links.createShareLink({
  code: links.newShareCode(),
  deviceId: sharer,
  hairstyleId: 'textured-crop',
  hairstyleName: 'Textured Crop',
  gender: 'male',
  hairType: 'curly',
  lengthId: null,
  channel: 'whatsapp',
  clientRef: 'look_abc',
});
assert.equal(again.code, made.code, 'a replayed create returns the original link, not a second one');
assert.equal(again.channel, 'whatsapp', 'the channel the sharer eventually picked lands on the link');

// A second look by the same person is a second link, not a collision.
const other = await links.createShareLink({
  code: links.newShareCode(),
  deviceId: sharer,
  hairstyleId: 'buzz-cut',
  hairstyleName: 'Buzz Cut',
  gender: 'male',
  hairType: null,
  lengthId: null,
  channel: null,
  clientRef: 'look_def',
});
assert.notEqual(other.code, made.code, 'a different look gets a different link');

// ---------------------------------------------------------------------------
// Opens
// ---------------------------------------------------------------------------

assert.equal(await links.recordOpen('NotARealCode'), null, 'an unknown code opens nothing and says so');
const opened = await links.recordOpen(made.code);
assert.equal(opened.opens, 1, 'following a link counts an open');
assert.ok(opened.last_opened_at instanceof Date, 'and stamps when');
await links.recordOpen(made.code);
assert.equal((await links.getShareLink(made.code)).opens, 2, 'opens accumulate');

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

assert.ok(links.isShareEvent('share_initiated'), 'the funnel knows its own events');
assert.equal(links.isShareEvent('share_everything'), false, 'and only its own');

const kept = await links.recordEvents([
  { name: 'share_opened', code: made.code, deviceId: sharer, channel: null, platform: 'ios' },
  { name: 'share_channel_selected', code: made.code, deviceId: sharer, channel: 'instagram', platform: 'ios' },
  { name: 'share_initiated', code: made.code, deviceId: sharer, channel: 'instagram', platform: 'ios' },
  { name: 'share_completed', code: made.code, deviceId: sharer, channel: 'instagram', platform: 'ios', props: { activity: 'com.burbn.instagram' } },
]);
assert.equal(kept, 4, 'a batch of four is one insert of four');
assert.equal(await links.recordEvents([]), 0, 'an empty batch is not a query');

const stored = (await client.query('select name, channel, props from share_events order by id')).rows;
assert.equal(stored.length, 4, 'every event in the batch landed');
assert.equal(stored[3].name, 'share_completed');
// The props column is where the platform's own answer goes — on iOS the share
// sheet says which app took it, which is the only place in this funnel the
// destination is a fact rather than a button somebody pressed.
const props = typeof stored[3].props === 'string' ? JSON.parse(stored[3].props) : stored[3].props;
assert.equal(props.activity, 'com.burbn.instagram', 'a completed share keeps what the OS told us');

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

assert.equal(await links.attribute(sharer, made.code, 'deep_link'), null, 'opening your own share is not an install');
assert.equal(await links.attribute(friend, 'NotARealCode', 'deep_link'), null, 'an unknown code attributes nothing');

const first = await links.attribute(friend, made.code, 'deep_link');
assert.equal(first.first, true, 'the first arrival is the one that counts');
assert.equal(first.code, made.code);
assert.equal((await links.getShareLink(made.code)).installs, 1, 'and it moves the link’s install counter');

const repeat = await links.attribute(friend, made.code, 'deep_link');
assert.equal(repeat.first, false, 'the same device arriving again is not a second install');
assert.equal((await links.getShareLink(made.code)).installs, 1, 'and the counter does not move');

// The regression that would quietly rewrite history: a friend who later opens
// somebody else's link must stay credited to whoever actually brought them in.
const moved = await links.attribute(friend, other.code, 'deep_link');
assert.equal(moved.code, made.code, 'attribution belongs to the first link, permanently');
assert.equal((await links.getShareLink(other.code)).installs, 0, 'a later link earns nothing');

const signup = await links.attributeSignup(friend);
assert.equal(signup.code, made.code, 'a signup is credited to the same link as the install');
assert.equal((await links.getShareLink(made.code)).signups, 1);
assert.equal(await links.attributeSignup(friend), null, 'signing up twice is not two signups');
assert.equal(await links.attributeSignup(sharer), null, 'a device with no attribution has no signup to credit');

// ---------------------------------------------------------------------------
// The page a stranger actually sees
// ---------------------------------------------------------------------------

const page = landingPage({
  code: made.code,
  hairstyleName: 'Textured Crop',
  imageUrl: 'https://cdn.test/textured-crop/curly/half.webp',
  gender: 'male',
  deepLink: `hairify://s/${made.code}`,
  iosUrl: 'https://apps.apple.com/app/id123456789',
  androidUrl: `https://play.google.com/store/apps/details?id=com.hairify.app&referrer=share%3D${made.code}`,
  fallbackUrl: 'https://hairify.app',
  canonicalUrl: `https://hairify.app/s/${made.code}`,
  iosAppId: '123456789',
});

// The scraper's half. None of this runs any JavaScript, so all of it has to be
// in the markup or the link unfurls as a bare url in somebody's group chat.
assert.match(page, /<meta property="og:title" content="[^"]+"/, 'the card has a title');
assert.match(page, /<meta property="og:description" content="[^"]+"/, 'and a description');
assert.match(
  page,
  /<meta property="og:image" content="https:\/\/cdn\.test\/textured-crop\/curly\/half\.webp"/,
  'and the catalog’s own render as its image',
);
assert.match(page, /twitter:card" content="summary_large_image"/, 'a card with an image says so');
assert.ok(page.includes(shareTitle('Textured Crop')), 'the title names the cut that was shared');
assert.ok(page.includes(`hairify://s/${made.code}`), 'the page offers the app to whoever already has it');
assert.ok(page.includes('apps.apple.com'), 'and the store to whoever does not');
assert.ok(page.includes('apple-itunes-app'), 'the smart app banner is set when the app id is known');

// The image on this page is the mannequin. If the sharer's photograph ever
// reaches it, this is the assertion that should have failed first.
assert.equal(page.includes('file://'), false, 'no local file uri may reach the landing page');

// A hairstyle name is catalog data, but it is rendered into a public document,
// so it is escaped like anything else. A name with a quote in it must not be
// able to close an attribute.
const injected = landingPage({
  code: 'AbCdEfGhIj',
  hairstyleName: '"><script>alert(1)</script>',
  imageUrl: null,
  gender: null,
  deepLink: 'hairify://s/AbCdEfGhIj',
  iosUrl: null,
  androidUrl: null,
  fallbackUrl: null,
  canonicalUrl: 'https://hairify.app/s/AbCdEfGhIj',
  iosAppId: null,
});
assert.equal(injected.includes('<script>alert(1)</script>'), false, 'the cut’s name cannot inject markup');
assert.match(injected, /twitter:card" content="summary"/, 'a card with no image asks for the small one');
assert.equal(injected.includes('<meta property="og:image"'), false, 'and does not claim an image it has not got');

const dead = unknownLinkPage({
  code: 'AbCdEfGhIj',
  gender: null,
  deepLink: 'hairify://s/AbCdEfGhIj',
  iosUrl: 'https://apps.apple.com/app/id123456789',
  androidUrl: null,
  fallbackUrl: null,
  canonicalUrl: 'https://hairify.app/s/AbCdEfGhIj',
  iosAppId: null,
});
assert.ok(dead.includes('apps.apple.com'), 'a dead link still offers the download — it is still a warm visitor');

// ---------------------------------------------------------------------------
// The association files
// ---------------------------------------------------------------------------

const aasa = appleAppSiteAssociation('ABCDE12345', 'com.hairify.app');
assert.deepEqual(aasa.applinks.details[0].appIDs, ['ABCDE12345.com.hairify.app']);
assert.equal(aasa.applinks.details[0].components[0]['/'], '/s/*', 'universal links cover the share path only');

const links_json = assetLinks('com.hairify.app', ['AA:BB']);
assert.equal(links_json[0].target.package_name, 'com.hairify.app');
assert.deepEqual(links_json[0].target.sha256_cert_fingerprints, ['AA:BB']);

// ---------------------------------------------------------------------------
// The routes, as Fastify actually serves them
// ---------------------------------------------------------------------------
//
// Everything above exercises the SQL and the renderer directly. This section
// exercises the layer between them and a phone, because that is where the
// failures are the ones nobody notices from a unit test: a 401 that should have
// been a 201, a landing page served as JSON, a well-known file answered with an
// association nobody configured. `app.inject()` runs the real handlers with no
// socket, so it needs no port and no network.

const { loadCatalog } = await import('../../scripts/lib/catalog.mjs');
const { writeHairstyle, writeReferenceTables } = await import('./lib/metadata.mjs');
const { invalidateCatalog } = await import('../dist/catalog.js');

const authored = await loadCatalog({ root: path.resolve(SERVER_ROOT, '..') });
await writeReferenceTables(client, authored);
for (const style of authored.hairstyles) await writeHairstyle(client, style);

// One style with renders on disk, so the landing page has a hero to point at.
const shot = authored.hairstyles.find((style) => Object.values(style.variants).some(Boolean));
const variant = Object.values(shot.variants).find(Boolean);
for (const angle of ['front', 'half', 'side', 'back']) {
  await client.query(
    `insert into renders (hairstyle_id, variant_id, length_id, gender, angle, url, mask_url, width, height, bytes, mask_bytes, source_checksum)
     values ($1, $2, 'medium', 'male', $3, $4, null, 600, 597, 17000, 0, 'deadbeef')`,
    [shot.id, variant, angle, `https://cdn.test/${shot.id}/${variant}/${angle}.webp`],
  );
}
invalidateCatalog();

const { default: Fastify } = await import('fastify');
const { shareRoutes } = await import('../dist/shares.js');
const app = Fastify();
await app.register(shareRoutes);

const device = { authorization: 'Device check-shares-route-secret-000000000000' };

// A device is required to mint, because a link belongs to whoever made it and
// the funnel is meaningless if anybody can create rows in it.
const anonymous = await app.inject({ method: 'POST', url: '/v1/shares', payload: { hairstyleId: shot.id } });
assert.equal(anonymous.statusCode, 401, 'minting a link needs a device');

// A hairstyle the catalog has never heard of is refused rather than trusted:
// the name is rendered into a public page and into somebody else's chat
// preview, so it has to be a value this server chose.
const bogus = await app.inject({
  method: 'POST',
  url: '/v1/shares',
  headers: device,
  payload: { hairstyleId: 'not-a-real-cut' },
});
assert.equal(bogus.statusCode, 404, 'a link may only point at a hairstyle that exists');

const minted = await app.inject({
  method: 'POST',
  url: '/v1/shares',
  headers: device,
  payload: { hairstyleId: shot.id, gender: 'male', clientRef: 'look_route' },
});
assert.equal(minted.statusCode, 201);
const share = minted.json().share;
assert.match(share.url, /\/s\/[A-Za-z0-9]{10}$/, 'the url is the landing page for this code');
assert.equal(share.deepLink, `hairify://s/${share.code}`, 'and the deep link is the app scheme');
assert.ok(share.caption.includes(share.url), 'the caption carries the link — that is the whole loop');
assert.ok(share.caption.includes(shot.name), 'and names the cut, which is what a friend clicks for');

const replay = await app.inject({
  method: 'POST',
  url: '/v1/shares',
  headers: device,
  payload: { hairstyleId: shot.id, gender: 'male', clientRef: 'look_route' },
});
assert.equal(replay.json().share.code, share.code, 'a retried mint is the same link over HTTP too');

// Resolving is public: the app calling it may be thirty seconds old and have no
// device secret yet, which is exactly the case this feature exists to serve.
const resolved = await app.inject({ method: 'GET', url: `/v1/shares/${share.code}` });
assert.equal(resolved.statusCode, 200, 'resolving a link needs no device');
assert.equal(resolved.json().share.hairstyleId, shot.id);
assert.match(resolved.json().share.imageUrl, /\/half\.webp$/, 'the image is the hero render of the cut');

assert.equal((await app.inject({ method: 'GET', url: '/v1/shares/NotARealCode' })).statusCode, 404);

const landing = await app.inject({ method: 'GET', url: `/s/${share.code}` });
assert.equal(landing.statusCode, 200);
assert.match(landing.headers['content-type'], /text\/html/, 'a landing page is a page, not JSON');
assert.equal(landing.headers['cache-control'], 'no-store', 'it counts an open, so it is never cached');
assert.ok(landing.body.includes('og:image'), 'and it unfurls');
assert.equal((await links.getShareLink(share.code)).opens, 1, 'serving it counted the open');

// A dead code still gets a page and still gets the download button.
const dead404 = await app.inject({ method: 'GET', url: '/s/NotARealCode' });
assert.equal(dead404.statusCode, 200, 'a dead link is still a warm visitor, not a 404');
assert.match(dead404.headers['content-type'], /text\/html/);

// Events: unknown names are dropped and counted rather than failing the request.
const events = await app.inject({
  method: 'POST',
  url: '/v1/events',
  headers: device,
  payload: {
    events: [
      { name: 'share_initiated', code: share.code, channel: 'whatsapp' },
      { name: 'share_invented_by_a_newer_client', code: share.code },
    ],
  },
});
assert.equal(events.statusCode, 200);
assert.deepEqual(events.json(), { recorded: 1, dropped: 1 }, 'a client ahead of the server still shares');

// The association files stay absent until somebody has configured them: one
// naming a team id that is not ours is worse than none, because iOS caches it.
assert.equal(
  (await app.inject({ method: 'GET', url: '/.well-known/apple-app-site-association' })).statusCode,
  404,
  'no association file without IOS_TEAM_ID',
);
assert.equal(
  (await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' })).statusCode,
  404,
  'no asset links without ANDROID_SHA256_FINGERPRINTS',
);

await app.close();

console.log('Share loop clean.');
console.log('  links: one press is one link, a retry returns the first, a second look is a second link.');
console.log('  funnel: opens counted on the row, events appended, unknown names never reach the table.');
console.log('  attribution: first link wins, self-shares refused, a repeat arrival is not a second install.');
console.log('  landing: og title/description/image in the markup, the cut’s render and never a photograph.');
console.log('  routes: device-gated mint, public resolve, html landing that counts, well-knowns absent until set.');
await client.end();
