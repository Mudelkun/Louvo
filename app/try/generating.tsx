import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { GENERATION_STEPS } from '@/api/client';
import type { GeneratedLook } from '@/api/types';
import { Button } from '@/components/Button';
import { FactTicker, ScanningPhoto, STAGE_WORDS, useEta, WordTicker } from '@/components/GenerationStage';
import { MannequinBadge } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { useSmoothProgress } from '@/components/ProgressRing';
import { useHairColorById } from '@/hooks/useHairColor';
import { textureFor, variantCandidates } from '@/lib/hairTypes';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const { width, height } = Dimensions.get('window');
const STAGE_WIDTH = width - spacing.xl * 2;
// The checklist used to sit under this; with it gone the photo takes the room.
const STAGE_HEIGHT = Math.min(STAGE_WIDTH * 1.24, height * 0.5);

/** How long the finished state is held before the result opens. */
const REVEAL_BEAT_MS = 750;
/** Grace for the job to appear in state before this screen gives up on it. */
const ADOPT_GRACE_MS = 1500;

/**
 * The wait.
 *
 * Generation used to drop the user on Profile the instant they pressed
 * Generate, where the preview was a two-inch tile with a percentage on it.
 * Nothing about that asked to be watched — the payoff was not on screen, the
 * bar froze between polls, and "Processing…" was the whole of what the app had
 * to say — so leaving was the obvious move, and a user who leaves mid-flow is a
 * user who comes back to a grid of thumbnails instead of to their own face.
 *
 * This screen is the same job with the payoff in front of the user: their photo
 * at full size, being worked on, inside a frame that closes as the work lands.
 * It is deliberately not a trap. Both exits are in the footer, the job is
 * unaffected by taking either, and the tile on Profile still tracks it — the
 * screen has to earn the wait rather than enforce it.
 */
