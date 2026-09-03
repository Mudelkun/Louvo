import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { API_BASE_URL } from '@/api/client';
import { TRY_ON_MODEL, generationConfigured } from '@/api/tryOn';
import { MockNotice, Pill } from '@/components/Feedback';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, spacing, type } from '@/theme/theme';

/**
 * Settings screen, reached from the gear in the Profile tab's header. There are no
 * accounts yet — this is where the prototype's simulated behaviour is spelled out.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { savedLooks, favouriteIds, clearAll } = useLibrary();
  const { hairstyles, categories, reload } = useCatalog();
  const { reset: resetSession, gender } = useSession();
  const { reset: resetOnboarding } = useOnboarding();
  const [saveOriginals, setSaveOriginals] = React.useState(true);
  const [hdPreviews, setHdPreviews] = React.useState(false);

  const confirmClear = () => {
    Alert.alert('Clear saved data?', 'This removes your saved looks and favourites from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearAll },
    ]);
  };

  return (
    <Screen padded={false}>
      <Header title="Settings" />
      <View style={{ paddingTop: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.xl }}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={26} color={colors.onDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.heading, { color: colors.ink }]}>Guest</Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              Accounts arrive with the backend. Everything is stored on this device for now.
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat value={savedLooks.length} label="Looks saved" />
          <Stat value={favouriteIds.length} label="Favourites" />
          <Stat value={hairstyles.length} label="Styles" />
        </View>

        {/* The second sentence is a privacy claim, so it has to track what the
            build actually does: with generation configured the photo is sent to
            the image model, and saying otherwise would be a lie in the one place
            a user goes to check. */}
        <MockNotice>
          {generationConfigured()
            ? 'Preview build: hairstyles come from bundled mock data. Generating a preview sends your photo to the image provider; nothing else leaves your device and no photo is stored on a server.'
            : 'Preview build: hairstyles come from bundled mock data and previews are simulated. No photo leaves your device.'}
        </MockNotice>

        <View>
          <SectionLabel>Preferences</SectionLabel>
          <View style={styles.group}>
            <ToggleRow
              icon="image-outline"
              label="Keep the original photo"
              hint="Store the before shot alongside each look"
              value={saveOriginals}
              onChange={setSaveOriginals}
            />
            <Divider />
            <ToggleRow
              icon="sparkles-outline"
              label="High-detail previews"
              hint="Slower to generate, sharper result"
              value={hdPreviews}
              onChange={setHdPreviews}
            />
          </View>
        </View>

        <View>
          <SectionLabel>Try-on</SectionLabel>
          <View style={styles.group}>
            <LinkRow
              icon="refresh-outline"
              label="Start a fresh try-on"
              hint={gender ? `Currently set to ${gender === 'male' ? 'men' : 'women'}` : 'Clears photo and choices'}
              onPress={() => {
                resetSession();
                router.replace('/(tabs)');
              }}
            />
            <Divider />
            <LinkRow icon="cloud-download-outline" label="Reload catalog" hint={`${categories.length} categories`} onPress={reload} />
            <Divider />
            <LinkRow icon="play-circle-outline" label="Replay the intro" onPress={() => {
              resetOnboarding();
              router.push('/welcome');
            }} />
          </View>
        </View>

        <View>
          <SectionLabel>Data</SectionLabel>
          <View style={styles.group}>
            <LinkRow icon="trash-outline" label="Clear saved looks and favourites" destructive onPress={confirmClear} />
          </View>
        </View>

        <View style={styles.about}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Pill label={`v${Constants.expoConfig?.version ?? '0.1.0'}`} />
            <Pill tone="jade" label="Frontend prototype" />
            <Pill tone="gold" label="Mock data" />
            {/* Whether the generator is actually wired up, stated where it can
                be checked. `EXPO_PUBLIC_*` is inlined at bundle time, so a key
                added to .env.local after the dev server started is not in the
                running app and every preview silently simulates — which looks
                exactly like a model that declined to change anything. This row
                is how that gets told apart from a bad prompt. */}
            <Pill
              tone={generationConfigured() ? 'jade' : 'gold'}
              label={generationConfigured() ? 'Generator live' : 'Generator off — previews simulated'}
            />
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>
            {generationConfigured()
              ? `Previews are generated by ${TRY_ON_MODEL}.`
              : 'Set EXPO_PUBLIC_FAL_KEY and restart the dev server to generate real previews.'}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            API target once connected: {API_BASE_URL}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.title, { color: colors.ink }]}>{value}</Text>
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={19} color={colors.inkSoft} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: colors.ink, fontWeight: '600' }]}>{label}</Text>
        {hint ? <Text style={[type.caption, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.surfaceSunken }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const tint = destructive ? colors.danger : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name={icon} size={19} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: destructive ? colors.danger : colors.ink, fontWeight: '600' }]}>
          {label}
        </Text>
        {hint ? <Text style={[type.caption, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 52 },
  about: { gap: spacing.md, alignItems: 'flex-start', paddingBottom: spacing.xl },
});
