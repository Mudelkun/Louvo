import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { API_BASE_URL, catalogSource, hasApi } from '@/api/client';
import { TRY_ON_MODEL, generationConfigured } from '@/api/tryOn';
import { MockNotice, Pill } from '@/components/Feedback';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, spacing, type } from '@/theme/theme';

/**
 * Where this launch's catalog actually came from, in words.
 *
 * Three states rather than two, because "the API answered" and "the API did not
 * and the device had a copy" are genuinely different things to be looking at,
 * and only one of them can be out of date. Keyed off `catalogSource()` so the
 * screen reports what happened instead of what was configured.
 */
const CATALOG_SOURCE_COPY: Record<ReturnType<typeof catalogSource>, string> = {
  api: 'Hairstyles are loaded from the Hairify catalog API and their imagery from the CDN.',
  cache: 'The catalog API could not be reached, so hairstyles are the copy saved on this device.',
  bundled: 'Preview build: hairstyles come from bundled mock data.',
};

const CATALOG_SOURCE_LABEL: Record<ReturnType<typeof catalogSource>, string> = {
  api: 'Catalog live',
  cache: 'Catalog — offline copy',
  bundled: 'Mock data',
};

const CATALOG_SOURCE_TONE: Record<ReturnType<typeof catalogSource>, 'jade' | 'rust'> = {
  api: 'jade',
  cache: 'rust',
  bundled: 'rust',
};

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

        {/* Two claims, and both have to track what the build actually did
            rather than what it usually does. Where the catalog came from is a
            fact about this launch — the API may have been unreachable and the
            device cache may have answered — so it is read back from the client
            rather than inferred from whether a URL is configured. The second
            sentence is a privacy claim: with generation configured the photo is
            sent to the image model, and saying otherwise would be a lie in the
            one place a user goes to check. */}
        <MockNotice>
          {`${CATALOG_SOURCE_COPY[catalogSource()]} ${
            generationConfigured()
              ? 'Generating a preview sends your photo to the image provider; nothing else leaves your device and no photo is stored on a server.'
              : 'Previews are simulated, so no photo leaves your device.'
          }`}
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
            {/* The catalog is the one thing here that can differ between two
                launches of the same build, so this reports the outcome rather
                than the configuration. "Offline copy" is not a failure state to
                hide: it is the app working, and a user seeing a stale catalog
                deserves to know that is what they are looking at. */}
            <Pill tone={CATALOG_SOURCE_TONE[catalogSource()]} label={CATALOG_SOURCE_LABEL[catalogSource()]} />
            {/* Whether the generator is actually wired up, stated where it can
                be checked. `EXPO_PUBLIC_*` is inlined at bundle time, so a key
                added to .env.local after the dev server started is not in the
                running app and every preview silently simulates — which looks
                exactly like a model that declined to change anything. This row
                is how that gets told apart from a bad prompt. */}
            <Pill
              tone={generationConfigured() ? 'jade' : 'rust'}
              label={generationConfigured() ? 'Generator live' : 'Generator off — previews simulated'}
            />
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>
            {generationConfigured()
              ? `Previews are generated by ${TRY_ON_MODEL}.`
              : 'Set EXPO_PUBLIC_FAL_KEY and restart the dev server to generate real previews.'}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {hasApi()
              ? `Catalog API: ${API_BASE_URL}`
              : 'Set EXPO_PUBLIC_API_URL and restart the dev server to load the catalog from the API.'}
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
