import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { BeforeAfter } from '@/components/BeforeAfter';
import { Button } from '@/components/Button';
import { ChoiceRow } from '@/components/Controls';
import { EmptyState, Pill } from '@/components/Feedback';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { useLookColor } from '@/hooks/useHairColor';
import { BASE_HAIR_COLOR, DEMO_BASE_SHAPE } from '@/lib/constants';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const STAGE_WIDTH = width - spacing.xl * 2;

const MODES = [
  { id: 'slider', label: 'Slider' },
  { id: 'split', label: 'Side by side' },
];

export default function CompareScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { look, gender: sessionGender } = useSession();
  const { styleById } = useCatalog();
  // "Before" is the hair the subject walked in with, so it stays the neutral
  // shade however the picker has been set since.
  const color = useLookColor(look);
  // Both mannequins belong to the look, so they are drawn for the gender it was
  // generated for rather than whatever the session is set to now.
  const gender = look?.gender ?? sessionGender;
  const { saveLook, savedLooks } = useLibrary();
  const [mode, setMode] = useState('slider');

  const hairstyle = styleById(look?.hairstyleId);

  if (!look || !hairstyle) {
    return (
      <Screen>
        <Header title="Compare" />
        <EmptyState
          icon="git-compare-outline"
          title="Nothing to compare yet"
          body="Generate a look first and you can put it next to your original photo."
          actionLabel="Start a try-on"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const saved = savedLooks.some((entry) => entry.id === look.id);

  return (
    <Screen
      padded={false}
      footer={
        <Button
          label={saved ? 'Saved to your looks' : 'Save this comparison'}
          icon={saved ? 'checkmark' : 'bookmark-outline'}
          disabled={saved}
          onPress={() => saveLook(look)}
        />
      }
    >
      <Header title="Before / after" />

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingTop: spacing.lg }}>
        <ChoiceRow options={MODES} value={mode} onChange={setMode} />

        {mode === 'slider' ? (
          /* Washes only on a simulated look, exactly as the side-by-side mode
             below and `result.tsx` do it. On a real preview both sides are shown
             as they are: the wash was there to make an unchanged photograph look
             changed, and on a photograph that did change it is a colour cast
             over the hair the user came here to look at. */
          <BeforeAfter
            beforeUri={look.sourcePhotoUri}
            afterUri={look.resultUri}
            height={STAGE_WIDTH * 1.24}
            beforeTint={look.simulated ? 'rgba(24,21,19,0.06)' : null}
            afterTint={look.simulated ? 'rgba(255,90,60,0.08)' : null}
            beforeDemo={{ shape: DEMO_BASE_SHAPE, color: BASE_HAIR_COLOR, gender }}
            afterDemo={{ shape: hairstyle.shape, color, gender }}
          />
        ) : (
          <View style={styles.splitRow}>
            <Column
              label="Before"
              uri={look.sourcePhotoUri}
              demo={{ shape: DEMO_BASE_SHAPE, color: BASE_HAIR_COLOR, gender }}
            />
            {/* No tint on a generated look. The warm wash was the simulation's
                way of marking a photo as "changed" when nothing about it had
                changed — which, on a real preview, both misrepresents the result
                and disguises a simulated one as an edit. `result.tsx` dropped it
                for the same reason. */}
            <Column
              label="After"
              uri={look.resultUri}
              tint={look.simulated ? 'rgba(255,90,60,0.08)' : undefined}
              demo={{ styleId: hairstyle.id, shape: hairstyle.shape, color, gender }}
            />
          </View>
        )}

        <Text style={[type.caption, { color: colors.muted, textAlign: 'center' }]}>
          {mode === 'slider'
            ? 'Drag the handle to wipe between your original photo and the new look.'
            : hairstyle.name}
        </Text>

        {/* An identical before and after has two completely different causes —
            the model declined to change the hair, or nothing was generated at
            all — and this screen is exactly where someone goes to find that out.
            Saying which is the difference between a prompt problem and a wiring
            problem. */}
        {look.simulated ? (
          <View style={styles.noticeRow}>
            <Pill tone="rust" label="Not generated" />
            <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
              Both sides are your original photo. This look was simulated, so there is nothing to
              compare yet — see Settings for whether the generator is live.
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function Column({
  label,
  uri,
  tint,
  demo,
}: {
  label: string;
  uri: string | null;
  tint?: string;
  demo: React.ComponentProps<typeof PhotoFrame>['demo'];
}) {
  const colors = useColors();
  const columnWidth = (STAGE_WIDTH - spacing.md) / 2;
  return (
    <View style={{ gap: spacing.sm }}>
      <PhotoFrame
        uri={uri}
        tint={tint}
        rounded={radii.lg}
        style={{ width: columnWidth, height: columnWidth * 1.3 }}
        demo={demo}
        demoWidth={columnWidth * 1.15}
        emptyLabel={label}
      />
      <Text style={[type.label, { color: colors.inkSoft, textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  splitRow: { flexDirection: 'row', gap: spacing.md },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
}));
