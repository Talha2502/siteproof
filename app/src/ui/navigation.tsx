import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useOutbox } from '../app/ServicesProvider';
import { Button } from './Button';
import { ComposeScreen } from './compose/ComposeScreen';
import { theme } from './theme';

export type RootStackParams = {
  Home: undefined;
  Compose: undefined;
};

const Stack = createNativeStackNavigator<RootStackParams>();

// Minimal list for now; replaced by the Outbox screen.
function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { reports } = useOutbox();
  return (
    <View style={styles.screen}>
      <FlatList
        data={[...reports].reverse()}
        keyExtractor={report => report.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={theme.text.body} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={theme.text.small}>
              {item.status} · {item.images.length} photos
            </Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <Button
          label="New report"
          onPress={() => navigation.navigate('Compose')}
        />
      </View>
    </View>
  );
}

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
          name="Home"
          component={HomeScreen}
          options={{ title: 'SiteProof' }}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: theme.space.md, gap: theme.space.sm },
  item: {
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    borderRadius: theme.radius.md,
  },
  footer: { padding: theme.space.md },
});
