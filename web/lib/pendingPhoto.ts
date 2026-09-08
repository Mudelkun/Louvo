/**
 * The photograph somebody has chosen but not yet spent a credit on, kept across
 * a page load.
 *
 * ## The bug this exists for
 *
 * A `PreparedPhoto` is a blob and an object url, and both are facts about **one
 * document**. Every navigation inside the site is a client-side one, so the
 * session survives them and this was never needed — until the two trips that are
 * not: signing in through a provider that comes back as a fresh page load, and
 * paying at Stripe's own domain. Both are entered *from the generate button*, by
 * somebody who has already chosen their picture, and both used to hand them back
 * a page with the photograph silently gone. Asking somebody to find the same
 * photograph again because we sent them to sign in is charging them for our own
 * round trip, and it lands at the exact moment they have just agreed to make an
 * account.
 *
 * ## Why it is allowed to be stored at all
 *
 * `SessionContext` says the photograph is never persisted, and the reason is
 * good: a face parked in browser storage on a shared laptop is a copy nobody
 * asked for. This is that rule with a bound on it rather than an exception to
 * it, and the bound is what makes it honest:
 *
 * - **It mirrors the session and nothing more.** One record, replaced when the
 *   photograph is replaced and deleted when it is cleared. There is never a
 *   second photograph in here, and never one the visitor cannot see on screen.
 * - **It expires.** `TTL_MS` is an hour — long enough for a sign-in, a card
 *   payment and a change of mind, short enough that a laptop left overnight has
 *   nothing in it. A record past its date is deleted on the way past rather than
 *   handed back, so the expiry needs no sweeper and no clock of its own.
 * - **It is the weaker copy of a promise the gallery already makes.** A *saved
 *   look* stores this same photograph in this same database for ever, on purpose
 *   (`looks.ts`). An hour of a picture the visitor is looking at is not a new
 *   category of thing.
 *
 * What is deliberately **not** done is uploading it earlier to survive the trip.
 * The photograph reaches a bucket when a job exists to consume it and is deleted
 * when that job settles; parking it on a server against a sign-in that may never
 * happen would trade a documented promise for a convenience.
 */

import { PHOTO_STORE, run } from './idb';
import type { PreparedPhoto } from './photo';

/** One record, so a second photograph replaces the first rather than joining it. */
const ID = 'pending';

/** See the header. An hour covers the round trips this exists for. */
const TTL_MS = 60 * 60 * 1000;

interface Stored {
  id: typeof ID;
  blob: Blob;
  width: number;
  height: number;
  storedAt: number;
}

/**
 * Everything but the object url, which is the one part that cannot be stored: a
 * `blob:` url is a handle the document holds, and it dies with the document.
 * `read()` mints a fresh one from the bytes.
 */
export function savePendingPhoto(photo: PreparedPhoto): void {
  void run<IDBValidKey>(PHOTO_STORE, 'readwrite', (store) =>
    store.put({
      id: ID,
      blob: photo.blob,
      width: photo.width,
      height: photo.height,
      storedAt: Date.now(),
    } satisfies Stored),
  );
}

export function clearPendingPhoto(): void {
  void run(PHOTO_STORE, 'readwrite', (store) => store.delete(ID) as unknown as IDBRequest<undefined>);
}

/**
 * The stored photograph as something the session can hold, or `null`.
 *
 * The caller owns the object url this mints, exactly as it owns the one
 * `preparePhoto` mints — `setPhoto` revokes whichever it replaces.
 */
export async function readPendingPhoto(): Promise<PreparedPhoto | null> {
  const stored = await run<Stored>(PHOTO_STORE, 'readonly', (store) => store.get(ID) as IDBRequest<Stored>);
  if (!stored?.blob) return null;

  if (Date.now() - stored.storedAt > TTL_MS) {
    clearPendingPhoto();
    return null;
  }

  return {
    blob: stored.blob,
    width: stored.width,
    height: stored.height,
    objectUrl: URL.createObjectURL(stored.blob),
  };
}
