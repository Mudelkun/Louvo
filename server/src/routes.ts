/**
 * The read API.
 *
 * Everything here is a `GET` and everything is public: this is a catalog, and
 * there is nothing in it that is not already on every phone that has the app.
 * Writes happen through `scripts/publish-catalog.mjs` against the database
 * directly, which is why there is no admin surface to secure yet.
 *
 * `/v1/catalog` is the one the app actually calls. The others exist because the
 * app's client already has their signatures (`fetchHairstyles`,
 * `fetchHairstyle`) and because a server that can only return everything at once
 * is a server that cannot grow — see the manifest-size threshold in
 * docs/catalog-architecture.md.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';

import { accountRoutes } from './account.js';
import { checkoutRoutes, stripeWebhookRoutes } from './checkout.js';
import { currentRevision, getCatalog, invalidateCatalog } from './catalog.js';
import { env } from './env.js';
import { LEGAL_DOCUMENTS } from './generated/legal.js';
import { legalPage } from './legal.js';
import { previewRoutes } from './previews.js';
import { shareRoutes } from './shares.js';
import { storage } from './storage.js';
import { stripeConfigured } from './stripe.js';
import { filterHairstyles, recommendationsFor, SORT_IDS, type HairstyleQuery, type SortId } from './hairstyles.js';
import { HAIR_TYPE_IDS, type Gender, type HairTypeId } from './types.js';

/** `?gender=male`. Anything else, including "all", means no gender filter. */
function parseGender(value: unknown): Gender | null {
  return value === 'male' || value === 'female' ? value : null;
}

/**
 * `?hairType=coily`, `?hairType=all`, or absent.
 *
 * "all" and absent both mean *no filter*, which is a real answer rather than a
 * missing one — it is the user browsing without declaring a type.
 */
function parseHairType(value: unknown): HairTypeId | null {
  return typeof value === 'string' && (HAIR_TYPE_IDS as string[]).includes(value)
    ? (value as HairTypeId)
    : null;
}

function parseSort(value: unknown): SortId | null {
  return typeof value === 'string' && (SORT_IDS as string[]).includes(value) ? (value as SortId) : null;
}

function parseLimit(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  // Capped rather than rejected: an oversized limit is a client being greedy,
  // not a client being wrong, and failing the request helps nobody.
  return Math.min(limit, 200);
}

function queryFrom(raw: Record<string, unknown>): HairstyleQuery {
  return {
    gender: parseGender(raw.gender),
    hairType: parseHairType(raw.hairType),
    categoryId: typeof raw.category === 'string' ? raw.category : null,
    sort: parseSort(raw.sort),
    search: typeof raw.q === 'string' ? raw.q : null,
    tag: typeof raw.tag === 'string' ? raw.tag : null,
    limit: parseLimit(raw.limit),
  };
}

/**
 * The catalog is public and immutable-until-published, so it may be held by any
 * cache — but only briefly, because a publish should reach users in minutes
 * rather than on their next cold start. The images it points at carry a year;
 * this is the one document that has to stay fresh.
 */
function catalogCaching(reply: FastifyReply, revision: number): void {
  reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  reply.header('X-Catalog-Revision', String(revision));
}

