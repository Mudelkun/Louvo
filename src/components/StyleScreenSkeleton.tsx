import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup, SkeletonLine } from '@/components/Skeleton';
import { HERO_HEIGHT, THUMB_HEIGHT, THUMB_WIDTH } from '@/lib/styleLayout';
import { makeStyles, radii, spacing } from '@/theme/theme';

/**
 * The style screen while the catalog is still on its way, and while a shared
 * link is working out which haircut it points at.
 *
 * Both of those waits end on this exact layout, so this is what stands in for
 * it: the hero card at the height the hero will be (`HERO_HEIGHT`, from the
 * same module the screen measures itself with), the four angle tiles, and the
 * control card that carries the hair-type row. Nothing here is a smaller,
 * quieter version of the screen — it is the screen with its content not yet
 * arrived, which is the only thing a placeholder is allowed to claim.
 *
 * There is no footer button in it. The button is the screen's one action and it
 * is not available yet; a disabled-looking placeholder where a control belongs
 * invites the tap that cannot be answered.
 */
export function StyleScreenSkeleton({ label = 'Loading the style' }: { label?: string }) {
  const styles = useStyles();
  return (
    <SkeletonGroup label={label}>
      <View style={[styles.hero, { height: HERO_HEIGHT }]}>
        {/* The mannequin's own silhouette, at the size it is drawn: a head is
            1.25x as tall as it is wide, bottom-aligned in the card. */}
        <Skeleton width="46%" height="78%" radius={radii.xl} />
      </View>

      <View style={styles.body}>
        {/* The order the screen itself is in: the control card, then the angle
            tiles, then the photo card. A placeholder in a different order is a
            page that rearranges itself as it loads. */}
        <View style={styles.card}>
          <View style={styles.headingRow}>
            <SkeletonLine width={78} height={13} />
            <SkeletonLine width={104} height={11} />
          </View>
          <View style={styles.tileRow}>
            {[0, 1, 2, 3].map((tile) => (
              <Skeleton key={tile} height={44} radius={radii.md} style={styles.tile} />
            ))}
          </View>
        </View>

        <View style={styles.angleRow}>
          {[0, 1, 2, 3].map((tile) => (
            <Skeleton key={tile} width={THUMB_WIDTH} height={THUMB_HEIGHT} radius={radii.md} />
          ))}
        </View>

        <View style={[styles.card, styles.photoCard]}>
          <View style={styles.photoRow}>
            <Skeleton width={52} height={52} radius={radii.md} />
            <View style={styles.photoCopy}>
              <SkeletonLine width="42%" height={12} />
              <SkeletonLine width="88%" height={10} />
            </View>
          </View>
        </View>
      </View>
    </SkeletonGroup>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // The style screen's own `hero`, minus the pager it holds.
  hero: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  angleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  // `<ControlCard>`'s box, and `styles.photoCard`'s below it: the two cards on
  // this screen are the same card.
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `<HairTypeChoice>`'s row: four tiles sharing the width, 44 points tall.
  tileRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  tile: { flex: 1 },
  photoCard: { marginTop: spacing.md, paddingVertical: spacing.lg },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  photoCopy: { flex: 1, gap: spacing.sm },
}));
