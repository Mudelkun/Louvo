import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { Header, Screen } from '@/components/Screen';
import { askForPreviewPush } from '@/lib/push';
import { useOnboarding } from '@/state/OnboardingContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

/**
 * The last beat of the guided run: the notification, explained before it is
 * asked for.
 *
 * It sits *after* the job has been submitted, not before. Pressing Generate
 * starts the work — the preview is already being made while this is on screen —
 * so nothing here delays anything, and the offer is about something that is
 * genuinely happening rather than something that might. That ordering is also
 * what makes the copy true: "on its way" is a statement about a job with an id.
 *
 * Why a screen at all, when `GenerationContext` already asks at submit. Because
 * what it asks with is the bare system dialog, and a system dialog is one line
 * of the OS's wording and two buttons — the single most consequential yes/no the
 * app ever puts up, with no room to say what the notification is for. There is
 * exactly one notification in this app and it is the finished preview the user
 * has just paid attention to; that is worth a sentence, and a sentence needs a
 * screen. The claim in `push.ts` is what stops both firing.
 *
 * Both buttons lead to the same place and neither touches the job. Declining is
 * a real answer, so it is a button rather than a smaller, greyer link: somebody
 * who intends to stand and watch the preview being made does not need a ping,
 * and dressing that up as the wrong choice is how apps train people to say no
 * to everything.
 *
 * Reached only when the permission is actually askable — `shouldAskPush()` is
 * checked before the flow comes here, so this screen never promises a ping in a
 * build that cannot send one.
 */
export default function NotifyScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { job } = useLocalSearchParams<{ job?: string }>();
  const { complete } = useOnboarding();
  const [asking, setAsking] = useState(false);

  /**
   * The end of onboarding, whichever button got here.
   *
   * `complete()` releases the prompt claim as well as marking the device seen,
   * so every later generation goes back to asking at submit for anyone who said
   * no here and changed their mind.
   *
   * Replaced rather than pushed: the job is running and this screen has had its
   * answer, so backing out of the wait should land on the style, not here.
   */
  const onwards = () => {
    complete();
    router.replace(job ? `/try/generating?job=${job}` : '/try/generating');
  };

  const allow = async () => {
    setAsking(true);
    try {
      await askForPreviewPush();
    } finally {
      // Granted or refused, the flow moves on. The permission is the user's to
      // withhold and there is nothing to report about it — the preview arrives
      // either way, and the wait screen is on the other side of this.
      onwards();
    }
  };

  return (
    <Screen
      padded={false}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label="Notify me when it’s ready"
            icon="notifications"
            loading={asking}
            onPress={allow}
          />
          <Button label="No thanks, I’ll wait here" variant="ghost" size="md" onPress={onwards} />
        </View>
      }
    >
      {/* No back button: the work is already running and there is nothing behind
          this screen but the button that started it. */}
      <Header hideBack />

      <View style={styles.body}>
        <Reveal index={0} style={styles.medallionWrap}>
          <View style={styles.medallion}>
            <Ionicons name="notifications" size={34} color={colors.accent} />
          </View>
        </Reveal>

        <Reveal index={1}>
          <Text style={[type.display, styles.title]}>Your preview is on its way</Text>
          <Text style={[type.body, styles.subtitle]}>
            It takes about a minute, and it carries on whether Louvo is open or not. We can tap you
            on the shoulder the moment it lands.
          </Text>
        </Reveal>

        <Reveal index={2} style={styles.points}>
          <Point icon="sparkles-outline" text="One notification: your finished preview." />
          <Point icon="moon-outline" text="Nothing else. No offers, no reminders, no nudges." />
          <Point icon="settings-outline" text="Changeable any time in your phone’s settings." />
        </Reveal>
      </View>
    </Screen>
  );
}

/** A promise about what this permission will and will not be used for. */
function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={17} color={colors.accent} />
      <Text style={[type.body, { color: colors.inkSoft, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  medallionWrap: { alignItems: 'center', marginBottom: spacing.xl },
  medallion: {
    width: 76,
    height: 76,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  title: { color: colors.ink, textAlign: 'center' },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    alignSelf: 'center',
    maxWidth: 330,
  },
  points: { gap: spacing.lg, marginTop: spacing.xxl },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
}));
