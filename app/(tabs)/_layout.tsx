import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useGeneration } from '@/state/GenerationContext';
import { colors, type } from '@/theme/theme';

export default function TabsLayout() {
  const { processingCount } = useGeneration();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { ...type.caption, fontWeight: '700', marginTop: 2 },
        tabBarStyle: styles.bar,
        tabBarItemStyle: { paddingTop: 6 },
        tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Try on',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="styles"
        options={{
          title: 'Styles',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          // Counts previews still generating in the background.
          tabBarBadge: processingCount > 0 ? processingCount : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={21} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.select({ ios: 86, default: 66 }),
    paddingBottom: Platform.select({ ios: 26, default: 8 }),
  },
});
