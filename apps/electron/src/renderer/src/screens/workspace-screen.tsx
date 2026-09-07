import { BootstrapState } from './bootstrap-state';
import { useLiveWorkspace } from '@/live/use-live-workspace';
import { WorkspaceMain } from './workspace-main';

/**
 * 工作区守卫：桥不可用/bootstrap 未决时呈现启动态；就绪后交棒主组件。
 * 本组件只调用一个 hook，早退不破坏 hooks 规则。
 */
function WorkspaceScreen(): React.JSX.Element {
  const workspace = useLiveWorkspace();
  if (!workspace.ready || workspace.bootstrapError !== null || !workspace.bridgeAvailable) {
    return <BootstrapState workspace={workspace} />;
  }
  return <WorkspaceMain workspace={workspace} />;
}

export { WorkspaceScreen };
