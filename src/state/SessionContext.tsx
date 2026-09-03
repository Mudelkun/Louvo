import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { GeneratedLook, Gender, HairTypeId, TryOnOptions } from '@/api/types';
import { DEFAULT_HAIR_COLOR_ID } from '@/lib/constants';

/** Everything the user has chosen during the current try-on run. */
export interface Session {
  photoUri: string | null;
  gender: Gender | null;
  /**
   * The user's hair type, or null for "All Types".
   *
   * Chosen before the catalog is browsed, because it is not a filter laid over
   * the catalog so much as a statement about which catalog the user is looking
   * at: it decides which styles are offered and which render of each one is
   * shown. Like `colorId` it is session-wide rather than per style, so two
   * cards side by side still differ only by their cut.
   */
  hairTypeId: HairTypeId | null;
  categoryId: string | null;
  hairstyleId: string | null;
  /**
   * The hair colour every mannequin is shown in, as a catalog colour id, or null
   * for the shade each render was shot in.
   *
   * Colour sits here rather than on a hairstyle on purpose: it is one choice
   * applied to the whole app at once, so two styles side by side still differ
   * only by their cut. It survives moving between styles, which a per-style
   * setting would not, and it is copied onto a look when one is generated so a
   * saved look keeps the colour it was made in.
   *
   * It starts at `DEFAULT_HAIR_COLOR_ID` rather than at null for the same
   * reason: null means "however each render happens to have been shot", and the
   * catalog is shot in two shades, so it is the one value that lets two cards
   * differ by more than their cut.
   */
  colorId: string | null;
  options: TryOnOptions;
  look: GeneratedLook | null;
}

const emptySession: Session = {
  photoUri: null,
  gender: null,
  hairTypeId: null,
  categoryId: null,
  hairstyleId: null,
  colorId: DEFAULT_HAIR_COLOR_ID,
  options: {},
  look: null,
};

interface SessionState extends Session {
  setPhoto: (uri: string | null) => void;
  setGender: (gender: Gender) => void;
  setHairType: (hairTypeId: HairTypeId | null) => void;
  setCategory: (categoryId: string | null) => void;
  setColor: (colorId: string | null) => void;
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

  // Changing hair type changes which styles exist, so a style chosen under the
  // old type cannot be assumed to survive it.
  const setHairType = useCallback((hairTypeId: HairTypeId | null) => {
    setSession((prev) =>
      prev.hairTypeId === hairTypeId ? prev : { ...prev, hairTypeId, hairstyleId: null, look: null },
    );
  }, []);

  const setCategory = useCallback((categoryId: string | null) => {
    setSession((prev) => ({ ...prev, categoryId }));
  }, []);

  const setColor = useCallback((colorId: string | null) => {
    setSession((prev) => (prev.colorId === colorId ? prev : { ...prev, colorId }));
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
      setHairType,
      setCategory,
      setColor,
      setHairstyle,
      setOptions,
      patchOptions,
      setLook,
      reset,
      restartStyleChoice,
    }),
    [
      session,
      setPhoto,
      setGender,
      setHairType,
      setCategory,
      setColor,
      setHairstyle,
      setOptions,
      patchOptions,
      setLook,
      reset,
      restartStyleChoice,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
