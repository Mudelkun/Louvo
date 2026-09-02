import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { GeneratedLook, Gender, TryOnOptions } from '@/api/types';

/** Everything the user has chosen during the current try-on run. */
export interface Session {
  photoUri: string | null;
  gender: Gender | null;
  categoryId: string | null;
  hairstyleId: string | null;
  options: TryOnOptions;
  look: GeneratedLook | null;
}

const emptySession: Session = {
  photoUri: null,
  gender: null,
  categoryId: null,
  hairstyleId: null,
  options: {},
  look: null,
};

interface SessionState extends Session {
  setPhoto: (uri: string | null) => void;
  setGender: (gender: Gender) => void;
  setCategory: (categoryId: string | null) => void;
  setHairstyle: (hairstyleId: string, options: TryOnOptions) => void;
  setOptions: (options: TryOnOptions) => void;
  patchOptions: (patch: Partial<TryOnOptions>) => void;
  setLook: (look: GeneratedLook | null) => void;
  reset: () => void;
  /** Keeps the photo and gender, clears the style choice — "try another style". */
  restartStyleChoice: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(emptySession);

  const setPhoto = useCallback((photoUri: string | null) => {
    setSession((prev) => ({ ...prev, photoUri }));
  }, []);

  const setGender = useCallback((gender: Gender) => {
    setSession((prev) => (prev.gender === gender ? prev : { ...prev, gender, categoryId: null }));
  }, []);

  const setCategory = useCallback((categoryId: string | null) => {
    setSession((prev) => ({ ...prev, categoryId }));
  }, []);

  const setHairstyle = useCallback((hairstyleId: string, options: TryOnOptions) => {
    setSession((prev) => ({ ...prev, hairstyleId, options, look: null }));
  }, []);

  const setOptions = useCallback((options: TryOnOptions) => {
    setSession((prev) => ({ ...prev, options }));
  }, []);

  const patchOptions = useCallback((patch: Partial<TryOnOptions>) => {
    setSession((prev) => ({ ...prev, options: { ...prev.options, ...patch } }));
  }, []);

  const setLook = useCallback((look: GeneratedLook | null) => {
    setSession((prev) => ({ ...prev, look }));
  }, []);

  const reset = useCallback(() => setSession(emptySession), []);

  const restartStyleChoice = useCallback(() => {
    setSession((prev) => ({ ...prev, hairstyleId: null, options: {}, look: null }));
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      ...session,
      setPhoto,
      setGender,
      setCategory,
      setHairstyle,
      setOptions,
      patchOptions,
      setLook,
      reset,
      restartStyleChoice,
    }),
    [session, setPhoto, setGender, setCategory, setHairstyle, setOptions, patchOptions, setLook, reset, restartStyleChoice],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
