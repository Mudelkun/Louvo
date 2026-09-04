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

import { currentRevision, getCatalog, invalidateCatalog } from './catalog.js';
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
   * Liveness and readiness in one, because Railway asks for one URL.
   *
   * It touches the database on purpose: a process that is up but cannot reach
   * Postgres serves nothing but 500s, and reporting that as healthy is how a bad
   * deploy stays live.
   */
  app.get('/health', async (_request, reply) => {
    try {
      const revision = await currentRevision();
      return { status: 'ok', revision };
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
