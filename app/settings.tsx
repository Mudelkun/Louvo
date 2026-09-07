import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { API_BASE_URL, catalogSource, generationSource, hasApi } from '@/api/client';
import { purchasesConfigured } from '@/api/purchases';
import { shareLinksConfigured, shareSource } from '@/api/share';
import { TRY_ON_MODEL, generationConfigured } from '@/api/tryOn';
import { ChoiceRow } from '@/components/Controls';
import { MockNotice, Pill } from '@/components/Feedback';
import { Header, Screen, SectionLabel } from '@/components/Screen';
import { PRIVACY_POLICY, TERMS_OF_USE } from '@/lib/legal';
import { screenCaptureSource } from '@/lib/screenCapture';
import { useAccount } from '@/state/AccountContext';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useOnboarding } from '@/state/OnboardingContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, radii, spacing, useColors, useThemePreference, type } from '@/theme/theme';
import type { ThemePreference } from '@/theme/theme';

/**
 * Where this launch's catalog actually came from, in words.
 *
 * Three states rather than two, because "the API answered" and "the API did not
 * and the device had a copy" are genuinely different things to be looking at,
 * and only one of them can be out of date. Keyed off `catalogSource()` so the
 * screen reports what happened instead of what was configured.
 */
const CATALOG_SOURCE_COPY: Record<ReturnType<typeof catalogSource>, string> = {
  api: 'Hairstyles are loaded from the Luvo catalog API and their imagery from the CDN.',
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
 * Where previews are generated, said in the same voice as the catalog's source.
 *
 * Three outcomes, and the privacy sentence is genuinely different for each — so
 * this is the copy rather than a label with an adjective swapped. The one that
 * matters is `server`: the photo does leave the device, briefly, and is deleted
 * as soon as the preview is made. Saying anything vaguer here would be the
 * wrong kind of comfortable, in the one screen a user opens to check.
 */
const GENERATION_COPY: Record<ReturnType<typeof generationSource>, string> = {
  server:
    'Generating a preview uploads your photo to Luvo, which passes it to the image provider and deletes it as soon as the preview is made. ' +
    'The finished preview is downloaded to this phone and deleted from the server — it is yours until you delete it, and it is not kept anywhere else.',
  direct:
    'Generating a preview sends your photo straight from this phone to the image provider; it is not stored on any Luvo server.',
  simulated: 'Previews are simulated, so no photo leaves your device.',
};

const GENERATION_LABEL: Record<ReturnType<typeof generationSource>, string> = {
  server: 'Previews on the server',
  direct: 'Previews from this phone',
  simulated: 'Generator off — previews simulated',
};

const GENERATION_TONE: Record<ReturnType<typeof generationSource>, 'jade' | 'rust'> = {
  server: 'jade',
  direct: 'jade',
  simulated: 'rust',
};


/**
 * Whether a shared look carries a link anybody can follow.
 *
 * Two states rather than three, because there is no cached middle: a link is
 * either minted by the backend and countable, or it is the local stand-in. It is
 * reported for the same reason the other two are — the share sheet looks
 * identical either way, and a user whose shares are going out with no link
 * deserves to be told rather than to find out from a friend.
 */
const SHARE_LABEL: Record<ReturnType<typeof shareSource>, string> = {
  api: 'Share links live',
  local: 'Share links off',
};

/**
 * Whether this build's window can be photographed by the phone it is running on.
 *
 * Reported for the same reason the three above it are: it is a fact about the
 * running app rather than about the build, and it is the kind of fact a user is
 * entitled to check. It is also the one a *developer* needs, because the native
 * module is absent from Expo Go and a build that silently does not block
 * screenshots looks exactly like one that does until somebody takes one.
 */
const SCREEN_CAPTURE_LABEL: Record<ReturnType<typeof screenCaptureSource>, string> = {
  blocked: 'Screenshots blocked',
  unavailable: 'Screenshots not blocked',
};

/**
 * The three answers to "what should the app look like", in the order they make
 * sense: the one that needs no decision first.
 */
const APPEARANCE_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/**
 * Settings screen, reached from the gear in the Profile tab's header. There are no
 * accounts yet — this is where the prototype's simulated behaviour is spelled out.
 */
export default function SettingsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { savedLooks, favouriteIds, clearAll } = useLibrary();
  const { hairstyles, categories, reload } = useCatalog();
  const { reset: resetSession, gender } = useSession();
  const { account, credits, metered, signOut, deleteAccount } = useAccount();
  const { reset: resetOnboarding } = useOnboarding();
  const { preference, setPreference, systemName } = useThemePreference();
  const [saveOriginals, setSaveOriginals] = React.useState(true);
  const [hdPreviews, setHdPreviews] = React.useState(false);

  const confirmSignOut = () => {
    Alert.alert('Log out?', 'Your generations stay on your account and come back when you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', onPress: () => void signOut() },
    ]);
  };

  /**
   * Two taps, and the first one says the number.
   *
   * Deleting an account destroys unspent credits somebody paid for, so the
   * dialog says how many rather than saying "this cannot be undone" and leaving
   * them to remember. The second confirmation is not ceremony — this is the one
   * irreversible, money-losing action in the app.
   */
  const confirmDelete = () => {
    const balance = credits.credits;
    Alert.alert(
      'Delete your account?',
      balance > 0
        ? `This permanently deletes your account and the ${balance} generation${balance === 1 ? '' : 's'} on it. ` +
          'They cannot be recovered or refunded.'
        : 'This permanently deletes your account. It cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete permanently?', 'Last chance — this cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete my account', style: 'destructive', onPress: () => void deleteAccount() },
            ]),
        },
      ],
    );
  };

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
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(account ? '/credits' : '/sign-in')}
          style={({ pressed }) => [styles.profileCard, pressed && { backgroundColor: colors.surfaceAlt }]}
        >
          <View style={styles.avatar}>
            <Ionicons name={account ? 'person' : 'person-outline'} size={26} color={colors.onInkFill} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.heading, { color: colors.ink }]}>
              {account ? account.displayName ?? account.email ?? 'Your account' : 'Guest'}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {account
                ? 'Signed in. Generations you buy follow this account to a new phone.'
                : metered
                  ? 'Sign in to buy generations and keep them across phones.'
                  : 'Everything is stored on this device.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>

        {/* The balance, and the first thing somebody opens this screen to see.
            Above the stats rather than among them, because it is the only number
            here that changes what the app will let them do — and because the
            brief asks that Settings be where credits are managed, which means the
            balance cannot be three sections down. */}
        {metered ? <CreditsCard /> : null}

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
          {`${CATALOG_SOURCE_COPY[catalogSource()]} ${GENERATION_COPY[generationSource()]}`}
        </MockNotice>

        <View>
          <SectionLabel>Appearance</SectionLabel>
          <View style={[styles.group, styles.appearance]}>
            <ChoiceRow
              options={APPEARANCE_OPTIONS}
              value={preference}
              onChange={(id) => setPreference(id as ThemePreference)}
            />
            {/* What the choice means, rather than a restatement of it. On
                `System` the useful fact is which way the phone is currently
                leaning — the control looks identical at noon and at midnight,
                and this is the line that tells them apart. */}
            <Text style={[type.caption, { color: colors.muted }]}>
              {preference === 'system'
                ? `Following your phone, which is set to ${systemName}. It changes with the phone.`
                : `Always ${preference}, whatever your phone is set to.`}
            </Text>
          </View>
        </View>

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

        {metered ? (
          <View>
            <SectionLabel>Account</SectionLabel>
            <View style={styles.group}>
              <LinkRow
                icon="sparkles-outline"
                label="Buy generations"
                hint={purchasesConfigured() ? 'Packs of 5, 10 and 20 — no subscription' : 'This build has no store keys'}
                onPress={() => router.push('/credits')}
              />
              {account ? (
                <>
                  <Divider />
                  <LinkRow icon="log-out-outline" label="Log out" onPress={confirmSignOut} />
                  <Divider />
                  {/* Required inside the app by App Store guideline 5.1.1(v),
                      and required to be a real deletion rather than a
                      deactivation. The confirmation names the balance it
                      destroys — a dialog that does not mention it is a
                      confirmation of the wrong thing. */}
                  <LinkRow
                    icon="person-remove-outline"
                    label="Delete my account"
                    hint="Permanent, and takes any unused generations with it"
                    destructive
                    onPress={confirmDelete}
                  />
                </>
              ) : (
                <>
                  <Divider />
                  <LinkRow
                    icon="log-in-outline"
                    label="Sign in or create an account"
                    hint="Needed only to buy generations"
                    onPress={() => router.push('/sign-in')}
                  />
                </>
              )}
            </View>
          </View>
        ) : null}

        <View>
          <SectionLabel>Data</SectionLabel>
          <View style={styles.group}>
            <LinkRow icon="trash-outline" label="Clear saved looks and favourites" destructive onPress={confirmClear} />
          </View>
        </View>

        {/* The two documents, where somebody who goes looking for them expects
            to find them. They are screens rather than links out: the app has to
            be able to show them with no network, and a build with no API has no
            public page to link to. `src/lib/legal.ts` is the text itself, and
            the server renders the same words at /privacy and /terms for the two
            store listings. */}
        <View>
          <SectionLabel>Legal</SectionLabel>
          <View style={styles.group}>
            <LinkRow
              icon="lock-closed-outline"
              label={PRIVACY_POLICY.title}
              hint="What happens to your photo"
              onPress={() => router.push('/legal/privacy')}
            />
            <Divider />
            <LinkRow
              icon="document-text-outline"
              label={TERMS_OF_USE.title}
              hint="The agreement between you and Luvo"
              onPress={() => router.push('/legal/terms')}
            />
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
            <Pill tone={GENERATION_TONE[generationSource()]} label={GENERATION_LABEL[generationSource()]} />
            {/* The third of the same kind. A share always works — the image and
                the caption are composed on this phone — but only a minted link
                can be followed back to the app and counted, and that is the half
                the whole feature exists for. */}
            <Pill tone={shareSource() === 'api' ? 'jade' : 'rust'} label={SHARE_LABEL[shareSource()]} />
            {/* The fourth of the same kind, and the one that costs money to get
                wrong in either direction. A build with no API meters nothing —
                generations are free because there is no server to count them —
                and a build with an API but no store keys can count them and not
                sell any, which is a dead end a user would otherwise discover at
                the paywall. */}
            <Pill
              tone={!metered ? 'rust' : purchasesConfigured() ? 'jade' : 'rust'}
              label={!metered ? 'Generations unmetered' : purchasesConfigured() ? 'Store live' : 'Store keys missing'}
            />
            {/* The fifth, and the only one that is about what leaves the app
                rather than what comes into it. A hairstyle render is the
                product; a screenshot of one is that product in somebody else's
                image model, so the block is on by default on both phones and
                this says whether the OS actually took it. */}
            <Pill
              tone={screenCaptureSource() === 'blocked' ? 'jade' : 'rust'}
              label={SCREEN_CAPTURE_LABEL[screenCaptureSource()]}
            />
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>
            {generationSource() === 'server'
              ? 'Previews are generated by the Luvo backend, which keeps the generator key and runs the job even if you close the app.'
              : generationConfigured()
                ? `Previews are generated on this phone by ${TRY_ON_MODEL}, and stop if you leave the app.`
                : 'Set EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_FAL_KEY) and restart the dev server to generate real previews.'}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {!metered
              ? 'Without EXPO_PUBLIC_API_URL there is no server to count generations, so this build does not meter them.'
              : purchasesConfigured()
                ? 'Every device gets two free generations, kept against the device rather than the install. After that, generations are bought in packs and held on your account.'
                : 'Generations are metered, but this build carries no RevenueCat keys — set EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY to buy any.'}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {hasApi()
              ? `Catalog API: ${API_BASE_URL}`
              : 'Set EXPO_PUBLIC_API_URL and restart the dev server to load the catalog from the API.'}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {screenCaptureSource() === 'blocked'
              ? 'Screenshots and screen recordings of Luvo are turned off, so hairstyle renders stay in the app. Android refuses the capture outright; on iPhone the picture comes out blank. Sharing a look still sends a proper image.'
              : 'This build cannot block screenshots — the web build has no way to, and Expo Go does not carry the module. Use a dev build to check it.'}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {shareSource() === 'api'
              ? 'Shared looks carry a Luvo link that opens the app if it is installed and the store if it is not, and the shares it brings in are counted against it.'
              : shareLinksConfigured()
                ? 'Shared looks carry EXPO_PUBLIC_SHARE_URL. Nothing is counted without EXPO_PUBLIC_API_URL.'
                : 'Shared looks carry the image and the caption but no link — set EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_SHARE_URL) to give people a way back.'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

/**
 * The balance, and the one number on this screen that gates anything.
 *
 * Free and purchased are shown apart rather than as a single total. The brief
 * asks that the two be tracked separately, and the user-facing half of that is
 * this: somebody with one trial left and a pack they bought should be able to
 * see which is which, not a sum that hides what is being spent first. When both
 * are zero it stops being a readout and becomes the offer, because at that point
 * a number is not what anybody needs.
 *
 * The skeleton state is not cosmetic either. `ready` is false until the first
 * response lands, and drawing "0" during that half-second would tell a user with
 * twenty credits that they have none.
 */
function CreditsCard() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { credits, ready, refreshing } = useAccount();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ready ? `${credits.total} generations remaining` : 'Loading your generations'}
      onPress={() => router.push('/credits')}
      style={({ pressed }) => [styles.creditsCard, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.caption, { color: colors.onDarkMuted }]}>Generations</Text>
        <Text style={[type.title, { color: colors.onDark }]}>
          {ready ? credits.total : '—'}
        </Text>
        <Text style={[type.caption, { color: colors.onDarkMuted }]}>
          {!ready
            ? refreshing
              ? 'Checking your balance…'
              : 'Balance unavailable right now'
            : credits.free && credits.credits
              ? `${credits.free} free · ${credits.credits} purchased`
              : credits.free
                ? `${credits.free} of your ${credits.freeGranted} free generations left`
                : credits.credits
                  ? 'Purchased — they do not expire'
                  : 'Tap to get more'}
        </Text>
      </View>
      <Ionicons name="add-circle" size={30} color={colors.accent} />
    </Pressable>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  const colors = useColors();
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
  const styles = useStyles();
  return <View style={styles.divider} />;
}

const useStyles = makeStyles(({ colors }) => ({
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
    backgroundColor: colors.inkFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `stage` rather than `surface`: the balance is the one thing on this screen
  // that is not a setting, and a dark plate is what separates a readout from the
  // list of rows under it in both schemes.
  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.stage,
    borderRadius: radii.xl,
    padding: spacing.lg,
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
  // The one group whose contents are a control rather than a list of rows, so
  // it gets the padding the rows were carrying themselves.
  appearance: { padding: spacing.lg, gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 52 },
  about: { gap: spacing.md, alignItems: 'flex-start', paddingBottom: spacing.xl },
}));
