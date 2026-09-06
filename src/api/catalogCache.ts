/**
 * The catalog, kept on the device between launches.
 *
 * Two jobs, and the second is the one that justifies the file:
 *
 * 1. **A cold start does not wait on the network.** The cached catalog is
 *    returned immediately and the fetch runs behind it, so the browse grid is
 *    populated at the same moment it used to be when the catalog was compiled
 *    in.
 * 2. **An offline launch is not an empty app.** This is the cost the storage
 *    decision accepted (docs/catalog-architecture.md): a bundled catalog cannot
 *    fail to load. What we can do instead is make failure mean "the catalog you
 *    had last time" rather than "no catalog". The imagery it points at is in the
 *    platform image cache for the same reason, and both are immutable, so a
 *    stale catalog and stale images agree with each other.
 *
 * Only the metadata is stored here. Images are the platform's business — they
 * are content-addressed URLs with a year of `Cache-Control`, which is a better
 * cache than anything this file could keep.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Catalog } from './types';

/**
 * Bumped when the *shape* of `Catalog` changes in a way an old cached copy
 * would break on. Not the catalog's own `revision`, which is content: this is
 * the reader's version, and a mismatch discards rather than migrates.
 */
const SCHEMA = 2;

const KEY = `luvo.catalog.v${SCHEMA}`;

interface Entry {
  schema: number;
  /** When it was written, so a caller can decide how much it trusts it. */
  fetchedAt: number;
  catalog: Catalog;
}

export interface CachedCatalog {
  catalog: Catalog;
  fetchedAt: number;
}

export async function readCachedCatalog(): Promise<CachedCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    // A stored catalog from an older shape is dropped rather than repaired: it
    // is one network request away from being replaced, and a half-understood
    // catalog is how a wrong hairstyle reaches a screen.
    if (entry?.schema !== SCHEMA || !entry.catalog?.hairstyles?.length) return null;
    return { catalog: entry.catalog, fetchedAt: entry.fetchedAt };
  } catch {
    return null;
  }
}

export async function writeCachedCatalog(catalog: Catalog): Promise<void> {
  try {
    const entry: Entry = { schema: SCHEMA, fetchedAt: Date.now(), catalog };
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // A cache that could not be written is a slower next launch, never a broken
    // one. Nothing upstream should have to handle it.
  }
}

export async function clearCachedCatalog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
