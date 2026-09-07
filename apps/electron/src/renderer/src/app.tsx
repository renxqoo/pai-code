import { ThemeProvider } from '@/components/theme-provider';
import { WorkspaceScreen } from '@/screens/workspace-screen';

export function App(): React.JSX.Element {
  return (
    <ThemeProvider defaultTheme="system" storageKey="pai-theme">
      <WorkspaceScreen />
    </ThemeProvider>
  );
}
