import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'hairify.onboarded.v1';

type Status = 'unknown' | 'seen' | 'unseen';

/** Tracks whether the welcome screen has already been shown on this device. */
export function useOnboarding() {
  const [status, setStatus] = useState<Status>('unknown');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (active) setStatus(value ? 'seen' : 'unseen');
      })
      .catch(() => {
        if (active) setStatus('seen');
      });
    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback(() => {
    setStatus('seen');
    AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    setStatus('unseen');
    AsyncStorage.removeItem(KEY).catch(() => undefined);
  }, []);

  return { status, complete, reset };
}
