import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { render } from '@/testing/render';
import { NoticeStrip } from '../notice-strip';
import { uiStore } from '@/ui/ui-store';
import { store as liveStore } from '@/live/workspace-runtime';

/**
 * 通知条与模态覆盖层的层级纪律：通知条 z-[60] 高于命令面板遮罩 z-50，
 * 面板（模态 + 焦点陷阱）打开期间必须整体压制——键盘不可达而鼠标可点
 * 的浮层是分裂交互面，矮窗口下还会压进面板输入区。引导屏（无面板）不压制。
 */

const SAMPLE = [{ id: 'n1', text: '操作失败，请重试。' }];

afterEach(() => {
  liveStore.getState().reset();
  uiStore.getState().reset();
});

function stripInDom(): boolean {
  return document.body.querySelector('[data-slot="notice-strip"]') !== null;
}

describe('NoticeStrip 模态压制', () => {
  test('常规态渲染通知条', () => {
    liveStore.setState({ notices: SAMPLE });
    const view = render(<NoticeStrip notices={liveStore.getState().notices} onDismiss={() => undefined} suppressed={false} />);
    expect(stripInDom()).toBe(true);
    view.unmount();
  });

  test('命令面板开着：通知条整体压制（不浮在遮罩之上）', () => {
    liveStore.setState({ notices: SAMPLE });
    uiStore.getState().openCommandPanel();
    const view = render(<NoticeStrip notices={liveStore.getState().notices} onDismiss={() => undefined} suppressed={true} />);
    expect(stripInDom()).toBe(false);
    view.unmount();
  });

  test('面板关闭后恢复（同一批通知不丢）', () => {
    liveStore.setState({ notices: SAMPLE });
    const view = render(<NoticeStrip notices={liveStore.getState().notices} onDismiss={() => undefined} suppressed={false} />);
    expect(stripInDom()).toBe(true);
    view.unmount();
  });
});
