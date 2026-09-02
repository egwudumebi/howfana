import { useEffect, useMemo } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SoftPressable } from '@/components/SoftPressable';
import { useIdentity } from '@/providers/IdentityProvider';
import { useColors } from '@/providers/ThemeProvider';

function CreateTabButton({
  onPress,
}: {
  onPress?: (...args: never[]) => void;
}) {
  const colors = useColors();
  return (
    <SoftPressable
      accessibilityRole="button"
      accessibilityLabel="Create"
      onPress={onPress as (() => void) | undefined}
      style={[styles.createBtn, { backgroundColor: colors.accent }]}
    >
      <Ionicons name="add" size={30} color="#fff" />
    </SoftPressable>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  const { ready, isAuthenticated } = useIdentity();
  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: colors.chrome,
      borderTopColor: colors.divider,
      height: 64,
      paddingBottom: 8,
      paddingTop: 6,
    }),
    [colors],
  );

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/');
    }
  }, [ready, isAuthenticated, router]);

  if (!ready || !isAuthenticated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble' : 'chatbubble-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: (props) => <CreateTabButton onPress={props.onPress} />,
        }}
      />
      <Tabs.Screen
        name="peers"
        options={{
          title: 'People',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          href: null,
          title: 'Reels',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createBtn: {
    top: -12,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B85C38',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
