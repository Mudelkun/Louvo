import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { hairTypesFor } from '@/api/client';
import { Button } from '@/components/Button';
import { PhotoChooser } from '@/components/PhotoChooser';
import { Reveal } from '@/components/Reveal';
import { Header, Screen } from '@/components/Screen';
import { useCatalog } from '@/state/CatalogContext';
import { useOnboarding } from '@/state/OnboardingContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, spacing, type } from '@/theme/theme';

/**
 * Step 3 of the guided run — the photo, asked once the app has said what it is
 * going to do with it.
 *
 * The home tab asks for the same thing with the same control; what this screen
 * adds is the answer to "why do you want my face", which by here is two
 * questions old and can be stated as a fact rather than a promise: we are about
 * to show *you* in the cut you are about to pick. The line naming the hair type
 * they just declared is the whole of that, and it comes from the catalog rather
 * than from a string here — a fifth hair type would be a data change, as
 * everywhere else.
 *
 * Continue is the only way on. A photo is not optional here the way it is on the
 * home tab, where somebody may well be browsing.
 */
export default function PhotoStepScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { photoUri, setPhoto, hairTypeId } = useSession();
  const { hairTypes } = useCatalog();
  const { step } = useOnboarding();

  const declared = hairTypesFor(hairTypes).find((entry) => entry.id === hairTypeId);

  return (
    <Screen
      padded={false}
      footer={
        <Button
          label="Continue"
          iconRight="arrow-forward"
          disabled={!photoUri}
          onPress={() => router.push('/try/catalog')}
        />
      }
    >
      <Header step={step('photo')} />

      <View style={styles.body}>
        <Reveal index={0}>
          <Text style={[type.display, styles.title]}>Add your photo</Text>
          <Text style={[type.body, styles.subtitle]}>
            {declared
              ? `A clear, front-facing photo. Every cut you see next is generated on your ${declared.name.toLowerCase()} hair, on your face.`
              : 'A clear, front-facing photo. Every cut you see next is generated on your face rather than on a model.'}
          </Text>
        </Reveal>

        <Reveal index={1}>
          <PhotoChooser photoUri={photoUri} onPick={setPhoto} />
        </Reveal>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: { color: colors.ink },
  subtitle: {
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    maxWidth: 340,
  },
}));
