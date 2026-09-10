import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { ThreadStage } from '../thread-stage';

/**
 * T27 回归（SSR 静态口径，同 new-task-screen 冒烟形态）：历史水化失败的
 * parked 会话不再静默呈现为「还没有消息」空态——失败标题 + 重试按钮可见；
 * 正常空会话保持引导文案且无重试按钮。
 */
function makeWorkspace(overrides: { hydrateFailed?: boolean; retryHydration?: () => void } = {}): LiveWorkspaceView {
  const actions = { retryHydration: overrides.retryHydration ?? (() => undefined) } as LiveWorkspaceView['actions'];
  return {
    ready: true,
    bootstrapError: null,
    bridgeAvailable: true,
    hostPhase: 'ready',
    sessions: [],
    activeThreadId: 't1',
    activeThread: { items: [], agents: [] } as LiveWorkspaceView['activeThread'],
    activeCwd: '/w',
    generating: false,
    executing: false,
    agentsActive: false,
    agentsWorking: 0,
    queueCount: 0,
    queueItems: { steering: [], followUp: [] },
    queuedDrafts: {},
    submitQueuedDraft: () => Promise.resolve(null),
    isThreadStreaming: () => false,
    crashed: false,
    compacting: false,
    bashRunning: false,
    bashTail: '',
    retrying: null,
    hydrateFailed: overrides.hydrateFailed === true,
    now: 0,
    threadDiff: { files: [] } as LiveWorkspaceView['threadDiff'],
    activeStats: null,
    statsById: {},
    diagnostics: null,
    composer: { model: 'p/m', modelOptions: ['p/m'], effort: '', effortOptions: [], contextUsed: 0 },
    dialogs: [],
    notices: [],
    saved: [],
    providers: [],
    commands: [],
    agentDefinitions: [],
    skills: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], archivedSessions: [] } as LiveWorkspaceView['preferences'],
    permissionRules: null,
    sessionRules: null,
    thinkingLevels: [],
    effortOptionsFor: () => [],
    actions,
  };
}

function renderStage(workspace: LiveWorkspaceView): string {
  return renderToStaticMarkup(
    <ThreadStage
      workspace={workspace}
      activeThreadId="t1"
      sidebarCollapsed={false}
      hostDown={false}
      bottomInset={0}
      onOpenSettings={() => undefined}
      onOpenDiff={() => undefined}
      panelOpen={false}
      onTogglePanel={() => undefined}
      onViewAction={() => undefined}
      onEditUserMessage={() => undefined}
    />,
  );
}

describe('ThreadStage 空态（T27：水化失败不静默）', () => {
  test('hydrateFailed：失败标题 + 重试按钮，不显示空会话引导文案', () => {
    const html = renderStage(makeWorkspace({ hydrateFailed: true }));
    expect(html).toContain(copy.flow.hydrateFailedTitle);
    expect(html).toContain(copy.thread.retryHydration);
    expect(html).not.toContain(copy.thread.emptyTitle);
  });

  test('正常空会话：引导文案，无重试按钮', () => {
    const html = renderStage(makeWorkspace());
    expect(html).toContain(copy.thread.emptyTitle);
    expect(html).not.toContain(copy.flow.hydrateFailedTitle);
    expect(html).not.toContain(copy.thread.retryHydration);
  });
});
