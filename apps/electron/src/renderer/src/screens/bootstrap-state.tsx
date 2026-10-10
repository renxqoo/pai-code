import * as React from 'react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { bridgeClient, store } from '@/live/workspace-runtime';

import { BrandRippleLogo } from './brand-ripple-logo';

/** 启动守卫（T34 M3 自订阅，0 props）：桥不可用 / bootstrap 失败给出明确指引，绝不停留在白屏。
 *  启动态纯 logo + 水波纹（无文字）；失败态保留标题与指引文案——排障信息不可省。 */
function BootstrapState(): React.JSX.Element {
  const bootstrapError = useStore(store, (s) => s.bootstrapError);
  const hostPhase = useStore(store, (s) => s.hostPhase);
  const failed = !bridgeClient.available || bootstrapError !== null;
  if (!failed) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <BrandRippleLogo />
      </div>
    );
  }
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex max-w-[420px] flex-col items-center gap-[10px] px-[24px] text-center">
        <p className="text-[14px] font-medium">{copy.bootstrap.failedTitle}</p>
        <p className="text-[12.5px] leading-[20px] text-muted-foreground">
          {copy.bootstrap.bridgeHint}
        </p>
        {hostPhase === 'failed' ? (
          <p className="text-[12.5px] leading-[20px] text-amber-600">{copy.bootstrap.hostFailed}</p>
        ) : null}
      </div>
    </div>
  );
}

export { BootstrapState };
