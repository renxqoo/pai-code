import { copy } from '@/strings';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

/** 启动守卫：桥不可用 / bootstrap 失败给出明确指引，绝不停留在白屏。 */
function BootstrapState({ workspace }: { workspace: LiveWorkspaceView }): React.JSX.Element {
  const failed = !workspace.bridgeAvailable || workspace.bootstrapError !== null;
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex max-w-[420px] flex-col items-center gap-[10px] px-[24px] text-center">
        <p className="text-[14px] font-medium">
          {failed ? copy.bootstrap.failedTitle : copy.bootstrap.loadingTitle}
        </p>
        <p className="text-[12.5px] leading-[20px] text-muted-foreground">
          {workspace.bridgeAvailable ? copy.bootstrap.loadingHint : copy.bootstrap.bridgeHint}
        </p>
        {workspace.hostPhase === 'failed' ? (
          <p className="text-[12.5px] leading-[20px] text-amber-600">{copy.bootstrap.hostFailed}</p>
        ) : null}
      </div>
    </div>
  );
}

export { BootstrapState };
