import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServicesProvider } from './src/app/ServicesProvider';
import { Navigation } from './src/ui/navigation';

function App() {
  return (
    <SafeAreaProvider>
      {/* Every screen starts with the dark brand band (or a photo), in both themes. */}
      <StatusBar barStyle="light-content" />
      <ServicesProvider>
        <Navigation />
      </ServicesProvider>
    </SafeAreaProvider>
  );
}

export default App;
