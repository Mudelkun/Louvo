import { Ionicons } from '@expo/vector-icons';
import { BlurView, type BlurTint } from 'expo-blur';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library/legacy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing, type } from '@/theme/theme';

export type PickerMode = 'photos' | 'camera';

export interface PhotoPickerSheetProps {
  /** `null` keeps the sheet closed. */
  mode: PickerMode | null;
  onChangeMode: (mode: PickerMode) => void;
  onClose: () => void;
  onPicked: (uri: string) => void;
}

const { height: WINDOW_H, width: WINDOW_W } = Dimensions.get('window');
const SHEET_H = Math.min(Math.round(WINDOW_H * 0.62), 620);
/** Drag further than this and the sheet closes instead of springing back. */
const DISMISS_AT = 110;
const COLUMNS = 3;
const GAP = 2;
const CELL = Math.floor((WINDOW_W - GAP * (COLUMNS - 1)) / COLUMNS);
const PAGE = 48;
const CONTROL = 46;

/** One spring shared by everything that moves, so the sheet feels like one object. */
const SPRING = { useNativeDriver: true, damping: 24, stiffness: 260, mass: 0.9 } as const;
const SPRING_SNAP = { useNativeDriver: true, damping: 16, stiffness: 340, mass: 0.6 } as const;

function tap(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => undefined);
}

/**
 * The in-app camera / recent-photos sheet.
 *
 * Both photo sources open here rather than in a full-screen OS picker, so the
 * app stays visible behind the sheet the way the ChatGPT attachment sheet does.
 * The native picker is still one tap away ("All Photos") for anything the
 * recents grid does not cover, and is the only path on web.
 *
 * All chrome floats over the content as translucent glass, so the controls read
 * as a layer above the photo rather than a bar cutting into it.
 */
export function PhotoPickerSheet({ mode, onChangeMode, onClose, onPicked }: PhotoPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const visible = mode !== null;
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(translateY, { ...SPRING, toValue: 0 }).start();
      return;
    }
    Animated.timing(translateY, { toValue: SHEET_H, duration: 210, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setMounted(false);
      },
    );
  }, [visible, translateY]);

  // Dragging the sheet down thins the scrim with it, so the app behind reappears
  // gradually instead of snapping back at the end of the gesture.
  const scrim = translateY.interpolate({
    inputRange: [0, SHEET_H],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Only the grabber drags — the grid below it needs its own vertical scroll.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4,
      onPanResponderMove: (_e, g) => {
        // Pulling up past the top gets progressively stiffer rather than free.
        translateY.setValue(g.dy > 0 ? g.dy : g.dy / 4);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_AT || g.vy > 1.2) {
          tap();
          onClose();
          return;
        }
        Animated.spring(translateY, { ...SPRING, toValue: 0, velocity: g.vy }).start();
      },
    }),
  ).current;

  if (!mounted) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { height: SHEET_H, transform: [{ translateY }] }]}>
        <Fade key={mode ?? 'none'}>
          {mode === 'camera' ? (
            <CameraPane
              onCaptured={onPicked}
              onClose={onClose}
              onUsePhotos={() => onChangeMode('photos')}
              bottomInset={insets.bottom}
            />
          ) : (
            <PhotosPane
              onPicked={onPicked}
              onOpenCamera={() => onChangeMode('camera')}
              bottomInset={insets.bottom}
            />
          )}
        </Fade>

        {mode === 'camera' ? (
          /* The preview runs edge to edge, so the drag zone is invisible. */
          <View {...pan.panHandlers} pointerEvents="box-only" style={styles.grabOverlay} />
        ) : (
          <View {...pan.panHandlers} style={styles.grabArea}>
            <View style={styles.grabber} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/* ---------------------------------------------------------------- photos -- */

function PhotosPane({
  onPicked,
  onOpenCamera,
  bottomInset,
}: {
  onPicked: (uri: string) => void;
  onOpenCamera: () => void;
  bottomInset: number;
}) {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[] | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    let cancelled = false;
    if (!permission?.granted) return;
    MediaLibrary.getAssetsAsync({
      first: PAGE,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [MediaLibrary.SortBy.creationTime],
    })
      .then((page) => {
        if (!cancelled) setAssets(page.assets);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [permission?.granted]);

  const select = useCallback(
    async (asset: MediaLibrary.Asset) => {
      tap();
      onPicked(await resolveUri(asset));
    },
    [onPicked],
  );

  const openNativePicker = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled) onPicked(result.assets[0].uri);
  }, [onPicked]);

  return (
    <View style={styles.pane}>
      {!permission || (!permission.granted && permission.canAskAgain) ? (
        <Centered>
          <ActivityIndicator color={colors.accent} />
        </Centered>
      ) : !permission.granted ? (
        <Centered>
          <Ionicons name="images-outline" size={30} color={colors.muted} />
          <Text style={[type.bodyStrong, { color: colors.ink }]}>Photo access is off</Text>
          <Text style={[type.caption, styles.centeredNote]}>
            Turn it on in Settings to browse your recent photos here, or pick one with the system picker.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.linkBtn}>
            <Text style={[type.label, { color: colors.accent }]}>Open Settings</Text>
          </Pressable>
        </Centered>
      ) : assets === null ? (
        <Centered>
          <ActivityIndicator color={colors.accent} />
        </Centered>
      ) : assets.length === 0 ? (
        <Centered>
          <Ionicons name="images-outline" size={30} color={colors.muted} />
          <Text style={[type.caption, styles.centeredNote]}>No photos yet — take one with the camera.</Text>
        </Centered>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{
            gap: GAP,
            paddingTop: spacing.xxl,
            paddingBottom: CONTROL + spacing.xl + bottomInset,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <Cell asset={item} onPress={() => select(item)} />}
        />
      )}

      <View style={[styles.floatingBar, { paddingBottom: bottomInset || spacing.lg }]} pointerEvents="box-none">
        <GlassPill icon="camera-outline" label="Camera" onPress={onOpenCamera} />
        <GlassPill icon="albums-outline" label="All Photos" onPress={openNativePicker} />
      </View>
    </View>
  );
}

