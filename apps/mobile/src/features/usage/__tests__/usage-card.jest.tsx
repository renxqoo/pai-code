import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { UsageCard } from '@/features/usage/usage-card';

describe('UsageCard', () => {
  it('renders model totals and percentages', async () => {
    const view = await render(<UsageCard />);
    expect(view.getByText('GPT-5.2 Codex')).toBeTruthy();
    expect(view.getByText('79.6K · 62%')).toBeTruthy();
    expect(view.getByText('Claude Sonnet 5')).toBeTruthy();
    expect(view.getByText('Gemini 3 Pro')).toBeTruthy();
  });
});
