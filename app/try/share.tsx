import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { colorById, shareLook } from '@/api/client';
import { Button } from '@/components/Button';
import { EmptyState, MockNotice } from '@/components/Feedback';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { useCatalog } from '@/state/CatalogContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { colors, radii, spacing, type } from '@/theme/theme';

const { width } = Dimensions.get('window');

const CHANNELS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap; tint: string }[] = [
  { id: 'download', label: 'Save to photos', icon: 'download-outline', tint: colors.ink },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', tint: '#C13584' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', tint: '#25D366' },
  { id: 'link', label: 'Copy link', icon: 'link-outline', tint: colors.jade },
  { id: 'barber', label: 'Send to barber', icon: 'cut-outline', tint: colors.accent },
  { id: 'more', label: 'More', icon: 'ellipsis-horizontal', tint: colors.inkSoft },
];

export default function ShareScreen() {
  const router = useRouter();
  const { look, gender } = useSession();
  const { styleById, colors: palette } = useCatalog();
  const { saveLook } = useLibrary();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const hairstyle = styleById(look?.hairstyleId);

  if (!look || !hairstyle) {
    return (
      <Screen>
        <Header title="Share" />
        <EmptyState icon="share-social-outline" title="Nothing to share yet" body="Generate a look first." />
      </Screen>
    );
  }

  const activeColor = colorById(palette, look.options.color ?? hairstyle.defaultColorId);

  const send = async (channel: string) => {
    setBusy(channel);
    await shareLook(look, channel);
    setBusy(null);
    setSentTo(channel);
  };

  return (
    <Screen
      padded={false}
      footer={
        <Button
          label="Done"
          onPress={() => {
            saveLook(look);
            router.back();
          }}
        />
      }
    >
      <Header title="Share your look" />

      <View style={styles.stage}>
        <PhotoFrame
          uri={look.resultUri}
          style={{ width: width * 0.52, height: width * 0.66 }}
          rounded={radii.lg}
          demo={{ shape: hairstyle.shape, options: look.options, color: activeColor, gender }}
          demoWidth={width * 0.56}
        />
        <Text style={[type.bodyStrong, { color: colors.ink, marginTop: spacing.md }]}>{hairstyle.name}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>{activeColor?.name}</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={styles.grid}>
          {CHANNELS.map((channel) => {
            const sent = sentTo === channel.id;
            return (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                accessibilityLabel={channel.label}
                onPress={() => send(channel.id)}
                disabled={busy !== null}
                style={({ pressed }) => [styles.channel, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={[styles.channelIcon, { backgroundColor: `${channel.tint}1A` }]}>
                  <Ionicons
                    name={sent ? 'checkmark' : channel.icon}
                    size={21}
                    color={sent ? colors.jade : channel.tint}
                  />
                </View>
                <Text style={[type.caption, { color: colors.inkSoft, fontWeight: '600' }]} numberOfLines={1}>
                  {busy === channel.id ? 'Sending…' : sent ? 'Shared' : channel.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <MockNotice>
          Sharing is simulated in this build. Once previews are generated server-side, these buttons
          hand off the real image to the system share sheet.
        </MockNotice>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.lg },
  channel: { width: '31%', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radii.md },
  channelIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
