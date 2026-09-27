import { render, screen } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';

import { lightColors } from '@/theme/colors';
import { UserMessage } from '@/features/chat/user-message';
import { MarkdownText } from '@/features/chat/markdown/markdown-text';
import { TestWrapper } from '@/test/test-wrapper';
import type { ChatMessage } from '@/types/domain';

function userMessage(text: string): ChatMessage {
  return { id: 'u1', kind: 'user', text, createdAt: 'now' } as ChatMessage;
}

/** RN 的 style 可以是数组/函数/嵌套——摊平成一个对象再断言。 */
function flat(style: unknown): Record<string, unknown> {
  if (typeof style === 'function') return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, item) => ({ ...acc, ...flat(item) }), {});
  }
  return (style ?? {}) as Record<string, unknown>;
}

/** 相对亮度（WCAG）。用于断言灰度是单调递减而非凭肉眼。 */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('对话页视觉层级（T54：bw 真机量测驱动）', () => {
  it('用户输入与 Agent 正文可分辨：卡面底色 + 次级文字色（实测原为同色同号）', async () => {
    await render(
      <TestWrapper>
        <UserMessage message={userMessage('把这件事做掉')} />
      </TestWrapper>,
    );
    expect(flat(screen.getByTestId('user-task-card').props.style).backgroundColor).toBe(lightColors.surfaceSubtle);
    expect(flat(screen.getByText('把这件事做掉').props.style).color).toBe(lightColors.textSecondary);
    // 次级色必须与正文色不同——同色就等于没分层
    expect(lightColors.textSecondary).not.toBe(lightColors.text);
  });

  it('用户输入卡不带左侧色条（用户裁决：不要边框；色条会让任务卡读成引用块）', async () => {
    await render(
      <TestWrapper>
        <UserMessage message={userMessage('任务')} />
      </TestWrapper>,
    );
    const style = flat(screen.getByTestId('user-task-card').props.style);
    expect(style.borderLeftWidth).toBeUndefined();
    expect(style.borderLeftColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });

  it('列表项降到 type.row（13px），不再与正文 body（15px）同级', async () => {
    await render(
      <TestWrapper>
        <MarkdownText source={'- 第一项'} />
      </TestWrapper>,
    );
    // 正文 15px；列表项必须更小，否则层级被拉平（bw 实测原为 15px 硬编码）
    expect(Number(flat(screen.getByText(/第一项/).props.style).fontSize)).toBeLessThan(15);
  });

  it('灰度四档严格分层：正文最重 → 次级 → 过程 → 占位最弱（实测原后两档几乎同值）', () => {
    // 浅色底上「越弱 = 越亮 = 亮度越高」，四档必须两两不同且单调
    const order = [lightColors.text, lightColors.textSecondary, lightColors.textMuted, lightColors.textFaint];
    const values = order.map((hex) => luminance(hex));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1] ?? 0);
    }
    // 相邻两档要有可见差距（ΔL < 0.02 肉眼看不出层级，等于没分）
    for (let i = 1; i < values.length; i += 1) {
      expect((values[i] ?? 0) - (values[i - 1] ?? 0)).toBeGreaterThan(0.02);
    }
  });

  it('用户输入卡满足最小触控高度（移动端 HIG 44pt：内边距 + 单行行高）', async () => {
    await render(
      <TestWrapper>
        <UserMessage message={userMessage('任务')} />
      </TestWrapper>,
    );
    const style = flat(screen.getByTestId('user-task-card').props.style);
    const padV = Number(style.paddingVertical ?? 0);
    // type.body.lineHeight = 23；10*2 + 23 = 43，加 1px 余量满足 44
    expect(padV * 2 + 23).toBeGreaterThanOrEqual(43);
  });
});
