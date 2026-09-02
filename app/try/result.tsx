import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { colorById } from '@/api/client';
import { Button, IconButton } from '@/components/Button';
import { EmptyState, Pill } from '@/components/Feedback';
import { MannequinBadge } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { DEMO_PHOTO } from '@/lib/constants';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, shadow, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');
const STAGE_WIDTH = width - spacing.xl * 2;
const STAGE_HEIGHT = STAGE_WIDTH * 1.28;

export default function ResultScreen() {
  const router = useRouter();
  const { styleById, colors: palette } = useCatalog();
  const { look, gender } = useSession();
  const { savedLooks, saveLook, isFavourite, toggleFavourite } = useLibrary();
  const [justSaved, setJustSaved] = useState(false);

  const hairstyle = styleById(look?.hairstyleId);

  if (!look || !hairstyle) {
    return (
      <Screen>
        <Header title="Your look" />
        <EmptyState
          icon="image-outline"
          title="No preview yet"
          body="Generate a look and it will show up here."
          actionLabel="Start a try-on"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const alreadySaved = savedLooks.some((entry) => entry.id === look.id);
  const activeColor = colorById(palette, look.options.color ?? hairstyle.defaultColorId);
  const favourite = isFavourite(hairstyle.id);

  const save = () => {
    saveLook(look);
    setJustSaved(true);
  };

  const tryAnother = () => {
    router.push(`/try/more-styles?from=${hairstyle.id}`);
  };

  return (
    <Screen
      padded={false}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label="Try another style" icon="repeat-outline" onPress={tryAnother} />
          <Button
            label="Done"
            variant="ghost"
            size="md"
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      }
    >
      <Header
        title="Your new look"
        right={
          <IconButton
            icon={favourite ? 'heart' : 'heart-outline'}
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            active={favourite}
            onPress={() => toggleFavourite(hairstyle.id)}
          />
        }
      />

      <View style={styles.stage}>
        <PhotoFrame
          uri={look.resultUri}
          tint={look.resultUri && look.resultUri !== DEMO_PHOTO ? 'rgba(255,90,60,0.08)' : null}
          style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
          demo={{ shape: hairstyle.shape, options: look.options, color: activeColor, gender }}
          demoWidth={STAGE_HEIGHT * 0.8}
        >
          <View style={styles.styleTag}>
            <MannequinBadge shape={hairstyle.shape} color={activeColor} size={34} />
            <View>
              <Text style={[type.caption, { color: colors.onDark, fontWeight: '700' }]}>
                {hairstyle.name}
              </Text>
              <Text style={[type.caption, { color: colors.onDarkMuted, fontSize: 11 }]}>
                {activeColor?.name}
              </Text>
            </View>
          </View>
        </PhotoFrame>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={styles.pillRow}>
          {look.options.length ? <Pill label={`Length: ${look.options.length}`} /> : null}
          {look.options.fade ? <Pill label={`Fade: ${look.options.fade}`} /> : null}
          <Pill tone="jade" label="Simulated preview" />
        </View>

        <View style={styles.actionRow}>
          <ResultAction
            icon={alreadySaved || justSaved ? 'checkmark-circle' : 'bookmark-outline'}
            label={alreadySaved || justSaved ? 'Saved' : 'Save'}
            active={alreadySaved || justSaved}
            onPress={save}
          />
          <ResultAction icon="share-social-outline" label="Share" onPress={() => router.push('/try/share')} />
          <ResultAction icon="git-compare-outline" label="Compare" onPress={() => router.push('/try/compare')} />
          <ResultAction
            icon="options-outline"
            label="Adjust"
            onPress={() => router.push(`/try/style/${hairstyle.id}`)}
          />
        </View>

        <View style={styles.explainer}>
          <Ionicons name="information-circle-outline" size={17} color={colors.inkSoft} />
          <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>
            Image generation is not connected yet, so this shows your original photo with the chosen
            style recorded against it. The layout, actions and flow are final.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function ResultAction({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name={icon} size={21} color={active ? colors.jade : colors.ink} />
      <Text style={[type.caption, { color: active ? colors.jade : colors.inkSoft, fontWeight: '700' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: spacing.lg },
  styleTag: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(23,21,26,0.72)',
    borderRadius: radii.pill,
    paddingLeft: 6,
    paddingRight: spacing.lg,
    paddingVertical: 6,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  explainer: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
});
