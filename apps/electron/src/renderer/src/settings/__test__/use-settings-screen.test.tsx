import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { ProviderConfigView, SessionView } from '@paiapp/contracts';

import { ThemeProvider } from '@/components/theme-provider';
import { dispatchSectionEnter, pinnedSetOf, savedProjectsOf, useSettingsScreen } from '../use-settings-screen';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';
import { render } from '@/testing/render';
import type { WorkspaceActions } from '@/live/workspace-actions';

type EnterActions = Parameters<typeof dispatchSectionEnter>[1];

function makeEnterActions(): { actions: EnterActions; calls: string[] } {
  const calls: string[] = [];
  const actions = {
    refreshHubSettings: () => calls.push('permissions'),
    refreshAgentDefinitions: () => calls.push('agents'),
    refreshSkills: () => calls.push('skills'),
  } satisfies EnterActions;
  return { actions, calls };
}

describe('按开即读派发', () => {
  test('四个目录分区进入时派发对应拉取动作', () => {
    for (const id of ['permissions', 'agents', 'skills'] as const) {
      const { actions, calls } = makeEnterActions();
      dispatchSectionEnter(id, actions);
      expect(calls).toEqual([id]);
    }
  });

  test('非目录分区不派发任何动作', () => {
    for (const id of ['general', 'providers', 'history'] as const) {
      const { actions, calls } = makeEnterActions();
      dispatchSectionEnter(id, actions);
      expect(calls).toEqual([]);
    }
  });

  test('派发动作签名与 WorkspaceActions 面对齐（编译期防漂移）', () => {
    const check: Record<keyof EnterActions, keyof WorkspaceActions> = {
      refreshHubSettings: 'refreshHubSettings',
      refreshAgentDefinitions: 'refreshAgentDefinitions',
      refreshSkills: 'refreshSkills',
    };
    expect(Object.keys(check).length).toBe(3);
  });
});

describe('历史分区派生', () => {
  test('项目目录按首现顺序去重', () => {
    expect(savedProjectsOf([
      { sessionPath: '/a/1.jsonl', title: 'a1', cwd: '/a', modifiedAt: 1, messageCount: 1 },
      { sessionPath: '/b/1.jsonl', title: 'b1', cwd: '/b', modifiedAt: 2, messageCount: 1 },
      { sessionPath: '/a/2.jsonl', title: 'a2', cwd: '/a', modifiedAt: 3, messageCount: 2 },
    ])).toEqual(['/a', '/b']);
    expect(savedProjectsOf([])).toEqual([]);
  });

  test('置顶键集合来自 preferences.pinnedSessions', () => {
    const pinned = pinnedSetOf(['/a/1.jsonl', '/b/1.jsonl', '/a/1.jsonl']);
    expect(pinned.has('/a/1.jsonl')).toBe(true);
    expect(pinned.has('/c/1.jsonl')).toBe(false);
    expect(pinned.size).toBe(2);
  });
});

/** 装配 hook 挂载回归：真实 ThemeProvider（消费 useTheme）+ 模块单例 store。 */
function SettingsPropsProbe(): React.JSX.Element {
  const props = useSettingsScreen({ open: false, onClose: () => undefined });
  return (
    <span
      data-providers={props.providers.list.map((entry) => entry.name).join(',')}
      data-attention={String(props.runtimeAttention)}
    />
  );
}

function makeProvider(name: string): ProviderConfigView {
  return { name, baseUrl: 'https://example.com', api: 'openai-completions', models: [], hasKey: false };
}

function deadSession(threadId: string): SessionView {
  return {
    threadId,
    cwd: '/tmp/pai',
    sessionPath: `/tmp/pai/s/${threadId}.jsonl`,
    title: `会话-${threadId}`,
    state: 'dead',
    streaming: false,
    model: null,
    thinkingLevel: null,
    lastActivityAt: Date.now(),
  };
}

describe('装配 hook 挂载', () => {
  beforeEach(() => {
    liveStore.getState().reset();
    uiStore.getState().reset();
  });

  afterEach(() => {
    liveStore.getState().reset();
    uiStore.getState().reset();
  });

  test('症状：saved 派生进 selector 挂载即渲染循环——saved 走裸订阅 + useMemo 映射', () => {
    expect(() =>
      render(
        <ThemeProvider>
          <SettingsPropsProbe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
  });

  test('症状：装配 props 冻结陈旧——providers 更新后 props 反映新列表', () => {
    liveStore.setState({ providers: [makeProvider('first')] });
    const view = render(
      <ThemeProvider>
        <SettingsPropsProbe />
      </ThemeProvider>,
    );
    const probe = view.container.querySelector('[data-providers]');
    expect(probe?.getAttribute('data-providers')).toBe('first');
    React.act(() => {
      liveStore.setState({ providers: [makeProvider('first'), makeProvider('second')] });
    });
    expect(probe?.getAttribute('data-providers')).toBe('first,second');
    view.unmount();
  });

  test('runtimeAttention 原始值订阅：宿主就绪无死会话为 false，死会话出现翻转 true', () => {
    liveStore.setState({ hostPhase: 'ready' });
    const view = render(
      <ThemeProvider>
        <SettingsPropsProbe />
      </ThemeProvider>,
    );
    const probe = view.container.querySelector('[data-attention]');
    expect(probe?.getAttribute('data-attention')).toBe('false');
    React.act(() => {
      liveStore.setState({ sessions: { t1: deadSession('t1') } });
    });
    expect(probe?.getAttribute('data-attention')).toBe('true');
    view.unmount();
  });
});
