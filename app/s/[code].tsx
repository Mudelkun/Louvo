import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { resolveShareLink } from '@/api/share';
import { EmptyState } from '@/components/Feedback';
import { Header, Screen } from '@/components/Screen';
import { StyleScreenSkeleton } from '@/components/StyleScreenSkeleton';
import { flush } from '@/lib/analytics';
import { rememberReferral } from '@/lib/referral';
import { useSession } from '@/state/SessionContext';
import { spacing } from '@/theme/theme';

/**
 * Where a shared link lands when the app is already installed.
 *
 * `hairify://s/<code>` — and, once the association files are live,
 * `https://<host>/s/<code>` — route here. The screen has one job and it is a
 * short one: work out which haircut the link is about and put the recipient in
 * front of it. Everything else about this screen is arranged so that job is over
 * quickly.
 *
 * **It never becomes the app's home.** The style page is `replace`d onto it, so
 * the back gesture from there goes to the tabs rather than to a spinner for a
 * link that has already been followed. A code that does not resolve is the one
 * case that stays — with a way out, because the alternative is a person who
 * tapped their friend's link staring at the tab bar wondering what happened.
 *
 * **It does not need an account, a photo or a network.** A recipient arrives
 * here seconds after installing, with nothing chosen. The style screen they land
 * on already handles exactly that: it shows the cut and asks for a photo.
 *
 * The attribution call is fire-and-forget and is never waited on — see
 * `rememberReferral`. What *is* waited on is the resolve, because the
 * destination depends on it, and that is why this screen exists at all instead
 * of the link routing straight into `/try/style/[id]`: a code is not a hairstyle
 * id, and the mapping between them is the server's.
 */
export default function ShareLinkScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { setGender, setHairType } = useSession();
  const [failed, setFailed] = useState(false);
  /**
   * One resolve per code, whatever React does with this component.
   *
   * A deep link can re-render this screen while the request is in flight, and a
   * second `rememberReferral` for the same code would put a second
   * `share_link_opened` in the funnel for one tap. The guard is the ref rather
   * than a state flag because it has to be set synchronously.
   */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!code || handled.current === code) return;
    handled.current = code;

    let active = true;
    (async () => {
      // Deliberately not awaited together: the attribution is a report and the
      // resolve is the thing the screen is waiting for. Racing them would put a
      // network call for analytics in front of the user's destination.
      void rememberReferral(code);

      const share = await resolveShareLink(code);
      if (!active) return;

      if (!share) {
        setFailed(true);
        // Flushed rather than left to the timer: the recipient may well close
        // the app from this screen, and a link that failed to resolve is the
        // most useful single event in the funnel.
        void flush();
        return;
      }

      // The session is seeded with what the link knows, so the style screen
      // opens on the same gender and texture the sharer was looking at rather
      // than on a fresh session's defaults. This is a recipient's *first*
      // interaction with the app — a men's cut arriving on the women's mannequin
      // would be a different haircut, which is the failure `<Mannequin>` and the
      // catalog's per-gender shoot exist to avoid.
      if (share.gender) setGender(share.gender);
      setHairType(share.hairType);

      router.replace({
        pathname: '/try/style/[id]',
        params: {
          id: share.hairstyleId,
          ...(share.gender ? { gender: share.gender } : null),
          ...(share.hairType ? { hairType: share.hairType } : null),
        },
      });
    })();

    return () => {
      active = false;
    };
  }, [code, router, setGender, setHairType]);

  return (
    // Unpadded because the placeholder below is the style screen's own layout,
    // margins and all; `<EmptyState>` carries its own inset either way.
    <Screen padded={false}>
      <Header title="Shared look" hideBack={!failed} />
      {failed ? (
        <View style={{ paddingTop: spacing.xxl }}>
          <EmptyState
            icon="link-outline"
            title="That link has expired"
            body="We could not find the haircut behind it — but everything in the catalog is here to try."
            actionLabel="Browse hairstyles"
            onAction={() => router.replace('/(tabs)/styles')}
          />
        </View>
      ) : (
        /* The wait is a code being resolved, and what it resolves into is
           always the style screen — this screen `replace`s that one onto
           itself. So the placeholder is that screen: the recipient watches the
           page they are going to fill in, rather than a spinner that is
           replaced by something unrelated. */
        <StyleScreenSkeleton label="Opening the look" />
      )}
    </Screen>
  );
}
