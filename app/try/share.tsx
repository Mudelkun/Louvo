import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { createShareLink, shareLinksConfigured, type ShareLink } from '@/api/share';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/Feedback';
import { Skeleton, SkeletonGroup } from '@/components/Skeleton';
import { CARD_WIDTH, ShareCard, SharePreviewCard, cardAspect } from '@/components/ShareCard';
import { Header, Screen } from '@/components/Screen';
import { useLookColor } from '@/hooks/useHairColor';
import { useLookDownload } from '@/hooks/useLookDownload';
import { track } from '@/lib/analytics';
import { DEMO_PHOTO } from '@/lib/constants';
import { textureFor, variantCandidates } from '@/lib/hairTypes';
import { photoPixelSize } from '@/lib/imageData';
import { captureShareCard } from '@/lib/shareImage';
import { SHARE_CHANNELS, shareTo, type ShareChannelId } from '@/lib/shareTargets';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
/** The on-screen preview. Wide enough to be the subject, short enough to leave the row above the fold. */
const PREVIEW_WIDTH = Math.min(width - spacing.xl * 2, 260);

/**
 * Sharing a finished look.
 *
 * The screen this feature is actually for, and the thing it is trying to be is
 * worth stating before the code: **every shared result should work as a small
 * advertisement without the sharer feeling like they posted an ad.** Those two
 * pull against each other and almost everything here is a consequence of the
 * balance.
 *
 * - **The image is composed, not raw.** `<ShareCard>` puts one line of branding
 *   along the bottom of the preview — a wordmark and the cut's name, over the
 *   gradient that was already making the bottom edge readable. It is mounted
 *   off-screen at capture size and photographed by `react-native-view-shot`; the
 *   copy the user sees above the buttons is the same component scaled, so the
 *   preview is genuinely what gets sent. Why a view capture rather than a server
 *   composite is in `src/lib/shareImage.ts`, and the short version is that the
 *   preview lives on this phone and is not going to be uploaded again to have a
 *   word written on it.
 * - **The caption carries the link.** That is the referral loop: the image gets
 *   attention, the caption tells a stranger what to do about it. It is minted by
 *   the backend so it can be counted, and it falls back to local copy with no
 *   backend rather than blocking the share.
 * - **The buttons are the OS, not an imitation of it.** Instagram, WhatsApp and
 *   Facebook open the system share sheet, which is the only route a managed Expo
 *   app has to those three and is where they actually live. `shareTargets.ts`
 *   has the full argument, including what the URL schemes that look like a
 *   shortcut really do.
 *
 * ## What the user waits for, and what they do not
 *
 * The card capture and the link mint are started as soon as the screen opens and
 * are `Promise`s the buttons `await`, not state the buttons are gated on. So the
 * common case — a user who spends two seconds looking at their picture before
 * tapping — has nothing to wait for at all, and the impatient case waits for the
 * one thing that is genuinely required rather than for both.
 *
 * Neither failure stops a share. A card that could not be composed sends the raw
 * preview; a link that could not be minted sends the caption without one. Both
 * are recorded as `share_failed` and neither is an error the user has to read.
 */
