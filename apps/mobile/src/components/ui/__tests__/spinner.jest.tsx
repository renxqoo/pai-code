import { act, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { AccessibilityInfo } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

describe('Spinner 旋转加载指示', () => {
  beforeEach(() => {
    // RN jest 预设的 isReduceMotionEnabled 是空桩（返回 undefined），补齐成真实 API 形状（Promise）
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  it('默认挂 testID『loading-spinner』（测试全局锚点），显式 testID 覆盖之', async () => {
    const fallback = await render(<Spinner />);
    expect(fallback.getAllByTestId('loading-spinner', { includeHiddenElements: true })).toHaveLength(1);

    const named = await render(<Spinner testID="dock-spinner" />);
    expect(named.queryAllByTestId('loading-spinner', { includeHiddenElements: true })).toHaveLength(0);
    expect(named.getByTestId('dock-spinner', { includeHiddenElements: true })).toBeTruthy();
  });

  it('装饰位对读屏隐藏（读屏不报加载噪音）', async () => {
    const view = await render(<Spinner />);
    const [node] = view.getAllByTestId('loading-spinner', { includeHiddenElements: true });
    expect(node?.props.accessibilityElementsHidden).toBe(true);
  });

  it('系统「减弱动态效果」降级为静态呈现（不启动循环动画）', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const view = await render(<Spinner />);
    await act(async () => {});
    expect(view.getByTestId('loading-spinner', { includeHiddenElements: true })).toBeTruthy();
    spy.mockRestore();
  });

  it('卸载即停转（动画循环随卸载释放）', async () => {
    const view = await render(<Spinner />);
    expect(() => view.unmount()).not.toThrow();
  });
});
