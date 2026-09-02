import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { generateLook, type GenerateRequest } from '@/api/client';
import type { GeneratedLook, LookJob } from '@/api/types';
import { useLibrary } from '@/state/LibraryContext';

interface GenerationState {
  /** Jobs still working or failed. Finished jobs move into the library. */
  jobs: LookJob[];
  /** Convenience for badges. */
  processingCount: number;
  /** The most recently finished look, waiting to be acknowledged. */
  notification: GeneratedLook | null;
  start: (request: GenerateRequest) => string;
  cancel: (jobId: string) => void;
  retry: (jobId: string) => void;
  dismissNotification: () => void;
}

const GenerationContext = createContext<GenerationState | null>(null);

/**
 * Background preview generation.
 *
 * Nothing blocks on a job: `start()` returns immediately, the caller sends the
 * user to My looks, and the tile there tracks `progress`. When the job resolves
 * the look is written into the library and `notification` is raised.
 *
 * TODO(backend): once the API returns a job id, this holds the poll loop and
 * the completion arrives as a real push (expo-notifications) so it lands even
 * with the app backgrounded. The surface below does not change.
 */
export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const { saveLook } = useLibrary();
  const [jobs, setJobs] = useState<LookJob[]>([]);
  const [notification, setNotification] = useState<GeneratedLook | null>(null);

  /** Live cancel handles — a job missing here has been cancelled or has settled. */
  const running = useRef(new Map<string, () => void>());
  /** The request behind each job, kept so a failed job can be retried. */
  const requests = useRef(new Map<string, GenerateRequest>());

  const run = useCallback(
    (jobId: string, request: GenerateRequest) => {
      const job = generateLook(request, ({ progress }) => {
        setJobs((prev) => prev.map((entry) => (entry.id === jobId ? { ...entry, progress } : entry)));
      });
      running.current.set(jobId, job.cancel);

      job.promise
        .then((look) => {
          if (!running.current.has(jobId)) return; // cancelled
          running.current.delete(jobId);
          requests.current.delete(jobId);
          setJobs((prev) => prev.filter((entry) => entry.id !== jobId));
          saveLook(look);
          setNotification(look);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        })
        .catch(() => {
          if (!running.current.has(jobId)) return; // cancelled, not failed
          running.current.delete(jobId);
          setJobs((prev) =>
            prev.map((entry) => (entry.id === jobId ? { ...entry, status: 'failed' } : entry)),
          );
        });
    },
    [saveLook],
  );

  const start = useCallback(
    (request: GenerateRequest) => {
      const jobId = `job_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
      setJobs((prev) => [
        {
          id: jobId,
          hairstyleId: request.hairstyle.id,
          hairstyleName: request.hairstyle.name,
          gender: request.gender,
          hairType: request.hairType,
          sourcePhotoUri: request.photoUri,
          options: request.options,
          createdAt: Date.now(),
          status: 'processing',
          progress: 0,
        },
        ...prev,
      ]);
      requests.current.set(jobId, request);
      run(jobId, request);
      return jobId;
    },
    [run],
  );

  const cancel = useCallback((jobId: string) => {
    running.current.get(jobId)?.();
    running.current.delete(jobId);
    requests.current.delete(jobId);
    setJobs((prev) => prev.filter((entry) => entry.id !== jobId));
  }, []);

  const retry = useCallback(
    (jobId: string) => {
      const request = requests.current.get(jobId);
      if (!request) return;
      setJobs((prev) =>
        prev.map((entry) => (entry.id === jobId ? { ...entry, status: 'processing', progress: 0 } : entry)),
      );
      run(jobId, request);
    },
    [run],
  );

  const dismissNotification = useCallback(() => setNotification(null), []);

  useEffect(() => {
    const handles = running.current;
    return () => {
      handles.forEach((cancelJob) => cancelJob());
      handles.clear();
    };
  }, []);

  const value = useMemo<GenerationState>(
    () => ({
      jobs,
      processingCount: jobs.filter((job) => job.status === 'processing').length,
      notification,
      start,
      cancel,
      retry,
      dismissNotification,
    }),
    [jobs, notification, start, cancel, retry, dismissNotification],
  );

  return <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>;
}

export function useGeneration(): GenerationState {
  const context = useContext(GenerationContext);
  if (!context) throw new Error('useGeneration must be used inside <GenerationProvider>');
  return context;
}
