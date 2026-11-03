import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ServerReport } from '../adapters/reportsApi';
import { ComposeScreen } from './compose/ComposeScreen';
import { Icon, type IconName } from './Icon';
import { OutboxScreen } from './outbox/OutboxScreen';
import { OnServerScreen } from './server/OnServerScreen';
import { ServerReportScreen } from './server/ServerReportScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { useTheme } from './theme';

export type RootStackParams = {
  Tabs: undefined;
  Compose: undefined;
  ServerReport: { report: ServerReport };
};

export type TabParams = {
  Outbox: undefined;
  OnServer: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

const TAB_ICONS: Record<keyof TabParams, IconName> = {
  Outbox: 'outbox',
  OnServer: 'cloudCheck',
  Settings: 'sliders',
};

// Material-style active indicator: a soft pill behind the icon.
function TabIcon({
  name,
  focused,
}: {
  name: keyof TabParams;
  focused: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[styles.pill, focused && { backgroundColor: t.color.primarySoft }]}
    >
      <Icon
        name={TAB_ICONS[name]}
        color={focused ? t.color.primary : t.color.muted}
      />
    </View>
  );
}

function tabIcon(name: keyof TabParams) {
  return ({ focused }: { focused: boolean }) => (
    <TabIcon name={name} focused={focused} />
  );
}

function Tabs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.color.ink,
        tabBarInactiveTintColor: t.color.muted,
        tabBarLabelStyle: { fontFamily: t.font.semibold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: t.color.surface,
          borderTopColor: t.color.line,
          height: 72 + insets.bottom,
          paddingTop: 8,
        },
        tabBarIcon: tabIcon(route.name),
      })}
    >
      <Tab.Screen name="Outbox" component={OutboxScreen} />
      <Tab.Screen
        name="OnServer"
        component={OnServerScreen}
        options={{ title: 'On server' }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export function Navigation() {
  const t = useTheme();
  // React Navigation paints its own backgrounds; match them so nothing flashes white in dark mode.
  const navTheme = useMemo<NavTheme>(() => {
    const base = t.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: t.color.primary,
        background: t.color.bg,
        card: t.color.surface,
        text: t.color.ink,
        border: t.color.line,
      },
    };
  }, [t]);

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen
          name="Compose"
          component={ComposeScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="ServerReport" component={ServerReportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 64,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
