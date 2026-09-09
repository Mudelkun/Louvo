/**
 * Share links: minting one, resolving one, and reporting where a device came
 * from.
 *
 * The point of the whole feature is that a shared look is a small advertisement,
 * and an advertisement needs a link somebody can follow. That link is minted by
 * the backend (`server/src/shares.ts`) so it can be counted; what this module
 * adds on top is the thing the rest of this app does everywhere else — **it
 * still works with no backend, and it says which of the two happened.**
 *
 * `shareSource()` reports `api` or `local`, in the same spirit as
 * `catalogSource()` and `generationSource()`:
 *
 * - **`api`** — a real, countable link. It resolves to a landing page that shows
 *   the cut, offers the app to whoever already has it and the store to whoever
 *   does not, and its opens and installs are attributable to the person who
 *   shared it.
 * - **`local`** — no API is configured, so the caption carries
 *   `EXPO_PUBLIC_SHARE_URL` (or nothing at all) instead. The user can still
 *   share their look and nothing in the flow breaks; there is simply no code to
 *   attribute it to, and Settings says so.
 *
 * ## The picture is not in here
 *
 * Nothing in this module uploads an image. A link names a *hairstyle*, and the
 * page it opens shows the catalog's mannequin render of that cut. The preview
 * itself is composed into a share card on the device (`src/lib/shareImage.ts`)
 * and handed to whichever app the user picked by the operating system — it never
 * passes through a Louvo server, which is what keeps the promise
 * `docs/preview-generation.md` makes intact through a feature designed to show
 * the result to strangers.
 */

import { API_BASE_URL, hasApi } from '@/api/client';
import type { GeneratedLook, Gender, HairTypeId } from '@/api/types';
import { deviceHeader } from '@/lib/deviceId';

/**
 * Where a shared link points when there is no backend to mint one.
 *
 * Empty by default and deliberately not a plausible-looking url, for the reason
 * `API_BASE_URL` gives: a default pointing at a page that may not exist turns
 * "no link configured" into "the link is broken", and the second is far worse to
 * be handing to somebody else's friends.
 */
const FALLBACK_SHARE_URL = (process.env.EXPO_PUBLIC_SHARE_URL ?? '').replace(/\/$/, '');

export type ShareSource = 'api' | 'local';

export const shareSource = (): ShareSource => (hasApi() ? 'api' : 'local');

/** Whether a shared link will actually go anywhere on this build. */
export const shareLinksConfigured = (): boolean => hasApi() || FALLBACK_SHARE_URL.length > 0;

export interface ShareLink {
  /** The referral id. Null on the local path, where nothing is countable. */
  code: string | null;
  /** The url that goes in the caption. Empty when this build has nowhere to point. */
  url: string;
  title: string;
  /** The whole message: what the sharer is saying, plus the invitation. */
  caption: string;
  source: ShareSource;
}

/**
 * The caption, written here and also on the server.
 *
 * The one deliberate duplication in this feature, and it earns itself twice.
 * The server's copy is authoritative when there is a server, so the wording of
 * the advertisement can be tuned without shipping an app release — this is the
 * text that decides whether a stranger taps, and it will be rewritten far more
 * often than the binary changes. This copy is what a build with no backend says,
 * and it has to exist because a share with no words is just a photograph.
 *
 * Two sentences. The first is the sharer talking about their own haircut, which
 * is what their friends actually want to look at; the second is the invitation.
 * Longer than that and it reads as a forward rather than as a post — and a post
 * is the only version of this anybody sends twice.
 */
export function captionFor(hairstyleName: string, url: string): string {
  const opening = `Trying the ${hairstyleName} with Louvo ✂️`;
  if (!url) return `${opening}\nWant to see how a haircut looks on you? Try Louvo.`;
  return `${opening}\nWant to see how a haircut looks on you? Try Louvo: ${url}`;
}

const TIMEOUT_MS = 8000;

/**
 * Mints a link for a look, or produces the local stand-in.
 *
 * **Never throws.** A share must not fail because a link could not be minted:
 * the image is the thing the user is trying to send, and a caption without a url
 * is a worse share rather than a broken one. A failure here degrades to the
 * local path and is recorded as a `share_failed` event by the caller.
 *
 * `clientRef` is the look's own id, so pressing Share twice on one result
 * returns one link and counts one share.
 */
export async function createShareLink(
  look: GeneratedLook,
  options: { channel?: string | null } = {},
): Promise<ShareLink> {
  const local: ShareLink = {
    code: null,
    url: FALLBACK_SHARE_URL,
    title: `See yourself with a ${look.hairstyleName} — Louvo`,
    caption: captionFor(look.hairstyleName, FALLBACK_SHARE_URL),
    source: 'local',
  };

  if (!hasApi()) return local;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/v1/shares`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        ...(await deviceHeader()),
      },
      body: JSON.stringify({
        hairstyleId: look.hairstyleId,
        gender: look.gender,
        hairType: look.hairType,
        lengthId: look.options.length ?? null,
        channel: options.channel ?? null,
        clientRef: look.id,
      }),
    });
    if (!response.ok) throw new Error(`POST /v1/shares -> ${response.status}`);
    const payload = (await response.json()) as { share: Omit<ShareLink, 'source'> };
    return { ...payload.share, source: 'api' };
  } catch (error) {
    if (__DEV__) console.warn(`[share] falling back to a local link: ${(error as Error).message}`);
    return local;
  } finally {
    clearTimeout(timer);
  }
}

export interface ResolvedShare {
  code: string;
  hairstyleId: string;
  hairstyleName: string;
  gender: Gender | null;
  hairType: HairTypeId | null;
  imageUrl: string | null;
}

/**
 * What a code points at.
 *
 * Public and unauthenticated on the server, because the app calling this may be
 * thirty seconds old — somebody has just installed it and tapped a friend's
 * link, and it has no device secret yet.
 */
export async function resolveShareLink(code: string): Promise<ResolvedShare | null> {
  if (!hasApi()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/v1/shares/${encodeURIComponent(code)}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { share: ResolvedShare };
    return payload.share;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tells the backend which share brought this device in.
 *
 * Returns whether this was the *first* attribution for the device, which is the
 * only interesting half: it is what makes `share_install_attributed` fire once
 * rather than on every launch that happens to carry a code. First-write-wins and
 * the sharer-opening-their-own-link case are both settled on the server.
 */
export async function reportAttribution(
  code: string,
  source: 'deep_link' | 'referrer' = 'deep_link',
): Promise<{ code: string; first: boolean } | null> {
  if (!hasApi()) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/v1/attribution`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        ...(await deviceHeader()),
      },
      body: JSON.stringify({ code, source }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { attribution: { code: string; first: boolean } | null };
    return payload.attribution;
  } catch {
    return null;
  }
}
