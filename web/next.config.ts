import type { NextConfig } from 'next';

/**
 * Deliberately close to empty.
 *
 * Catalog imagery is *not* run through `next/image`, so there is no
 * `remotePatterns` list here to keep in step with the bucket. The renders in R2
 * are already WebP at exactly the size a card draws them (see
 * `docs/catalog-architecture.md` — nothing is resized, because the sources are
 * 512-720px against a card that is about 500 physical pixels on a 3x screen).
 * Re-optimising them would spend server CPU to make them slightly worse, and it
 * would put a rewriting proxy in front of the one thing this product sells.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Pinned, because this app lives inside a repository that has its own
   * lockfile at the root (the Expo app) and a second one here.
   *
   * Turbopack infers a workspace root from whichever lockfile it finds first and
   * picks the repo root, which puts `assets/mannequins/` — 400 MB of PNG — inside
   * the file-watching scope of a build that never reads any of it.
   */
  turbopack: { root: __dirname },

  /**
   * Next 16 writes an `AGENTS.md` (and a `CLAUDE.md` pointing at it) into the
   * project on every `next dev`. This repository already has a hand-written
   * `CLAUDE.md` at its root that is the actual guidance for working in it, and a
   * second, machine-generated one two directories down is noise that reappears
   * after every deletion.
   */
  agentRules: false,

  /**
   * The two marketing pages are gone, and these are the tombstones.
   *
   * `/how-it-works` and `/pricing` were pages *about* a product a visitor is one
   * photograph away from using, and both have been removed — the explanation
   * because the demonstration is better than it, and the pricing page because it
   * put a number in front of somebody before they had seen the thing it was a
   * price for. Neither should 404: they were in the sitemap, so they are indexed,
   * and a permanent redirect is what tells a crawler where the content went.
   *
   * The packs themselves still exist, on `/account`, where somebody who has run
   * out of previews actually needs them.
   */
  async redirects() {
    return [
      { source: '/how-it-works', destination: '/', permanent: true },
      { source: '/pricing', destination: '/account', permanent: true },
    ];
  },
};

export default nextConfig;
