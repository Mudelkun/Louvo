/**
 * Signing in, which is only ever asked for at the moment somebody wants to buy.
 *
 * That is the whole placement decision. Two free generations happen with no
 * account, no email and no interruption — the brief's "try the app before you
 * commit" — and this screen appears exactly once, when the user has decided to
 * spend money and needs somewhere for it to live.
 *
 * ## Why three options, and why Apple is not optional
 *
 * App Store guideline 4.8 requires an equivalent private sign-in option wherever
 * a third-party login is offered, and Sign in with Apple satisfies it. So on iOS
 * this is not "Apple *or* Google" as a matter of taste — offering Google without
 * Apple is a rejection. Email is here because somebody who uses neither should
 * not be locked out of credits they paid for.
 *
 * ## Nothing is verified here
 *
 * Every button on this screen obtains a token and posts it. The token is checked
 * on the server against Apple's or Google's published keys — signature, issuer,
 * audience, expiry — because a client that decides whether its own login was
 * valid has not implemented a login. See `server/src/accounts.ts`.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { requestEmailCode, AccountError } from '@/api/account';
import { appleAvailable, googleAvailable, signInWithApple, signInWithGoogle } from '@/api/signIn';
import { Button } from '@/components/Button';
import { LegalLinks } from '@/components/LegalLinks';
import { Header, Screen } from '@/components/Screen';
import { useAccount } from '@/state/AccountContext';
import { makeStyles, radii, spacing, useColors, type } from '@/theme/theme';

type Stage = 'choose' | 'email' | 'code';

export default function SignInScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { signIn } = useAccount();

  const [stage, setStage] = React.useState<Stage>('choose');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hasApple, setHasApple] = React.useState(false);

  React.useEffect(() => {
    void appleAvailable().then(setHasApple);
  }, []);

  /** One place where a finished sign-in leaves this screen. */
  const done = () => {
    // Replaced rather than popped: going "back" to a sign-in screen from an
    // account you are now in is a dead end, and the user came here on their way
    // to buying something.
    router.replace('/credits');
  };

  const withProvider = async (name: 'apple' | 'google') => {
    setError(null);
    setBusy(name);
    try {
      const outcome = name === 'apple' ? await signInWithApple() : await signInWithGoogle();
      // Backing out is a decision, not a failure, and gets no error message.
      if (outcome.status === 'cancelled') return;
      if (outcome.status === 'unavailable') {
        setError(`${name === 'apple' ? 'Apple' : 'Google'} sign-in is not available in this build.`);
        return;
      }
      if (outcome.status === 'failed') {
        setError(outcome.message);
        return;
      }
      await signIn(outcome.identity);
      done();
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    setError(null);
    setBusy('email');
    try {
      const result = await requestEmailCode(email.trim());
      setStage('code');
      // Only ever present on a deployment that has explicitly opted into echoing
      // it and has no mail provider — a local checkout. Shown rather than hidden
      // because otherwise this path cannot be tested at all without Resend.
      if (result.devCode) setError(`Development build: your code is ${result.devCode}`);
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    setError(null);
    setBusy('code');
    try {
      await signIn({ provider: 'email', token: code.trim(), email: email.trim() });
      done();
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen padded={false}>
      <Header title={stage === 'choose' ? 'Your account' : 'Sign in with email'} />
      <View style={styles.body}>
        {stage === 'choose' ? (
          <>
            <Text style={[type.body, { color: colors.muted }]}>
              An account keeps the generations you buy, so they follow you to a new phone. Your photos and saved looks
              stay on this device and are never part of it.
            </Text>

            <View style={{ gap: spacing.md }}>
              {hasApple ? (
                <Button
                  label="Continue with Apple"
                  icon="logo-apple"
                  variant="dark"
                  loading={busy === 'apple'}
                  disabled={!!busy}
                  onPress={() => void withProvider('apple')}
                />
              ) : null}
              {googleAvailable() ? (
                <Button
                  label="Continue with Google"
                  icon="logo-google"
                  variant="secondary"
                  loading={busy === 'google'}
                  disabled={!!busy}
                  onPress={() => void withProvider('google')}
                />
              ) : null}
              <Button
                label="Continue with email"
                icon="mail-outline"
                variant="secondary"
                disabled={!!busy}
                onPress={() => setStage('email')}
              />
            </View>
          </>
        ) : stage === 'email' ? (
          <>
            <Text style={[type.body, { color: colors.muted }]}>
              We will send you a six-digit code. No password to remember.
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              inputMode="email"
              autoFocus
            />
            <Button
              label="Send me a code"
              loading={busy === 'email'}
              disabled={!!busy || !email.includes('@')}
              onPress={() => void sendCode()}
            />
            <Pressable accessibilityRole="button" onPress={() => setStage('choose')} style={styles.back}>
              <Text style={[type.caption, { color: colors.accentInk, fontWeight: '600' }]}>Other ways to sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[type.body, { color: colors.muted }]}>
              Enter the code we sent to {email.trim()}.
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
            />
            <Button
              label="Sign in"
              loading={busy === 'code'}
              disabled={!!busy || code.length !== 6}
              onPress={() => void verifyCode()}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void sendCode()}
              disabled={!!busy}
              style={styles.back}
            >
              <Text style={[type.caption, { color: colors.accentInk, fontWeight: '600' }]}>Send another code</Text>
            </Pressable>
          </>
        )}

        {busy && stage === 'choose' ? <ActivityIndicator color={colors.accent} /> : null}

        {error ? (
          <View style={styles.error}>
            <Ionicons name="information-circle-outline" size={18} color={colors.ink} />
            <Text style={[type.caption, { color: colors.ink, flex: 1 }]}>{error}</Text>
          </View>
        ) : null}

        <Text style={[type.caption, { color: colors.muted }]}>
          We store your email address and nothing else. You can delete your account, and everything on it, from
          Settings at any time.
        </Text>

        {/* Making an account is the first thing in this app that creates a
            record with a person's name on it, so the agreement is stated here
            rather than assumed from the welcome screen — which somebody who
            arrived from a shared link may never have seen. */}
        <LegalLinks action="creating an account" align="left" />
      </View>
    </Screen>
  );
}

/**
 * The server's own words when it has them.
 *
 * `AccountError.message` is written to be read by a person — "that code is not
 * right", "that code has expired" — so it is shown as-is rather than replaced by
 * a generic failure that tells somebody less than the server already did.
 */
function describe(error: unknown): string {
  if (error instanceof AccountError) return error.message;
  return 'That did not work. Check your connection and try again.';
}

const useStyles = makeStyles(({ colors }) => ({
  body: { paddingTop: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 17,
    color: colors.ink,
  },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontVariant: ['tabular-nums'] },
  back: { alignSelf: 'center', paddingVertical: spacing.sm },
  error: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
}));