function Cell({ asset, onPress }: { asset: MediaLibrary.Asset; onPress: () => void }) {
  const press = usePressScale(0.94);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Use this photo"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={[styles.cell, press.style]}>
        <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
      </Animated.View>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- camera -- */

function CameraPane({
  onCaptured,
  onClose,
  onUsePhotos,
  bottomInset,
}: {
  onCaptured: (uri: string) => void;
  /** The chevron leaves the picker entirely rather than stepping back a pane. */
  onClose: () => void;
  onUsePhotos: () => void;
  bottomInset: number;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [menuOpen, setMenuOpen] = useState(false);
  const [shooting, setShooting] = useState(false);
  const camera = useRef<CameraView>(null);
  const shutterFlash = useRef(new Animated.Value(0)).current;
  const menuItems = useRef([new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // Opening runs bottom-up, closing top-down — the stack folds back into the button.
  useEffect(() => {
    const springs = menuItems.map((value) =>
      Animated.spring(value, { ...SPRING_SNAP, toValue: menuOpen ? 1 : 0 }),
    );
    Animated.stagger(50, menuOpen ? springs : springs.reverse()).start();
  }, [menuOpen, menuItems]);

  const capture = useCallback(async () => {
    if (shooting) return;
    setShooting(true);
    tap(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(shutterFlash, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shutterFlash, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) onCaptured(photo.uri);
    } catch {
      // Leaving the sheet open lets the user simply try again.
    } finally {
      setShooting(false);
    }
  }, [onCaptured, shooting, shutterFlash]);

  if (!permission || (!permission.granted && permission.canAskAgain)) {
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  }

  if (!permission.granted) {
    return (
      <Centered>
        <Ionicons name="camera-outline" size={30} color={colors.muted} />
        <Text style={[type.bodyStrong, { color: colors.ink }]}>Camera access is off</Text>
        <Text style={[type.caption, styles.centeredNote]}>
          Turn it on in Settings, or pick a photo from your library instead.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.linkBtn}>
          <Text style={[type.label, { color: colors.accent }]}>Open Settings</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onUsePhotos} style={styles.linkBtn}>
          <Text style={[type.label, { color: colors.muted }]}>Pick a photo instead</Text>
        </Pressable>
      </Centered>
    );
  }

  const rise = (value: Animated.Value) => ({
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
    ],
  });

  return (
    <View style={styles.cameraPane}>
      {/* The front lens previews mirrored, the way every selfie camera does, but
          hands back an unmirrored file — so the photo the user gets is the reverse
          of the one they framed. `mirror` keeps the capture matching the preview;
          native applies it to the front lens only. */}
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} flash={flash} mirror />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: shutterFlash }]}
      />

      {menuOpen ? (
        <Pressable
          accessibilityLabel="Close options"
          style={StyleSheet.absoluteFill}
          onPress={() => setMenuOpen(false)}
        />
      ) : null}

      <View
        style={[styles.cameraMenu, { bottom: (bottomInset || spacing.lg) + CONTROL + spacing.xl }]}
        pointerEvents={menuOpen ? 'box-none' : 'none'}
      >
        <Animated.View style={rise(menuItems[1])}>
          <GlassButton
            icon={flash === 'on' ? 'flash' : 'flash-off'}
            label={flash === 'on' ? 'Turn flash off' : 'Turn flash on'}
            active={flash === 'on'}
            onPress={() => {
              tap();
              setFlash((f) => (f === 'on' ? 'off' : 'on'));
            }}
          />
        </Animated.View>
        <Animated.View style={rise(menuItems[0])}>
          <GlassButton
            icon="camera-reverse-outline"
            label="Flip camera"
            onPress={() => {
              tap();
              setFacing((f) => (f === 'front' ? 'back' : 'front'));
            }}
          />
        </Animated.View>
      </View>

      <View style={[styles.cameraBar, { paddingBottom: bottomInset || spacing.lg }]} pointerEvents="box-none">
        <GlassButton icon="chevron-back" label="Close camera" onPress={onClose} />
        <Shutter onPress={capture} disabled={shooting} />
        <GlassButton
          icon={menuOpen ? 'close' : 'ellipsis-horizontal'}
          label={menuOpen ? 'Hide camera options' : 'Camera options'}
          onPress={() => {
            tap();
            setMenuOpen((open) => !open);
          }}
        />
      </View>

      {flash === 'on' && !menuOpen ? (
        <Fade style={[styles.flashHint, { bottom: (bottomInset || spacing.lg) + CONTROL + spacing.md }]}>
          <Ionicons name="flash" size={13} color={colors.onDark} />
          <Text style={[type.caption, { color: colors.onDark }]}>Flash on</Text>
        </Fade>
      ) : null}
    </View>
  );
}

