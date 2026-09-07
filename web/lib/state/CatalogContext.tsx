'use client';

/**
 * The catalog, loaded once for the whole site.
 *
 * The counterpart to `CatalogProvider` in the app, and it keeps that provider's
 * two properties. **No component imports a hairstyle list**, and no component
 * contains a hairstyle name, a category name or a hair type name — those are all
 * catalog data, which is the constraint that makes "adding a hairstyle is
 * `npm run catalog:publish`, not a release" true on the web as well as on the
 * phone. And **which source answered is reported**, never hidden: a stale copy
 * shown as though it were live is the one thing the whole client is written not
 * to do.
 *
 * It is one fetch for the entire session. `/v1/catalog` is a single ~45 KB
 * gzipped document carrying every hairstyle, every render url and every mask
 * url, so filtering, searching and the style pages all run against memory. That
 * is why there is no loading state on a category change — there is nothing to
 * load.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, fetchCatalog, type CatalogResult, type CatalogSource } from '../api';
import type { CatalogResponse, Category, HairColor, HairType, Hairstyle } from '../contract/catalog';
import { DEFAULT_HAIR_COLOR_ID } from '../colorGrade';

export interface CatalogValue {
  catalog: CatalogResponse | null;
  source: CatalogSource | null;
  /** True until the first fetch settles, either way. */
  loading: boolean;
  error: ApiError | null;
  reload: () => void;

  /** Conveniences, so a component never reaches into the response shape. */
  hairstyles: Hairstyle[];
  categories: Category[];
  hairTypes: HairType[];
  colors: HairColor[];
  styleById: (id: string) => Hairstyle | null;
  /** The shade renders are graded to. Catalog data, not a constant. */
  defaultColor: HairColor | null;
}

const CatalogContext = createContext<CatalogValue | null>(null);

const EMPTY: Hairstyle[] = [];

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchCatalog()
      .then((next) => {
        if (!live) return;
        setResult(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        setError(caught instanceof ApiError ? caught : ApiError.offline());
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const value = useMemo<CatalogValue>(() => {
    const catalog = result?.catalog ?? null;
    const byId = new Map((catalog?.hairstyles ?? []).map((style) => [style.id, style]));
    return {
      catalog,
      source: result?.source ?? null,
      loading,
      error,
      reload,
      hairstyles: catalog?.hairstyles ?? EMPTY,
      categories: catalog?.categories ?? [],
      hairTypes: catalog?.hairTypes ?? [],
      colors: catalog?.colors ?? [],
      styleById: (id: string) => byId.get(id) ?? null,
      defaultColor: catalog?.colors.find((color) => color.id === DEFAULT_HAIR_COLOR_ID) ?? null,
    };
  }, [result, loading, error, reload]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return value;
}
