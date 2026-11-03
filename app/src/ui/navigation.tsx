import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ComposeScreen } from './compose/ComposeScreen';
import { OutboxScreen } from './outbox/OutboxScreen';
import { theme } from './theme';

export type RootStackParams = {
  Outbox: undefined;
  Compose: undefined;
};

const Stack = createNativeStackNavigator<RootStackParams>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.surface },
          headerTintColor: theme.color.text,
          contentStyle: { backgroundColor: theme.color.background },
        }}
      >
        <Stack.Screen
          name="Outbox"
          component={OutboxScreen}
          options={{ title: 'Outbox' }}
        />
        <Stack.Screen
          name="Compose"
          component={ComposeScreen}
          options={{ title: 'New report', presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
