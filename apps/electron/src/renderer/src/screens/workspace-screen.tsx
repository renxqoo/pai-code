import * as React from 'react';
import { useStore } from 'zustand';

import { BootstrapState } from './bootstrap-state';
import { NoticeStrip } from '@/notices/notice-strip';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { useWorkspaceRuntime } from '@/live/use-workspace-runtime';
import { bridgeClient, store, workspaceActions } from '@/live/workspace-runtime';
import { WorkspaceMain } from './workspace-main';

/**
 * 工作区守卫（T34 M3：useLiveWorkspace 退役——runtime 挂载 + 直订阅）：
 * 桥不可用/bootstrap 未决时呈现启动态；首次运行（onboarded=false）呈现引导向导；
 * 就绪后交棒主组件。runtime hook 在早退分支之前无条件调用（hooks 规则与
 * controller 生命周期都不因守卫早退断链）。
 */
function WorkspaceScreen(): React.JSX.Element {
  useWorkspaceRuntime();
  const bootstrapLoaded = useStore(store, (s) => s.bootstrapLoaded);
  const bootstrapError = useStore(store, (s) => s.bootstrapError);
  const onboarded = useStore(store, (s) => s.preferences.onboarded);
  const providers = useStore(store, (s) => s.providers);
  const models = useStore(store, (s) => s.models);
  const notices = useStore(store, (s) => s.notices);

  if (!bootstrapLoaded || bootstrapError !== null || !bridgeClient.available) {
    return <BootstrapState />;
  }
  if (!onboarded) {
    const modelOptions = models.map((model) => `${model.provider}/${model.modelId}`);
    return (
      <>
        <OnboardingScreen
          providers={providers}
          modelOptions={modelOptions}
          onUpsertProvider={workspaceActions.upsertProvider}
          onSelectDefaultModel={workspaceActions.setDefaultModel}
          onRefreshModels={workspaceActions.refreshModels}
          onFinish={(cwd) => {
            workspaceActions.completeOnboarding();
            const directory = cwd.trim();
            if (directory.length > 0 && modelOptions.length > 0) {
              void workspaceActions.createSession({ cwd: directory });
            }
          }}
          onSkip={workspaceActions.completeOnboarding}
        />
        {/* 引导屏同样承接失败通知（完成/首会话/偏好写失败） */}
        <NoticeStrip notices={notices} onDismiss={workspaceActions.dismissNotice} />
      </>
    );
  }
  return <WorkspaceMain />;
}

export { WorkspaceScreen };
