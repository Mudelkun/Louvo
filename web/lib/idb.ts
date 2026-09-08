/**
 * The one IndexedDB database this site opens, and why it is one.
 *
 * Two things are kept in a browser here and both of them are imagery: the looks
 * somebody has collected (`looks.ts`) and the photograph they have uploaded but
 * not yet spent a credit on (`pendingPhoto.ts`). A second module calling
 * `indexedDB.open('luvo', …)` on its own would be a second version number
 * racing the first — whichever opened last with a lower version gets
 * `VersionError`, and whichever opened first blocks the upgrade — so the
 * connection, the version and the upgrade path live here and nowhere else.
 *
 * **Adding a store is a version bump plus a branch in `upgrade`.** The branches
 * are written as `contains` checks rather than as a migration ladder because
 * every store here is created empty and none of them has ever needed its shape
 * changed: a browser arriving from v1 gets the store it is missing, and a fresh
 * one gets both.
 *
 * Every failure resolves to `null` rather than rejecting. A private window with
 * storage turned off is a visitor who can still browse, still generate and still
 * download — just not keep a gallery or survive a full page load with a
 * photograph in hand. Callers treat `null` as "nothing stored", which is true.
 */

const DB_NAME = 'luvo';

/** v1: `looks`. v2: `photo`, for the upload that outlives a page load. */
const DB_VERSION = 2;

export const LOOKS_STORE = 'looks';
export const PHOTO_STORE = 'photo';

let opening: Promise<IDBDatabase | null> | null = null;

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(LOOKS_STORE)) {
    const store = db.createObjectStore(LOOKS_STORE, { keyPath: 'id' });
    store.createIndex('createdAt', 'createdAt');
  }
  if (!db.objectStoreNames.contains(PHOTO_STORE)) {
    db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
  }
}

export function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

export function run<T>(
  name: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        const transaction = db.transaction(name, mode);
        const request = work(transaction.objectStore(name));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      }),
  );
}