export default function GeneratingScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { job: jobId } = useLocalSearchParams<{ job?: string }>();
  const { jobs, cancel, retry, notification, dismissNotification } = useGeneration();
  const { styleById, hairTypes } = useCatalog();
  const { setLook } = useSession();

  const job = jobs.find((entry) => entry.id === jobId) ?? null;

  /**
   * The finished look, held locally for one beat.
   *
   * Claimed off `notification` — and dismissed there immediately, because the
   * banner exists to call a user back from elsewhere in the app and this user
   * is already watching. The beat is so the ring closes and the last row ticks
   * before the result slides in; cutting straight over at 96% reads as the app
   * skipping the ending it just spent thirty seconds building.
   */
  const [finished, setFinished] = useState<GeneratedLook | null>(null);
  /** Whether this screen's job was ever in flight — see the adoption effect. */
  const seen = useRef(false);
  /**
   * Set before cancelling, and the reason it is a ref rather than state.
   *
   * Cancelling drops the job from `jobs`, which is the same shape as finishing;
   * the only thing separating them is a `notification`, and one may still be
   * sitting there unacknowledged from an earlier look. Without this the screen
   * can claim that stale look on its way out and open somebody else's result
   * instead of going back. It has to be readable in the render that happens
   * between the cancel and the navigation, which state would be too late for.
   */
  const abandoned = useRef(false);

  useEffect(() => {
    if (job) seen.current = true;
  }, [job]);

  useEffect(() => {
    if (finished || job || !notification || abandoned.current) return;
    setFinished(notification);
    dismissNotification();
  }, [finished, job, notification, dismissNotification]);

  /** Cancel and leave, without the exit being mistaken for a completion. */
  const abandon = (id: string) => {
    abandoned.current = true;
    cancel(id);
    router.back();
  };

  /**
   * What is being made: the job while it runs, the finished look once it lands.
   *
   * A completing job leaves `jobs` in the same tick the look arrives, so
   * reading the style off the job alone would blank the title, the mannequin
   * and the shade for the length of the reveal beat — the app dropping the
   * name of the thing at the exact moment it presents it. The two carry the
   * same fields, so one expression covers both.
   */
  const source = job ?? finished;
  const hairstyle = styleById(source?.hairstyleId);
  const color = useHairColorById(source?.options.color);

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => {
      setLook(finished);
      router.replace('/try/result');
    }, REVEAL_BEAT_MS);
    return () => clearTimeout(timer);
  }, [finished, setLook, router]);

  /**
   * Nothing to wait for.
   *
   * The job is started by the style screen and this screen is pushed straight
   * after, so a missing job is either a cancel from somewhere else or a stale
   * route — but the two state updates are not guaranteed to have landed by the
   * time this mounts, so it waits a moment before deciding.
   */
  useEffect(() => {
    if (job || finished || notification || abandoned.current) return;
    const timer = setTimeout(() => {
      if (!seen.current && !abandoned.current) router.replace('/(tabs)/profile');
    }, ADOPT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [job, finished, notification, router]);

  const progress = finished ? 1 : job?.progress ?? 0;
  const { percent } = useSmoothProgress(progress);
  // The job's own start time, held so the estimate keeps one baseline: reading
  // the clock in render would hand `useEta` a new "start" on every frame and
  // reset the countdown it exists to keep monotonic.
  const mountedAt = useRef(Date.now()).current;
  const eta = useEta(progress, job?.createdAt ?? mountedAt);
  const stepIndex = finished ? GENERATION_STEPS.length : job?.stepIndex ?? 0;
  const failed = job?.status === 'failed';

  /**
   * Waiting for a slot rather than being worked on.
   *
   * The generator's account has a small concurrency limit, so a busy minute is a
   * real queue and the backend reports the position in it. While that is true
   * the countdown is suppressed: `useEta` estimates from progress, and progress
   * genuinely is not moving, so an estimate here would be the one thing this
   * screen is written never to do — invent one. A place in a line is a fact, and
   * it is a better answer than a number that would have to be made up.
   */
  const ahead = !finished && job?.stepIndex === 0 ? (job.queuePosition ?? 0) : 0;

  const hairTypeName = hairTypes.find((entry) => entry.id === source?.hairType)?.name ?? null;

  /**
   * The lines the ticker cycles.
   *
   * All of them are catalog facts about the cut being generated, so the time
   * spent reading is still time spent choosing a haircut. Nothing here
   * describes what the generator is doing — the word ticker above has that job,
   * and it is the only part of the screen entitled to claim it.
   */
  const facts = useMemo(() => {
    if (!hairstyle) return [];
    const lines = [hairstyle.description];
    if (hairstyle.bestFor.length) lines.push(`Best for ${hairstyle.bestFor.join(', ').toLowerCase()}.`);
    lines.push(`${hairstyle.maintenance} maintenance.`);
    if (hairTypeName) lines.push(`Rendered for ${hairTypeName.toLowerCase()} hair.`);
    if (hairstyle.tags.length) lines.push(hairstyle.tags.slice(0, 3).join(' · '));
    return lines;
  }, [hairstyle, hairTypeName]);

  if (!job && !finished) {
    return (
      <Screen>
        <Header hideBack />
        <View style={styles.blank}>
          <Text style={[type.body, { color: colors.muted }]}>Looking for your preview…</Text>
        </View>
      </Screen>
    );
  }

  // A failure keeps the user here rather than dropping them into a grid to find
  // out what happened — the retry is one press from where they already are.
  if (failed && job) {
    return (
      <Screen
        footer={
          <View style={{ gap: spacing.md }}>
            <Button label="Try again" icon="refresh" onPress={() => retry(job.id)} />
            <Button label="Back to the style" variant="ghost" onPress={() => abandon(job.id)} />
          </View>
        }
      >
        <Header hideBack />
        <View style={styles.failure}>
          <View style={styles.failureBadge}>
            <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
          </View>
          <Text style={[type.title, { color: colors.ink, textAlign: 'center' }]}>
            That didn’t come back
          </Text>
          <Text style={[type.body, styles.failureBody]}>
            {job.error ?? 'Generation failed'}. Your photo and your choice of {job.hairstyleName} are
            still here — nothing needs redoing.
          </Text>
        </View>
      </Screen>
    );
  }

  const shape = hairstyle
    ? { ...hairstyle.shape, texture: textureFor(hairstyle, source?.hairType ?? null) }
    : null;
  const variants = hairstyle ? variantCandidates(hairstyle, source?.hairType ?? null) : null;
  const styleName = source?.hairstyleName ?? 'your style';

  return (
    <Screen
      padded={false}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label="Keep browsing — I’ll get a nudge"
            icon="grid-outline"
            variant="soft"
            onPress={() => router.replace('/(tabs)/profile')}
          />
          {job ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => abandon(job.id)}
              style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
            >
              <Text style={[type.caption, { color: colors.muted, fontWeight: '700' }]}>
                Cancel this preview
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <Header hideBack />

      <View style={styles.intro}>
        <Text style={[type.title, { color: colors.ink }]}>
          {finished ? 'Your look is ready' : 'Making your look'}
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>
          {finished ? `${styleName}, on your photo.` : `Putting the ${styleName} on your photo.`}
        </Text>
      </View>

      <View style={styles.stage}>
        <ScanningPhoto width={STAGE_WIDTH} height={STAGE_HEIGHT} progress={progress}>
          <PhotoFrame
            uri={finished?.resultUri ?? job?.sourcePhotoUri ?? null}
            rounded={radii.xl}
            style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
            demo={
              shape
                ? {
                    styleId: hairstyle?.id,
                    shape,
                    color,
                    gender: source?.gender,
                    variants,
                  }
                : undefined
            }
            demoWidth={STAGE_HEIGHT * 0.78}
          />
        </ScanningPhoto>

        {/* The cut itself, on the picture it is going onto — the one thing on
            screen that is a preview rather than a status. */}
        {shape ? (
          <View style={styles.styleTag}>
            <MannequinBadge
              styleId={hairstyle?.id}
              shape={shape}
              color={color}
              gender={source?.gender}
              variants={variants}
              size={30}
            />
            <Text style={[type.caption, { color: colors.onDark, fontWeight: '700' }]} numberOfLines={1}>
              {styleName}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.readout}>
        <Text style={[type.display, { color: colors.ink }]}>{finished ? 100 : percent}%</Text>
        <View style={{ flex: 1 }}>
          {finished ? (
            <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
              Done
            </Text>
          ) : (
            // The pool is chosen by the generator's own stage, so the word on
            // screen is always true of what is happening; which word it is, is
            // pacing. See `STAGE_WORDS`.
            <WordTicker words={STAGE_WORDS[Math.min(stepIndex, STAGE_WORDS.length - 1)]} />
          )}
          <Text style={[type.caption, { color: colors.muted }]}>
            {finished
              ? 'Opening it now'
              : ahead > 0
                ? `${ahead} ${ahead === 1 ? 'preview' : 'previews'} ahead of yours`
                : eta}
          </Text>
        </View>
      </View>

      <View style={styles.detail}>
        <FactTicker facts={facts} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  blank: { paddingTop: spacing.xxxl, alignItems: 'center' },
  intro: { paddingHorizontal: spacing.xl, gap: spacing.xs, marginTop: spacing.sm },
  stage: { alignItems: 'center', paddingVertical: spacing.lg },
  styleTag: {
    position: 'absolute',
    left: spacing.xl + spacing.md,
    bottom: spacing.lg + spacing.md,
    maxWidth: STAGE_WIDTH - spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(22,18,31,0.72)',
    borderRadius: radii.pill,
    paddingLeft: 5,
    paddingRight: spacing.md,
    paddingVertical: 5,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  detail: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.xl },
  cancel: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  failure: { paddingTop: spacing.xxxl, alignItems: 'center', gap: spacing.md },
  failureBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  failureBody: { color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.lg },
}));
