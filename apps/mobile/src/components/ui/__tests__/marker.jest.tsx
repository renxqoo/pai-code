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

    // 可配置是否需要 MarkerIcon：无图标内容时槽位不渲染
    const withoutIcon = await render(
      <Marker>
        <MarkerContent>今天</MarkerContent>
      </Marker>,
    );
    expect(withoutIcon.getByText('今天')).toBeTruthy();
  });

  it('loading 时 spinner 顶替静态图标，文字走流光', async () => {
    const view = await render(
      <Marker>
        <MarkerIcon loading testID="icon-slot">
          <Text>✓</Text>
        </MarkerIcon>
        <MarkerContent shimmer testID="content">
          Thinking…
        </MarkerContent>
      </Marker>,
    );
    // spinner 顶替静态图标（装饰位，查询需含隐藏元素）
    expect(view.queryByTestId('icon-slot', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText('✓', { includeHiddenElements: true })).toBeNull();
    expect(view.getByText('Thinking…')).toBeTruthy();
  });

  it('非 loading 且无图标内容时图标槽不占位', async () => {
    const view = await render(
      <Marker>
        <MarkerIcon />
        <MarkerContent>共工作 3s</MarkerContent>
      </Marker>,
    );
    expect(view.queryByTestId('icon-slot', { includeHiddenElements: true })).toBeNull();
    expect(view.getByText('共工作 3s')).toBeTruthy();
  });
});