function Shutter({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const ring = usePressScale(0.9);
  const inner = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Take photo"
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        ring.onPressIn();
        Animated.spring(inner, { ...SPRING_SNAP, toValue: 0.82 }).start();
      }}
      onPressOut={() => {
        ring.onPressOut();
        Animated.spring(inner, { ...SPRING_SNAP, toValue: 1 }).start();
      }}
    >
      <Animated.View style={[styles.shutter, ring.style]}>
        <Animated.View style={[styles.shutterInner, { transform: [{ scale: inner }] }]} />
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ glass - */

const GLASS_TINT: Record<'dark' | 'light', BlurTint> = {
  dark: Platform.OS === 'ios' ? 'systemThinMaterialDark' : 'dark',
  light: Platform.OS === 'ios' ? 'systemThinMaterialLight' : 'light',
};

/**
 * iOS 26 renders real Liquid Glass — refraction, edge bending, the lot — which
 * no stack of blurs and gradients imitates convincingly.
 *
 * It needs a binary compiled against the iOS 26 SDK, so it is unavailable in
 * Expo Go no matter what the OS reports; there the effect draws blank and the
 * controls disappear. Fall back to the hand-built material in that case and in
 * every other unsupported environment.
 */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const NATIVE_GLASS = (() => {
  try {
    return Platform.OS === 'ios' && !IN_EXPO_GO && isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

/**
 * A single translucent layer.
 *
 * Native path: `GlassView`, interactive so it responds to touch the way system
 * controls do. Fallback: a strong blur, a sheen across the body, and a rim that
 * is brightest along the top edge.
 */
function Glass({
  radius,
  tone = 'dark',
  tint,
  style,
  children,
}: {
  radius: number;
  tone?: 'dark' | 'light';
  /** Colours the glass itself — how the system marks a control as active. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const dark = tone === 'dark';

  if (NATIVE_GLASS) {
    return (
      <View style={[{ borderRadius: radius }, styles.glassShadow, style]}>
        {/* A thin floor under the effect so the icon still reads where the glass
            renders almost clear. Kept faint — Apple's guidance is not to stack
            layers on glass, and the effect does the work here. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              backgroundColor: dark ? 'rgba(24,21,19,0.12)' : 'rgba(255,255,255,0.16)',
            },
          ]}
        />
        <GlassView
          glassEffectStyle="regular"
          colorScheme={dark ? 'dark' : 'light'}
          tintColor={tint}
          isInteractive
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
        {children}
      </View>
    );
  }

  return (
    <View style={[{ borderRadius: radius }, styles.glassShadow, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView
          intensity={dark ? 55 : 75}
          tint={GLASS_TINT[tone]}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={
            dark
              ? ['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.16)']
              : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.34)', 'rgba(255,255,255,0.46)']
          }
          locations={[0, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.rim,
          {
            borderRadius: radius,
            borderColor: dark ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.75)',
            borderTopColor: dark ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.98)',
          },
        ]}
      />
      {tint ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: tint, opacity: 0.45 }]} />
      ) : null}
      {children}
    </View>
  );
}

function GlassButton({
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
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <Glass radius={CONTROL / 2} tint={active ? colors.accent : undefined} style={styles.control}>
          <Ionicons name={icon} size={22} color={colors.onDark} />
        </Glass>
      </Animated.View>
    </Pressable>
  );
}

function GlassPill({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const press = usePressScale(0.95);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <Glass radius={radii.pill} tone="light" style={styles.pill}>
          <Ionicons name={icon} size={17} color={colors.ink} />
          <Text style={[type.label, { color: colors.ink }]}>{label}</Text>
        </Glass>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ bits -- */

function usePressScale(to = 0.9) {
  const scale = useRef(new Animated.Value(1)).current;
  return useMemo(
    () => ({
      style: { transform: [{ scale }] },
      onPressIn: () => Animated.spring(scale, { ...SPRING_SNAP, toValue: to }).start(),
      onPressOut: () => Animated.spring(scale, { ...SPRING_SNAP, toValue: 1 }).start(),
    }),
    [scale, to],
  );
}

/** Fades and settles its children in — used wherever content swaps in place. */
function Fade({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(value, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [value]);

  return (
    <Animated.View
      style={[
        style ?? styles.pane,
        {
          opacity: value,
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

/** iOS hands back `ph://` ids; the rest of the app expects a readable file uri. */
async function resolveUri(asset: MediaLibrary.Asset): Promise<string> {
  if (Platform.OS !== 'ios') return asset.uri;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    return info.localUri ?? asset.uri;
  } catch {
    return asset.uri;
  }
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
    shadowColor: '#120E09',
    shadowOpacity: 0.3,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  grabArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  grabber: { width: 40, height: 4, borderRadius: radii.pill, backgroundColor: colors.hairlineStrong },
  grabOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 28 },
  pane: { flex: 1 },
  cell: { width: CELL, height: CELL, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  floatingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 40,
  },
  control: { width: CONTROL, height: CONTROL, alignItems: 'center', justifyContent: 'center' },
  rim: { borderWidth: 0.8 },
  glassShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl },
  centeredNote: { color: colors.muted, textAlign: 'center' },
  linkBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cameraPane: { flex: 1, backgroundColor: '#000' },
  cameraBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
  },
  cameraMenu: {
    position: 'absolute',
    right: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  flashHint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: colors.onDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.onDark },
});