export async function routes(app: FastifyInstance): Promise<void> {
  /**
   * The preview pipeline, which is emphatically not read-only.
   *
   * Registered alongside the catalog rather than as its own service because it
   * is the same small amount of JSON handling: the photograph and the finished
   * preview both travel directly between the phone and the bucket on presigned
   * urls, so nothing here is heavier than a row. The *worker* is the separate
   * service — see `src/worker.ts`.
   */
  await app.register(previewRoutes);

  /**
   * Accounts, credits, and the RevenueCat webhook.
   *
   * Registered before the previews it gates rather than after, purely so the
   * reading order matches the user's: a generation is refused for want of a
   * credit, and this is where a credit comes from.
   */
  await app.register(accountRoutes);

  /**
   * Buying credits on the web, and Stripe telling us that somebody did.
   *
   * Two registrations rather than one, and the split is mechanical: the webhook
   * needs its body as raw bytes to verify a signature over them, and a
   * content-type parser applies to the plugin scope it is declared in. Putting
   * the webhook in with the JSON routes would parse the body before the
   * signature could be checked against it — which fails closed, loudly, on the
   * first delivery, but only after a deploy.
   */
  await app.register(checkoutRoutes);
  await app.register(stripeWebhookRoutes);

  /**
   * Sharing, the referral links it mints and the landing page they open.
   *
   * Registered here for the same reason the previews are: it is the same small
   * amount of JSON, plus one HTML document, and none of it touches storage or
   * the worker. A share is a hairstyle id and a code — the picture stays on the
   * phone that made it.
   */
  await app.register(shareRoutes);

  /**
   * The Privacy Policy and the Terms of Use, as public pages.
   *
   * They are here rather than in a marketing site because both store consoles
   * require a url that resolves today, and this deployment is the only thing
   * this repository actually serves. Two paths each: `/privacy` and `/terms` are
   * the short ones that go on a store listing, and `/legal/privacy` and
   * `/legal/terms` match the routes the app uses for the same documents, so a
   * link copied from one place works in the other.
   *
   * `text/html`, cacheable for an hour — the text changes when somebody edits
   * `src/lib/legal.ts` and redeploys, which is not a thing that happens between
   * two requests.
   */
  for (const document of LEGAL_DOCUMENTS) {
    for (const path of [`/${document.slug}`, `/legal/${document.slug}`]) {
      app.get(path, async (request, reply) => {
        // Named from the request rather than from `SHARE_BASE_URL`: these pages
        // are reachable on whatever origin somebody found them on, and a
        // canonical link pointing at a different host than the one being read is
        // a canonical link that is wrong.
        const proto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? request.protocol;
        const host = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? request.headers.host;
        const origin = env.share.baseUrl ?? `${proto}://${host}`;
        const other = LEGAL_DOCUMENTS.find((entry) => entry.slug !== document.slug) ?? document;

        reply.type('text/html; charset=utf-8').header('Cache-Control', 'public, max-age=3600');
        return legalPage(
          document,
          `${origin}/${document.slug}`,
          `${origin}/${other.slug}`,
          other.title,
        );
      });
    }
  }

  /**
   * Liveness and readiness in one, because Railway asks for one URL.
   *
   * It touches the database on purpose: a process that is up but cannot reach
   * Postgres serves nothing but 500s, and reporting that as healthy is how a bad
   * deploy stays live.
   */
  app.get('/health', async (_request, reply) => {
    try {
      const revision = await currentRevision();
      // Reported rather than asserted: a deployment with no bucket and no
      // generator key is a perfectly healthy catalog API, and the app already
      // knows how to fall back from `previews_unconfigured`.
      //
      // `checkout` is here for the same reason and was added after it cost an
      // hour. `env.ts` reads `process.env` once at module load, so a
      // `STRIPE_SECRET_KEY` added to a `.env` under a running server is not
      // picked up — and the only symptom was the website saying "checkout is not
      // open on this deployment", which is indistinguishable from a key that was
      // never set. `/v1/credits` knows the answer but needs a device header;
      // this is the same fact reachable with one unauthenticated curl.
      return {
        status: 'ok',
        revision,
        previews: !!(storage && env.previews.falKey),
        checkout: stripeConfigured(),
      };
    } catch (error) {
      reply.code(503);
      return { status: 'unavailable', error: error instanceof Error ? error.message : 'database unreachable' };
    }
  });

  /** The whole catalog: metadata, colours, highlights and every render URL. */
  app.get('/v1/catalog', async (request, reply) => {
    if ((request.query as Record<string, unknown>).fresh) invalidateCatalog();
    const catalog = await getCatalog();
    catalogCaching(reply, catalog.revision);
    return catalog;
  });

  /**
   * A filtered slice of the catalog.
   *
   * Returns hairstyles only — no render manifest. A client that wants imagery
   * takes the whole catalog once; this endpoint is for search-as-you-type and
   * for anything that only needs names and ids.
   */
  app.get('/v1/hairstyles', async (request, reply) => {
    const catalog = await getCatalog();
    const query = queryFrom(request.query as Record<string, unknown>);
    catalogCaching(reply, catalog.revision);
    return { hairstyles: filterHairstyles(catalog.hairstyles, query) };
  });

  app.get<{ Params: { id: string } }>('/v1/hairstyles/:id', async (request, reply) => {
    const catalog = await getCatalog();
    const hairstyle = catalog.hairstyles.find((style) => style.id === request.params.id);
    if (!hairstyle) {
      reply.code(404);
      return { error: 'not_found', message: `no hairstyle "${request.params.id}"` };
    }
    catalogCaching(reply, catalog.revision);
    // The renders for this one style, in the same nesting as the full manifest,
    // so a client can install a slice of the index without a second shape.
    return { hairstyle, renders: catalog.renders[hairstyle.id] ?? {} };
  });

  app.get<{ Params: { id: string } }>('/v1/hairstyles/:id/recommendations', async (request, reply) => {
    const catalog = await getCatalog();
    const raw = request.query as Record<string, unknown>;
    const limit = parseLimit(raw.limit) ?? 6;
    catalogCaching(reply, catalog.revision);
    return {
      hairstyles: recommendationsFor(
        catalog.hairstyles,
        request.params.id,
        parseGender(raw.gender),
        limit,
        parseHairType(raw.hairType),
      ),
    };
  });
}
