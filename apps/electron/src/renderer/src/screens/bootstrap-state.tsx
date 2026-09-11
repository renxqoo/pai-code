import * as React from 'react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { bridgeClient, store } from '@/live/workspace-runtime';

/** 启动守卫（T34 M3 自订阅，0 props）：桥不可用 / bootstrap 失败给出明确指引，绝不停留在白屏。 */
function BootstrapState(): React.JSX.Element {
  const bootstrapError = useStore(store, (s) => s.bootstrapError);
  const hostPhase = useStore(store, (s) => s.hostPhase);
  const failed = !bridgeClient.available || bootstrapError !== null;
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex max-w-[420px] flex-col items-center gap-[10px] px-[24px] text-center">
        <p className="text-[14px] font-medium">
          {failed ? copy.bootstrap.failedTitle : copy.bootstrap.loadingTitle}
        </p>
        <p className="text-[12.5px] leading-[20px] text-muted-foreground">
          {bridgeClient.available ? copy.bootstrap.loadingHint : copy.bootstrap.bridgeHint}
        </p>
        {hostPhase === 'failed' ? (
          <p className="text-[12.5px] leading-[20px] text-amber-600">{copy.bootstrap.hostFailed}</p>
        ) : null}
      </div>
    </div>
  );
}

export { BootstrapState };
