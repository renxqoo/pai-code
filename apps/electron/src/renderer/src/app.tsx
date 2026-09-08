import * as React from 'react';

import { ThemeProvider } from '@/components/theme-provider';
import { WorkspaceScreen } from '@/screens/workspace-screen';
import { getLocale, type Locale } from '@/strings';

export function App(): React.JSX.Element {
  // 语言切换经根级 key 重挂载工作区（copy 按访问解析，需穿透 memo 树）
  const [locale, setLocaleState] = React.useState<Locale>(() => getLocale());
  React.useEffect(() => {
    const onChange = (): void => setLocaleState(getLocale());
    window.addEventListener('pai-locale', onChange);
    return () => window.removeEventListener('pai-locale', onChange);
  }, []);
  return (
    <ThemeProvider defaultTheme="system" storageKey="pai-theme">
      <WorkspaceScreen key={locale} />
    </ThemeProvider>
  );
}
