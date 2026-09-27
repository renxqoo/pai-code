import * as React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import type { ReactNode } from 'react';

import { RenderGuard } from '@/features/chat/markdown/render-guard';

function Boom(): ReactNode {
  throw new Error('render boom');
}

describe('RenderGuard（T56 §2 不变量 3：渲染异常兜底）', () => {
  it('子树渲染抛错降级 fallback，不炸整屏', async () => {
    const view = await render(
      <RenderGuard fallback={<Text>兜底文本</Text>}>
        <Boom />
      </RenderGuard>,
    );
    expect(view.getByText('兜底文本')).toBeTruthy();
  });

  it('子树正常渲染时不介入', async () => {
    const view = await render(
      <RenderGuard fallback={<Text>兜底文本</Text>}>
        <Text>正常内容</Text>
      </RenderGuard>,
    );
    expect(view.getByText('正常内容')).toBeTruthy();
    expect(view.queryByText('兜底文本')).toBeNull();
  });
});
