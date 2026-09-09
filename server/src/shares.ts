/**
 * Sharing: minting a link, resolving one, the page it lands on, and the funnel
 * underneath.
 *
 * Six routes, and one sentence that explains the shape of all of them: **the
 * image is never here.** A share is a hairstyle id and a code. The picture the
 * sharer posts is composed on their phone, from a preview that already lives
 * only on their phone, and handed to whichever app they chose by the operating
 * system. This process learns that a share happened and what cut it was of.
 *
 * That is what makes the feature cheap enough to sit inside the catalog API
 * rather than beside it: `POST /v1/shares` is an insert, `GET /s/:code` is a
 * select plus a counter, and neither touches storage, the worker or fal. The
 * brief asked not to add infrastructure unless it was actually necessary, and
 * the honest answer here is that none is.
 *
 * ## Where the copy lives
 *
 * The caption that travels with a shared image is returned by `POST /v1/shares`
 * rather than being compiled into the app, and the app carries its own copy of
 * the same wording as a fallback. That is the one deliberate duplication in this
 * module and it earns itself: the caption is the advertisement, it will be tuned
 * far more often than the app ships, and a build with no API still has to have
 * something to say.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { getCatalog } from './catalog.js';
import { deviceIdFor, deviceSecretFrom, touchDevice } from './devices.js';
import { env } from './env.js';
import {
  appleAppSiteAssociation,
  assetLinks,
  landingPage,
  shareTitle,
  unknownLinkPage,
} from './landing.js';
import { resolveReference } from './reference.js';
import {
  attribute,
  attributionFor,
  createShareLink,
  getShareLink,
  isShareCode,
  isShareEvent,
  newShareCode,
  recordEvents,
  recordOpen,
  setShareChannel,
  type ShareEvent,
  type ShareLinkRow,
} from './shareLinks.js';
import { GENDERS, HAIR_LENGTH_IDS, HAIR_TYPE_IDS, type Gender, type HairLengthId, type HairTypeId } from './types.js';

const isGender = (value: unknown): value is Gender => GENDERS.includes(value as Gender);
const isHairType = (value: unknown): value is HairTypeId => HAIR_TYPE_IDS.includes(value as HairTypeId);
const isLength = (value: unknown): value is HairLengthId => HAIR_LENGTH_IDS.includes(value as HairLengthId);

/** The apps the sheet can be pointed at, plus the OS sheet itself. */
const CHANNELS = ['instagram', 'whatsapp', 'facebook', 'system', 'unknown'] as const;
const channelOf = (value: unknown): string | null =>
  typeof value === 'string' && (CHANNELS as readonly string[]).includes(value) ? value : null;

/**
 * The origin this deployment is reachable at.
 *
 * `SHARE_BASE_URL` when somebody has pointed a real domain at this service;
 * otherwise the request's own origin, which on Railway is the deployment url and
 * is correct — a link that works is worth more than a link that is pretty. The
 * forwarded headers are trusted because `trustProxy` is on and Railway is the
 * only thing in front of this process.
 */
function originFor(request: FastifyRequest): string {
  if (env.share.baseUrl) return env.share.baseUrl;
  const proto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? request.protocol;
  const host = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? request.headers.host;
  return `${proto}://${host}`;
}

const shareUrl = (origin: string, code: string): string => `${origin}/s/${code}`;
const deepLinkFor = (code: string): string => `${env.share.appScheme}://s/${code}`;

/**
 * The Play url, with the code riding along in `referrer`.
 *
 * Google preserves that parameter through the install and hands it to the app
 * on first run via the Install Referrer API. Nothing in this build reads it —
 * that needs a native module — so this is a seam rather than a working path, and
 * it costs one query parameter to leave open. The iOS side has no equivalent
 * that does not involve a third-party SDK, which is stated plainly here so
 * nobody later assumes the two platforms are symmetric.
 */
function androidUrlFor(code: string): string | null {
  const base =
    env.share.androidPlayUrl ??
    (env.share.androidPackage ? `https://play.google.com/store/apps/details?id=${env.share.androidPackage}` : null);
  if (!base) return null;
  const referrer = encodeURIComponent(`utm_source=share&utm_medium=app&share=${code}`);
  return `${base}${base.includes('?') ? '&' : '?'}referrer=${referrer}`;
}

/**
 * The caption a shared image travels with.
 *
 * Two sentences and a link. The first is the sharer talking about their own
 * haircut, which is the thing their friends actually want to look at; the second
 * is the invitation. Anything longer reads as a forward rather than as a post,
 * and a post is the only version of this anybody will send twice.
 */
function captionFor(hairstyleName: string, url: string): string {
  return `Trying the ${hairstyleName} ✂️\nTry this hairstyle on Louvo: ${url}`;
}

