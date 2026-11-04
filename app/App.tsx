import { StatusBar } from 'react-native';
import { useTheme } from './src/ui/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServicesProvider } from './src/app/ServicesProvider';
import { Navigation } from './src/ui/navigation';

function App() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      {/* Headers sit on the page background, so the status bar follows the theme. */}
      <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} />
      <ServicesProvider>
        <Navigation />
      </ServicesProvider>
    </SafeAreaProvider>
  );
}

export default App;
