import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { render } from '@/testing/render';
import { useHoverIntent, type HoverIntent, type HoverIntentOptions } from '../use-hover-intent';

let captured: HoverIntent | null = null;
let probeOptions: HoverIntentOptions | undefined;

/** hook 探针：返回值挂模块变量供断言；options 经模块变量注入（含缺省分支）。 */
function HoverProbe(): null {
  captured = useHoverIntent(probeOptions);
  return null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function settle(): Promise<void> {
  await React.act(async () => {
    await sleep(10);
  });
}

function intent(): HoverIntent {
  if (captured === null) throw new Error('probe not rendered');
  return captured;
}

afterEach(() => {
  captured = null;
  probeOptions = undefined;
});

describe('hover 触发意图（防闪烁机理）', () => {
  test('进入延迟开、离开延迟关', async () => {
    probeOptions = { openDelayMs: 0, closeDelayMs: 0 };
    const view = render(<HoverProbe />);
    React.act(() => {
      intent().onEnter();
    });
    await settle();
    expect(intent().open).toBe(true);
    React.act(() => {
      intent().onLeave();
    });
    await settle();
    expect(intent().open).toBe(false);
    view.unmount();
  });

  test('症状：扫过触发区闪弹层——同帧 进→出 撤销开计时，不开', async () => {
    probeOptions = { openDelayMs: 0, closeDelayMs: 0 };
    const view = render(<HoverProbe />);
    React.act(() => {
      intent().onEnter();
      intent().onLeave();
    });
    await settle();
    expect(intent().open).toBe(false);
    view.unmount();
  });

  test('症状：跨触发器与弹层缝隙闪断——同帧 出→进 撤销关计时，不关', async () => {
    probeOptions = { openDelayMs: 0, closeDelayMs: 0 };
    const view = render(<HoverProbe />);
    React.act(() => {
      intent().openNow();
    });
    expect(intent().open).toBe(true);
    React.act(() => {
      intent().onLeave();
      intent().onEnter();
    });
    await settle();
    expect(intent().open).toBe(true);
    view.unmount();
  });

  test('焦点立即开、失焦立即关（不等计时器）', () => {
    probeOptions = { openDelayMs: 0, closeDelayMs: 0 };
    const view = render(<HoverProbe />);
    React.act(() => {
      intent().openNow();
    });
    expect(intent().open).toBe(true);
    React.act(() => {
      intent().closeNow();
    });
    expect(intent().open).toBe(false);
    view.unmount();
  });

  test('缺省延迟装配在场（不注入 options 不抛错）；卸载清 pending 计时无悬挂更新', async () => {
    const view = render(<HoverProbe />);
    React.act(() => {
      intent().onEnter();
    });
    view.unmount();
    await settle();
    expect(intent().open).toBe(false);
  });
});
