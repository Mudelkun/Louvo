/**
 * Saved looks, on this machine and nowhere else.
 *
 * This is where the promise in `docs/preview-generation.md` actually lands. A
 * finished preview is **collected**, not merely downloaded: the client writes
 * the bytes into its own storage first, then tells the server, and the server
 * deletes its copy. Download first so nothing is lost, acknowledge second so
 * nothing is kept — after which the only copy in existence is this one, and it
 * stays until its owner deletes it.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * A preview is about two megapixels of JPEG — a few hundred kilobytes. Base64 in
 * `localStorage` would be a third larger again against a 5 MB quota shared with
 * everything else the site stores, so the third saved look would throw
 * `QuotaExceededError` and the failure would land on the one action the whole
 * product exists for. IndexedDB stores the `Blob` itself, has a quota measured
 * in a fraction of the disk, and is the only web storage that does.
 *
 * ## What is stored
 *
 * The generated image, the photograph it was made from, and the catalog ids
 * needed to describe it. The photograph is here because the result page wipes
 * one against the other and a saved look with no "before" is half a look — and
 * because at this point it is a picture the visitor already has, on their own
 * machine, rather than a copy anybody else is holding.
 */

import type { Gender, HairLengthId, HairTypeId } from './contract/catalog';
import { LOOKS_STORE, run as runOn } from './idb';

export interface SavedLook {
  id: string;
  hairstyleId: string;
  hairstyleName: string;
  gender: Gender;
  hairType: HairTypeId | null;
  lengthId: HairLengthId | null;
  createdAt: number;
  /** The finished preview. */
  result: Blob;
  /** The photograph it was generated from, for the before/after wipe. */
  source: Blob | null;
}

/** What a list needs, without pulling every image into memory. */
export type LookSummary = Omit<SavedLook, 'result' | 'source'>;

/**
 * This store's half of the shared connection — see `idb.ts` for why the database
 * is opened in one place.
 */
const run = <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) =>
  runOn<T>(LOOKS_STORE, mode, work);

export const saveLook = (look: SavedLook): Promise<unknown> =>
  run('readwrite', (store) => store.put(look));

export const deleteLook = (id: string): Promise<unknown> =>
  run('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);

export const getLook = (id: string): Promise<SavedLook | null> =>
  run<SavedLook>('readonly', (store) => store.get(id) as IDBRequest<SavedLook>);

/** Every saved look, newest first, with the image blobs left behind. */
export async function listLooks(): Promise<LookSummary[]> {
  const all = await run<SavedLook[]>('readonly', (store) => store.getAll() as IDBRequest<SavedLook[]>);
  return (all ?? [])
    .map(({ result: _result, source: _source, ...summary }) => summary)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

/**
 * Favourited hairstyle ids.
 *
 * `localStorage` rather than IndexedDB, and the difference is the point: this is
 * a short list of catalog ids, not imagery. It is also the one piece of state
 * here that would be worth moving to an account when there is one — a favourite
 * is a preference about the catalog, where a saved look is a picture of
 * somebody's face and should stay on their machine.
 *
 * ## Why it is a store rather than a getter
 *
 * The heart used to live on the style page alone, where there was one of it and
 * `localStorage` could be read on mount and forgotten. It is on every card in
 * the catalogue now, and the same cut is drawn more than once on a page —
 * twice by `<SuggestionShelf>` at two breakpoints, again by the copy that makes
 * its row drift — so a component that keeps its own copy of the answer is a
 * grid that disagrees with itself the moment anything is saved. One cached list,
 * published to whoever is subscribed, is what keeps every heart for one id
 * showing the same thing, and what lets *Cuts you saved* drop a card the moment
 * its heart is switched off.
 *
 * The `storage` event carries the same guarantee across tabs, which is the one
 * place the old per-component read was silently wrong: saving in one tab and
 * looking at the list in another showed the list from before.
 */
const FAVOURITES_KEY = 'luvo.favourites.v1';

/** Stable identity for the server and for a store that cannot be read. */
const NONE: string[] = [];

let cached: string[] | null = null;
const listeners = new Set<() => void>();

function parse(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVOURITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The current list, by reference.
 *
 * The identity is stable until something actually changes, because
 * `useSyncExternalStore` treats a new array as new state and would re-render
 * every card on the page on every read.
 */
export function readFavourites(): string[] {
  if (typeof window === 'undefined') return NONE;
  cached ??= parse();
  return cached;
}

export function writeFavourites(ids: string[]): void {
  cached = ids;
  try {
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids));
  } catch {
    // A blocked store means favourites do not persist. Not worth an error — the
    // list still works for as long as the page is open.
  }
  for (const listener of [...listeners]) listener();
}

/** Save or unsave one cut, and report which it now is. */
export function toggleFavourite(styleId: string): boolean {
  const current = readFavourites();
  const saved = !current.includes(styleId);
  writeFavourites(saved ? [...current, styleId] : current.filter((id) => id !== styleId));
  return saved;
}

/** Re-read after another tab wrote, keeping the identity if nothing moved. */
function refresh(): void {
  const next = parse();
  const current = cached;
  if (current && current.length === next.length && current.every((id, at) => id === next[at])) return;
  cached = next;
  for (const listener of [...listeners]) listener();
}

function onStorage(event: StorageEvent): void {
  // `key` is null when a tab clears the whole store, which counts.
  if (event.key === null || event.key === FAVOURITES_KEY) refresh();
}

export function subscribeFavourites(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}
