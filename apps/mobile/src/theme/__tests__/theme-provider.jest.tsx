import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { Text } from 'react-native';
import { darkColors, lightColors } from '@/theme/colors';
import { ThemeProvider } from '@/theme/theme-provider';
import { useAppTheme } from '@/theme/theme-context';
import { TestWrapper } from '@/test/test-wrapper';

function ThemeProbe() {
  const { colors, isDark } = useAppTheme();
  return <Text testID="theme">{`${colors.text}-${String(isDark)}`}</Text>;
}

describe('ThemeProvider', () => {
  it.each([
    ['light', lightColors.text, 'false'],
    ['dark', darkColors.text, 'true'],
  ] as const)('applies %s preference', async (preference, color, dark) => {
    const view = await render(<TestWrapper><ThemeProvider preference={preference}><ThemeProbe /></ThemeProvider></TestWrapper>);
    expect(view.getByTestId('theme').props.children).toBe(`${color}-${dark}`);
  });

  it('follows the system light appearance', async () => {
    const view = await render(<TestWrapper><ThemeProvider preference="system"><ThemeProbe /></ThemeProvider></TestWrapper>);
    expect(view.getByTestId('theme').props.children).toBe(`${lightColors.text}-false`);
  });
});