export default function ShareScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { look, gender: sessionGender } = useSession();
  const { styleById } = useCatalog();
  const { saveLook } = useLibrary();
  const color = useLookColor(look);

  const hairstyle = styleById(look?.hairstyleId);
  const gender = look?.gender ?? sessionGender;

  /** The off-screen copy, at capture size. Never seen; only photographed. */
  const cardRef = useRef<View>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [busy, setBusy] = useState<ShareChannelId | null>(null);
  const [sent, setSent] = useState<ShareChannelId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * The composed card, once it exists, so Save writes the *branded* image.
   *
   * The one thing on this screen that genuinely needs the capture in state
   * rather than in a promise. "Save the image" under a preview captioned "this
   * is exactly what gets sent" has to save that image — and on iOS it is not a
   * convenience: posting a Story goes through the camera roll, so this is the
   * file that ends up on Instagram. It falls back to the raw preview, which is
   * what Save has always done and is still a correct save.
   */
  const [cardUri, setCardUri] = useState<string | null>(null);

  /**
   * The composed card and the referral link, each started once.
   *
   * Refs rather than state because nothing on screen depends on them being
   * ready: they are awaited at the moment of the share and the buttons are live
   * immediately. Keeping them out of state also keeps a finished capture from
   * re-rendering the card that produced it.
   */
  const capture = useRef<Promise<{ uri: string } | null> | null>(null);
  const link = useRef<Promise<ShareLink> | null>(null);

  /**
   * The card's shape, from the preview's own.
   *
   * Measured rather than assumed, for the reason `TRY_ON_IMAGE_SIZE` exists: the
   * generator returns the photograph's shape, and a card that forced 4:5 onto a
   * tall selfie would crop the top of the head — which is the haircut. Null
   * until it resolves, so nothing is captured at a shape that is about to
   * change.
   */
  useEffect(() => {
    let active = true;
    const uri = look?.resultUri;
    if (!uri || uri === DEMO_PHOTO) {
      setAspect(cardAspect(null));
      return;
    }
    photoPixelSize(uri).then((size) => {
      if (active) setAspect(cardAspect(size));
    });
    return () => {
      active = false;
    };
  }, [look?.resultUri]);

  /**
   * Both slow things, started the moment the screen has what it needs.
   *
   * The capture waits on `aspect` because capturing at the wrong shape produces
   * a card the preview does not match. The mint waits on nothing.
   */
  useEffect(() => {
    if (!look || !hairstyle) return;
    track('share_opened', { props: { hairstyleId: look.hairstyleId, simulated: look.simulated } });
    link.current ??= createShareLink(look);
  }, [look, hairstyle]);

  useEffect(() => {
    if (aspect === null || capture.current) return;
    // One frame of grace: the card mounts in the same commit that sets `aspect`,
    // and `captureRef` on a view whose image has not painted yet returns the
    // placeholder. `requestAnimationFrame` is the cheapest way to be after it.
    capture.current = new Promise((resolve) => {
      requestAnimationFrame(() => {
        void captureShareCard(cardRef, aspect).then((card) => {
          setCardUri(card?.uri ?? null);
          resolve(card);
        });
      });
    });
  }, [aspect]);

  const download = useLookDownload(cardUri ?? look?.resultUri);

  const send = useCallback(
    async (channel: ShareChannelId) => {
      if (!look || busy) return;
      setBusy(channel);
      setNotice(null);

      const [card, minted] = await Promise.all([
        capture.current ?? Promise.resolve(null),
        link.current ?? createShareLink(look, { channel }),
      ]);

      // Recorded here rather than on the press, because the code is what makes
      // it useful: the server puts the channel onto the link itself, so "which
      // app was this share sent to" is a column rather than a join. The events
      // are buffered anyway, so waiting for the mint costs the user nothing.
      track('share_channel_selected', { channel, code: minted.code });

      if (!card) track('share_failed', { channel, props: { at: 'compose' } });
      // A local link on a build with no API is the expected outcome, not a
      // failure. A local link on a build that *has* one means the mint failed,
      // and the share is about to go out with no way to attribute it.
      if (minted.source === 'local' && shareLinksConfigured()) {
        track('share_failed', { channel, props: { at: 'mint' } });
      }

      track('share_initiated', { channel, code: minted.code });

      const outcome = await shareTo(channel, {
        // The composed card when there is one, the preview itself when there is
        // not. A share with no branding is a worse advertisement and a perfectly
        // good share; a share that failed because the branding failed is neither.
        imageUri: card?.uri ?? (look.resultUri && look.resultUri !== DEMO_PHOTO ? look.resultUri : null),
        caption: minted.caption,
        url: minted.url,
        title: minted.title,
      });

      setBusy(null);

      if (outcome.status === 'shared') {
        setSent(channel);
        // The look is written to the library on a successful share as well as on
        // Done: somebody who shares and then closes the app has finished with
        // this look in every sense except the one that saves it.
        saveLook(look);
        track('share_completed', { channel, code: minted.code, props: { activity: outcome.activity ?? null } });
        if (outcome.captionCopied) {
          setNotice('Caption and link copied — paste them with your post.');
        }
        return;
      }

      if (outcome.status === 'dismissed') {
        track('share_dismissed', { channel, code: minted.code });
        return;
      }

      setNotice(outcome.message ?? 'That did not go through. Try another app.');
      track('share_failed', { channel, code: minted.code, props: { at: 'handoff', status: outcome.status } });
    },
    [busy, look, saveLook],
  );

  const demo = useMemo(
    () =>
      hairstyle
        ? {
            styleId: hairstyle.id,
            shape: { ...hairstyle.shape, texture: textureFor(hairstyle, look?.hairType ?? null) },
            color,
            gender,
            variants: variantCandidates(hairstyle, look?.hairType ?? null),
          }
        : undefined,
    [hairstyle, look?.hairType, color, gender],
  );

  if (!look || !hairstyle) {
    return (
      <Screen>
        <Header title="Share" />
        <EmptyState icon="share-social-outline" title="Nothing to share yet" body="Generate a look first." />
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      footer={
        <Button
          label="Done"
          variant="secondary"
          onPress={() => {
            saveLook(look);
            router.back();
          }}
        />
      }
    >
      <Header title="Share your look" />

      <View style={styles.stage}>
        {aspect === null ? (
          // The card at the size it will be, waiting on the one thing that is
          // not known yet — the photograph's aspect. A spinner in the middle of
          // a grey box says less than the box does.
          <SkeletonGroup label="Preparing your share card">
            <Skeleton
              width={PREVIEW_WIDTH}
              height={PREVIEW_WIDTH / 0.8}
              radius={radii.lg}
              style={styles.placeholder}
            />
          </SkeletonGroup>
        ) : (
          <SharePreviewCard
            width={PREVIEW_WIDTH}
            uri={look.resultUri}
            hairstyleName={hairstyle.name}
            aspect={aspect}
            demo={demo}
          />
        )}
        <Text style={[type.caption, { color: colors.muted, marginTop: spacing.md }]}>
          This is exactly what gets sent.
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={styles.row}>
          {SHARE_CHANNELS.map((channel) => {
            const isSent = sent === channel.id;
            const isBusy = busy === channel.id;
            return (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                accessibilityLabel={`Share to ${channel.label}`}
                accessibilityState={{ disabled: busy !== null, busy: isBusy }}
                onPress={() => void send(channel.id)}
                disabled={busy !== null}
                style={({ pressed }) => [
                  styles.channel,
                  pressed && { backgroundColor: colors.surfaceAlt },
                  busy !== null && !isBusy && { opacity: 0.45 },
                ]}
              >
                <View
                  style={[
                    styles.channelIcon,
                    { backgroundColor: channel.tint ? `${channel.tint}1A` : colors.surfaceAlt },
                  ]}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color={channel.tint ?? colors.inkSoft} />
                  ) : (
                    <Ionicons
                      name={isSent ? 'checkmark' : channel.icon}
                      size={22}
                      color={isSent ? colors.jade : channel.tint ?? colors.inkSoft}
                    />
                  )}
                </View>
                <Text
                  style={[type.caption, { color: isSent ? colors.jade : colors.inkSoft, fontWeight: '700' }]}
                  numberOfLines={1}
                >
                  {isSent ? 'Shared' : channel.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* One line, and it is doing real work: it is the difference between a
            button that lied and a button that took a shortcut. The sheet is
            where these three apps live on both platforms — see the argument in
            `shareTargets.ts` — and saying so is what keeps the row honest. */}
        <Text style={[type.caption, styles.hint]}>
          Your phone&rsquo;s share sheet opens with the picture and the caption ready to go.
        </Text>

        {notice ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={colors.accentInk} />
            <Text style={[type.caption, { color: colors.accentInk, flex: 1 }]}>{notice}</Text>
          </View>
        ) : null}

        {/* Saving is kept and demoted, on purpose. It is not a social share and
            the brief is right that it does not belong in the row — but posting a
            Story on iOS genuinely goes through the camera roll, so removing it
            outright would break the one path Instagram makes people take. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save the image to your photos"
          onPress={download.download}
          style={({ pressed }) => [styles.save, pressed && { backgroundColor: colors.surfaceAlt }]}
        >
          <Ionicons
            name={download.status === 'done' ? 'checkmark-circle' : 'download-outline'}
            size={17}
            color={download.status === 'done' ? colors.jade : colors.inkSoft}
          />
          <Text style={[type.caption, { color: download.status === 'done' ? colors.jade : colors.inkSoft, fontWeight: '700' }]}>
            {download.status === 'done' ? 'Saved to photos' : download.status === 'busy' ? 'Saving…' : 'Save the image'}
          </Text>
        </Pressable>
      </View>

      {/*
        The capture original.
        Mounted at `CARD_WIDTH` and pushed off the bottom of the window rather
        than hidden: `display: none`, zero opacity and `collapsable` all produce
        a blank or missing capture on one platform or another, because a view
        that is not being drawn has nothing to photograph. Off-screen is the one
        state where it is genuinely rendered and genuinely invisible.
      */}
      {aspect === null ? null : (
        <View style={styles.offscreen} pointerEvents="none" aria-hidden>
          <View ref={cardRef} collapsable={false}>
            <ShareCard uri={look.resultUri} hairstyleName={hairstyle.name} aspect={aspect} demo={demo} />
          </View>
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  stage: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xl },
  // The share card's box while its aspect is being measured. It keeps its own
  // radius; the block inside it supplies the ground.
  placeholder: { borderRadius: radii.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  channel: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  channelIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.lg },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  offscreen: {
    position: 'absolute',
    left: 0,
    // Far enough down that no window height reaches it, and `left: 0` rather
    // than a negative x so the card is laid out at its true width on every
    // platform — a view-shot of a partly off-screen view clips on Android.
    top: 5000,
    width: CARD_WIDTH,
  },
}));
