import { BootstrapState } from './bootstrap-state';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { useLiveWorkspace } from '@/live/use-live-workspace';
import { WorkspaceMain } from './workspace-main';

/**
 * 工作区守卫：桥不可用/bootstrap 未决时呈现启动态；首次运行（onboarded=false）
 * 呈现引导向导；就绪后交棒主组件。本组件只调用一个 hook，早退不破坏 hooks 规则。
 */
function WorkspaceScreen(): React.JSX.Element {
  const workspace = useLiveWorkspace();
  if (!workspace.ready || workspace.bootstrapError !== null || !workspace.bridgeAvailable) {
    return <BootstrapState workspace={workspace} />;
  }
  if (!workspace.preferences.onboarded) {
    return (
      <OnboardingScreen
        providers={workspace.providers}
        modelOptions={workspace.composer.modelOptions}
        onUpsertProvider={workspace.actions.upsertProvider}
        onSelectDefaultModel={workspace.actions.setDefaultModel}
        onRefreshModels={workspace.actions.refreshModels}
        onFinish={(cwd) => {
          workspace.actions.completeOnboarding();
          const directory = cwd.trim();
          if (directory.length > 0 && workspace.composer.modelOptions.length > 0) {
            void workspace.actions.createSession(directory);
          }
        }}
        onSkip={workspace.actions.completeOnboarding}
      />
    );
  }
  return <WorkspaceMain workspace={workspace} />;
}

export { WorkspaceScreen };