/** The mannequin render of the shared cut — the catalog's image, never the user's. */
async function heroImageFor(link: ShareLinkRow): Promise<string | null> {
  try {
    const catalog = await getCatalog();
    const hairstyle = catalog.hairstyles.find((style) => style.id === link.hairstyle_id);
    if (!hairstyle) return null;
    const reference = resolveReference(catalog, hairstyle, link.gender ?? 'male', link.hair_type);
    // `half` is `HERO_ANGLE` — the image on the card the sharer tapped, so the
    // link unfurls as the same picture they were looking at when they shared it.
    return reference?.views.find((view) => view.angle === 'half')?.url ?? hairstyle.imageUrl ?? null;
  } catch {
    // A landing page is not worth failing over a catalog read. The card falls
    // back to a text-only unfurl, which every scraper handles.
    return null;
  }
}

/** The device behind a request, or a 401. Mirrors the preview routes' version. */
async function requireDevice(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const secret = deviceSecretFrom(request.headers.authorization);
  if (!secret) {
    reply.code(401).send({ error: 'device_required', message: 'send Authorization: Device <secret>' });
    return null;
  }
  const deviceId = deviceIdFor(secret);
  await touchDevice(deviceId);
  return deviceId;
}

/** The device behind a request when there is one, and nothing when there is not. */
function optionalDevice(request: FastifyRequest): string | null {
  const secret = deviceSecretFrom(request.headers.authorization);
  return secret ? deviceIdFor(secret) : null;
}

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Mints a share link for a look.
   *
   * Takes what the *link* needs — which cut, on which gender, in which texture —
   * and nothing about the picture. `clientRef` is the sharer's own handle for
   * the look, so pressing Share twice on one result is one link and one row in
   * the funnel rather than two.
   *
   * Returns the caption alongside the url, because the caption is the
   * advertisement and it should be tunable without an app release.
   */
  app.post('/v1/shares', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const hairstyleId = typeof body.hairstyleId === 'string' ? body.hairstyleId : null;
    if (!hairstyleId) {
      reply.code(400);
      return { error: 'invalid_request', message: 'hairstyleId is required' };
    }

    const catalog = await getCatalog();
    const hairstyle = catalog.hairstyles.find((style) => style.id === hairstyleId);
    // The name is taken from the catalog rather than from the client: it is
    // rendered into a public page and into somebody else's chat preview, so it
    // has to be a value this server chose. A style the catalog has never heard
    // of is refused rather than trusted.
    if (!hairstyle) {
      reply.code(404);
      return { error: 'not_found', message: `no hairstyle "${hairstyleId}"` };
    }

    const link = await createShareLink({
      code: newShareCode(),
      deviceId,
      hairstyleId,
      hairstyleName: hairstyle.name,
      gender: isGender(body.gender) ? body.gender : null,
      hairType: isHairType(body.hairType) ? body.hairType : null,
      lengthId: isLength(body.lengthId) ? body.lengthId : null,
      channel: channelOf(body.channel),
      clientRef: typeof body.clientRef === 'string' ? body.clientRef.slice(0, 100) : null,
    });

    const origin = originFor(request);
    const url = shareUrl(origin, link.code);
    reply.code(201);
    return {
      share: {
        code: link.code,
        url,
        deepLink: deepLinkFor(link.code),
        title: shareTitle(link.hairstyle_name),
        caption: captionFor(link.hairstyle_name, url),
        hairstyleId: link.hairstyle_id,
        hairstyleName: link.hairstyle_name,
        createdAt: link.created_at.getTime(),
      },
    };
  });

  /**
   * What a code points at, as JSON.
   *
   * Public and unauthenticated: this is what the app calls when the OS hands it
   * `luvo://s/<code>`, and at that moment the app may be thirty seconds old
   * and have no device secret yet. It carries no counters and nothing about who
   * made it — a link is a pointer to a haircut, and anybody holding it is
   * already entitled to see the haircut.
   */
  app.get<{ Params: { code: string } }>('/v1/shares/:code', async (request, reply) => {
    const { code } = request.params;
    const link = isShareCode(code) ? await getShareLink(code) : null;
    if (!link) {
      reply.code(404);
      return { error: 'not_found', message: 'that link is not one of ours' };
    }
    reply.header('Cache-Control', 'public, max-age=60');
    return {
      share: {
        code: link.code,
        hairstyleId: link.hairstyle_id,
        hairstyleName: link.hairstyle_name,
        gender: link.gender,
        hairType: link.hair_type,
        lengthId: link.length_id,
        imageUrl: await heroImageFor(link),
        createdAt: link.created_at.getTime(),
      },
    };
  });

  /**
   * The funnel's write endpoint.
   *
   * A batch, because the app sends four events per share and a phone should not
   * spend four round trips saying so. The device header is optional and the
   * whole thing is fire-and-forget from the client's side: an analytics call
   * that can fail a share is worse than no analytics.
   *
   * Unknown event names are dropped rather than rejected, and the response says
   * how many were kept — a client one release ahead of the server must not have
   * its share fail because it learned a new name.
   */
  app.post('/v1/events', async (request) => {
    const deviceId = optionalDevice(request);
    if (deviceId) await touchDevice(deviceId);

    const body = (request.body ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(body.events) ? body.events : [];
    const events: ShareEvent[] = [];

    for (const entry of raw.slice(0, 50)) {
      const event = entry as Record<string, unknown>;
      if (!isShareEvent(event.name)) continue;
      events.push({
        name: event.name,
        code: isShareCode(event.code) ? event.code : null,
        deviceId,
        channel: channelOf(event.channel),
        platform: typeof event.platform === 'string' ? event.platform.slice(0, 16) : null,
        props:
          event.props && typeof event.props === 'object' && !Array.isArray(event.props)
            ? (event.props as Record<string, unknown>)
            : null,
      });
    }

    // A channel chosen after the link was minted belongs on the link too, so
    // "which platform was this share sent to" is answerable without a join.
    for (const event of events) {
      if (event.name === 'share_channel_selected' && event.code && event.channel) {
        await setShareChannel(event.code, event.channel);
      }
    }

    return { recorded: await recordEvents(events), dropped: raw.length - events.length };
  });

  /**
   * "This device arrived on that link."
   *
   * The one attribution this backend can honestly make: the app was opened by a
   * share link and told us so. First write wins and a sharer opening their own
   * link is refused, both in `attribute()`.
   *
   * `first` in the response is the useful half — it says whether an install was
   * just counted, so the client can emit `share_install_attributed` exactly once
   * rather than on every launch that happens to carry a code.
   */
  app.post('/v1/attribution', async (request, reply) => {
    const deviceId = await requireDevice(request, reply);
    if (!deviceId) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (!isShareCode(body.code)) {
      reply.code(400);
      return { error: 'invalid_request', message: 'code is required' };
    }

    const source = body.source === 'referrer' ? 'referrer' : 'deep_link';
    const attribution = (await attribute(deviceId, body.code, source)) ?? (await attributionFor(deviceId));
    if (attribution?.first) {
      await recordEvents([
        { name: 'share_install_attributed', code: attribution.code, deviceId, channel: null, platform: null },
      ]);
    }
    return { attribution };
  });

  /**
   * The landing page.
   *
   * `text/html`, no cache, and the open is counted here rather than in the
   * client — this is the one point in the funnel that is guaranteed to be
   * reached by every person who follows a link, whether or not they ever install
   * anything.
   *
   * A code that does not resolve still gets a page. Somebody arriving from a
   * friend's message is the most qualified visitor this server ever receives,
   * and a 404 spends that on nothing.
   */
  app.get<{ Params: { code: string } }>('/s/:code', async (request, reply) => {
    const { code } = request.params;
    const link = isShareCode(code) ? await recordOpen(code) : null;
    const origin = originFor(request);
    const canonicalUrl = shareUrl(origin, code);

    const shell = {
      code,
      deepLink: deepLinkFor(code),
      iosUrl: env.share.iosAppStoreUrl,
      androidUrl: androidUrlFor(code),
      fallbackUrl: env.share.baseUrl,
      canonicalUrl,
      iosAppId: env.share.iosAppId,
      gender: link?.gender ?? null,
    };

    reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8');

    if (!link) return unknownLinkPage(shell);

    await recordEvents([
      {
        name: 'share_link_opened',
        code: link.code,
        channel: link.channel,
        platform: 'web',
        props: { ua: String(request.headers['user-agent'] ?? '').slice(0, 200) },
      },
    ]);

    return landingPage({
      ...shell,
      hairstyleName: link.hairstyle_name,
      imageUrl: await heroImageFor(link),
    });
  });

  /**
   * Universal and app links, served only when the ids are configured.
   *
   * An association file naming a team id that is not ours is worse than none,
   * because iOS caches it and Android verifies it at install time. So the route
   * 404s until somebody has set the values, which is the same rule the rest of
   * this deployment follows for the bucket and the generator key.
   */
  app.get('/.well-known/apple-app-site-association', async (_request, reply) => {
    if (!env.share.iosTeamId) {
      reply.code(404);
      return { error: 'not_configured', message: 'IOS_TEAM_ID is not set' };
    }
    // Apple requires `application/json` and no redirect. It is a static document
    // and it is allowed to be cached hard.
    reply.type('application/json').header('Cache-Control', 'public, max-age=3600');
    return appleAppSiteAssociation(env.share.iosTeamId, env.share.iosBundleId);
  });

  app.get('/.well-known/assetlinks.json', async (_request, reply) => {
    if (!env.share.androidFingerprints.length) {
      reply.code(404);
      return { error: 'not_configured', message: 'ANDROID_SHA256_FINGERPRINTS is not set' };
    }
    reply.type('application/json').header('Cache-Control', 'public, max-age=3600');
    return assetLinks(env.share.androidPackage, env.share.androidFingerprints);
  });
}
