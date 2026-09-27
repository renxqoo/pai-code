import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import * as React from 'react';
import { Text } from 'react-native';
import { Marker } from '@/components/ui/marker';
import { MarkerContent } from '@/components/ui/marker-content';
import { MarkerIcon } from '@/components/ui/marker-icon';

describe('Marker 族（shadcn marker 同构）', () => {
  it('组合图标槽与文字槽，图标可省略', async () => {
    const withIcon = await render(
      <Marker>
        <MarkerIcon>
          <Text>✓</Text>
        </MarkerIcon>
        <MarkerContent>读取配置</MarkerContent>
      </Marker>,
    );
    expect(withIcon.getByText('✓', { includeHiddenElements: true })).toBeTruthy();
    expect(withIcon.getByText('读取配置')).toBeTruthy();

    // 可整体省略 MarkerIcon：调用方不要图标列就不渲染图标槽
    const withoutIcon = await render(
      <Marker>
        <MarkerContent>今天</MarkerContent>
      </Marker>,
    );
    expect(withoutIcon.getByText('今天')).toBeTruthy();
  });

  it('运行态由文字流光承载，图标不被顶替（用户裁决：旋转 loading 只在底部输入区）', async () => {
    const view = await render(
      <Marker>
        <MarkerIcon testID="icon-slot">
          <Text>✓</Text>
        </MarkerIcon>
        <MarkerContent shimmer testID="content">
          Thinking…
        </MarkerContent>
      </Marker>,
    );
    // 症状回归：旧实现 spinner 顶替静态图标，行首只剩旋转图标
    expect(view.getByText('✓', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryAllByTestId('loading-spinner', { includeHiddenElements: true })).toHaveLength(0);
    expect(view.getByText('Thinking…')).toBeTruthy();
  });

  it('无图标内容时图标槽不渲染（用户裁决：没有图标就不占位空间）', async () => {
    const view = await render(
      <Marker>
        <MarkerIcon testID="icon-slot" />
        <MarkerContent>共工作 3s</MarkerContent>
      </Marker>,
    );
    expect(view.queryByTestId('icon-slot', { includeHiddenElements: true })).toBeNull();
    expect(view.getByText('共工作 3s')).toBeTruthy();
  });
});
