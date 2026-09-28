import { describe, expect, test } from 'bun:test';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useMobileBridgePanel } from '../use-mobile-bridge-panel';
import { installDom } from '@/testing/dom';

type MobileFace = NonNullable<Window['pai']>['mobile'];

/** 面板依赖注入桩（不碰全局 window——模块级 bridgeClient 捕获 window.pai，全局打桩跨文件污染）。 */
function stubMobile(face: Partial<MobileFace>): MobileFace {
  return {
    state: () => Promise.resolve({ enabled: true, pairCode: null, lockedUntil: 0, devices: [], pairedCount: 0 }),
    setEnabled: () => Promise.resolve({ ok: true }),
    generatePairCode: () => Promise.resolve({ ok: true, code: '000000', expiresAt: 1 }),
    revoke: () => Promise.resolve({ ok: true }),
    ...face,
  } as MobileFace;
}

installDom();

let probeResult: ReturnType<typeof useMobileBridgePanel> | null = null;

function Probe({ mobile }: { mobile: MobileFace }): null {
  probeResult = useMobileBridgePanel(true, mobile);
  return null;
}

function mountHook(mobile: MobileFace): { panel: () => ReturnType<typeof useMobileBridgePanel>; unmount: () => void } {
  installDom();
  const container = document.createElement('div');
  const root: Root = createRoot(container);
  act(() => {
    root.render(<Probe mobile={mobile} />);
  });
  return {
    panel: () => probeResult as ReturnType<typeof useMobileBridgePanel>,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  });
}

describe('useMobileBridgePanel（T57）', () => {
  test('激活即拉取：state 落定 + loading 收敛', async () => {
    const harness = mountHook(stubMobile({}));
    await settle();
    expect(harness.panel().state?.enabled).toBe(true);
    expect(harness.panel().loading).toBe(false);
    harness.unmount();
  });

  test('垃圾应答（形状不符）不落 state', async () => {
    const harness = mountHook(stubMobile({ state: () => Promise.resolve({ enabled: 'not-boolean' }) }));
    await settle();
    expect(harness.panel().state).toBeNull();
    harness.unmount();
  });

  test('开关切换走 setEnabled 后回读 state', async () => {
    let enabled = true;
    const harness = mountHook(
      stubMobile({
        state: () => Promise.resolve({ enabled, pairCode: null, lockedUntil: 0, devices: [], pairedCount: 0 }),
        setEnabled: (next: boolean) => {
          enabled = next;
          return Promise.resolve({ ok: true as const });
        },
      }),
    );
    await settle();
    await act(async () => {
      await Promise.resolve(harness.panel().onToggle(false));
    });
    expect(harness.panel().state?.enabled).toBe(false);
    harness.unmount();
  });

  test('生成配对码 → 刷新可见码', async () => {
    const harness = mountHook(
      stubMobile({
        state: () => Promise.resolve({ enabled: true, pairCode: { code: '654321', expiresAt: Date.now() + 60_000 }, lockedUntil: 0, devices: [], pairedCount: 0 }),
      }),
    );
    await settle();
    await act(async () => {
      await Promise.resolve(harness.panel().onGenerateCode());
    });
    expect(harness.panel().state?.pairCode?.code).toBe('654321');
    harness.unmount();
  });

  test('撤销设备 → 回读（设备清空）', async () => {
    let devices: string[] = ['iPhone'];
    const harness = mountHook(
      stubMobile({
        state: () => Promise.resolve({ enabled: true, pairCode: null, lockedUntil: 0, devices: [...devices], pairedCount: 1 }),
        revoke: () => {
          devices = [];
          return Promise.resolve({ ok: true });
        },
      }),
    );
    await settle();
    await act(async () => {
      await Promise.resolve(harness.panel().onRevoke('iPhone'));
    });
    expect(harness.panel().state?.devices).toEqual([]);
    harness.unmount();
  });
});
