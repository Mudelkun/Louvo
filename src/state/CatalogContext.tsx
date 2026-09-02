import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchCatalog } from '@/api/client';
import type { Catalog, Category, HairColor, HairType, Hairstyle } from '@/api/types';

interface CatalogState {
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  hairstyles: Hairstyle[];
  categories: Category[];
  /** The four hair types, catalog data like everything else. */
  hairTypes: HairType[];
  colors: HairColor[];
  styleById: (id: string | undefined | null) => Hairstyle | undefined;
  categoryById: (id: string | undefined | null) => Category | undefined;
}

const CatalogContext = createContext<CatalogState | null>(null);

/**
 * Loads the hairstyle catalog once at app start and keeps it in memory.
 * Screens never import the mock data directly — they read it from here, so the
 * day this switches to a real network call nothing downstream changes.
 */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchCatalog()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load the catalog');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<CatalogState>(() => {
    const hairstyles = catalog?.hairstyles ?? [];
    const categories = catalog?.categories ?? [];
    return {
      catalog,
      loading,
      error,
      reload,
      hairstyles,
      categories,
      hairTypes: catalog?.hairTypes ?? [],
      colors: catalog?.colors ?? [],
      styleById: (id) => (id ? hairstyles.find((style) => style.id === id) : undefined),
      categoryById: (id) => (id ? categories.find((category) => category.id === id) : undefined),
    };
  }, [catalog, loading, error, reload]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogState {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return context;
}
