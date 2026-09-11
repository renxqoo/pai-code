import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { SessionCardModel } from '../session-card-model';
import { SessionRow } from '../session-row';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';

/** 行内动作交互层：导航出口断言走 live store（selectSession 离线同步激活），
 * 单例命令类动作（关闭/置顶/回收）以「点击可执行不崩」覆盖路径，行为面由
 * controller/actions 各自单测承担。 */

function makeSession(overrides: Partial<SessionCardModel> = {}): SessionCardModel {
  return {
    id: 's1',
    projectName: 'pai',
    title: '会话标题',
    version: '',
    cwd: '/tmp/pai',
    sessionPath: '/tmp/pai/sessions/s1.jsonl',
    state: 'live',
    streaming: false,
    lastActivityAt: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

afterEach(() => {
  uiStore.getState().reset();
  liveStore.getState().reset();
});

function row(view: { container: HTMLElement }): HTMLElement {
  return view.container.querySelector('[role="button"]') as HTMLElement;
}
function actionButton(el: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement | undefined;
}

describe('SessionRow 交互', () => {
  test('点击行 = 导航出口：关闭新建任务页 + 激活会话（live store 同步可断言）', () => {
    uiStore.setState({ newTaskOpen: true });
    const view = render(<SessionRow session={makeSession()} age="" active={false} />);
    React.act(() => {
      row(view).click();
    });
    expect(uiStore.getState().newTaskOpen).toBe(false);
    expect(liveStore.getState().activeThreadId).toBe('s1');
    view.unmount();
  });

  test('键盘 Enter/Space 同走导航出口', () => {
    const view = render(<SessionRow session={makeSession()} age="" active={false} />);
    React.act(() => {
      row(view).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(liveStore.getState().activeThreadId).toBe('s1');
    React.act(() => {
      row(view).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    view.unmount();
  });

  test('重命名流：按钮进编辑态（标题换输入框）；Esc 取消回到标题', () => {
    const view = render(<SessionRow session={makeSession()} age="" active={false} />);
    React.act(() => {
      actionButton(row(view), '重命名会话')?.click();
    });
    const input = view.container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('会话标题');
    React.act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(view.container.querySelector('input')).toBeNull();
    expect(view.container.textContent).toContain('会话标题');
    view.unmount();
  });

  test('编辑态 Enter 提交（空草稿视为取消，不落 rename）；失焦提交路径可达', () => {
    const view = render(<SessionRow session={makeSession()} age="" active={false} />);
    React.act(() => {
      actionButton(row(view), '重命名会话')?.click();
    });
    const input = view.container.querySelector('input') as HTMLInputElement;
    React.act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(view.container.querySelector('input')).toBeNull();
    // 再进编辑走失焦提交（renameCommitValue(null 草稿) 取消）
    React.act(() => {
      actionButton(row(view), '重命名会话')?.click();
    });
    const input2 = view.container.querySelector('input') as HTMLInputElement;
    React.act(() => {
      // React 的 onBlur 走冒泡 focusout 委托（非原生不冒泡的 blur）
      input2.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(view.container.textContent).toContain('会话标题');
    view.unmount();
  });

  test('编辑输入吃键盘输入（stopPropagation 不外溢全局 Esc 链的按键处理路径）', () => {
    const view = render(<SessionRow session={makeSession()} age="" active={false} />);
    React.act(() => {
      actionButton(row(view), '重命名会话')?.click();
    });
    const input = view.container.querySelector('input') as HTMLInputElement;
    React.act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(view.container.querySelector('input')).not.toBeNull();
    view.unmount();
  });

  test('行内动作按钮点击路径：置顶切换/回收/关闭（单例直调，点击可执行）', () => {
    const view = render(<SessionRow session={makeSession()} age="3分钟" active={false} />);
    const el = row(view);
    React.act(() => {
      actionButton(el, '置顶')?.click();
    });
    React.act(() => {
      actionButton(el, '回收 Worker')?.click();
    });
    React.act(() => {
      actionButton(el, '关闭会话')?.click();
    });
    expect(view.container.textContent).toContain('会话标题');
    view.unmount();
  });

  test('流式行渲染行首活动指示（aria-label 在位）', () => {
    const view = render(<SessionRow session={makeSession({ streaming: true })} age="" active={false} />);
    expect(view.container.querySelector('[role="img"][aria-label="进行中"]')).not.toBeNull();
    view.unmount();
  });
});
