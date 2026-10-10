import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';

import { copy } from '@/strings';
import { installDom } from '@/testing/dom';
import { render, type RenderHandle } from '@/testing/render';

import { DevicesSection, type DevicesSectionProps } from '../devices-section';

/** gateway-owner 命令应答（IPC 层恒 ok:true，真实成败在 body.success/error）。 */
type CommandResult = { ok: true; body: Record<string, unknown> } | { ok: false; reason: string };

/**
 * 症状回归套（配对报错被吞成 'bad pairing response'）：
 * 1) 网关失败应答的 error 原样透出（不再一律兜底英文）；
 * 2) 应答成功但缺配对字段 → 展示 strings 文案；
 * 3) status/devices 数据在 body.data 下（网关 response 包裹），读错即面板恒空；
 * 4) 装置不得覆盖 globalThis.window（曾致后续全部 DOM 测试假红）。
 */

function stubGateway(command: (payload: { command: string; args?: Record<string, unknown> }) => Promise<CommandResult> = () => Promise.resolve({ ok: true, body: {} })): void {
  // 先装共享 DOM 装置再挂 window.x3code——直接替换 globalThis.window 会把后续
  // 文件的 happy-dom 实体打掉（症状：全部 DOM 测试在本文件之后假红）
  installDom();
  (window as unknown as { x3code: unknown }).x3code = {
    gateway: {
      status: () => Promise.resolve({ process: 'running', connected: true, staleSocket: false }),
      command,
    },
  };
}

const okBody = (data: Record<string, unknown>): Promise<CommandResult> =>
  Promise.resolve({ ok: true, body: { success: true, data } });

function section(
  props: Partial<DevicesSectionProps> = {},
  command?: (payload: { command: string; args?: Record<string, unknown> }) => Promise<CommandResult>,
): RenderHandle {
  stubGateway(command ?? (() => Promise.resolve({ ok: true, body: {} })));
  return render(<DevicesSection relay={{ relayUrl: '', relayKeyFingerprint: '' }} onRelaySave={() => Promise.resolve(true)} {...props} />);
}

/** 客户端渲染下的微任务冲刷（配对命令是 then 链）。 */
async function flush(): Promise<void> {
  await React.act(async () => {
    await Promise.resolve();
  });
}


const buttonOf = (view: RenderHandle, text: string): HTMLButtonElement | undefined =>
  [...view.container.querySelectorAll('button')].find((button) => button.textContent?.includes(text));

afterEach(() => {
  if (typeof window === 'undefined') return;
  delete (window as unknown as { x3code?: unknown }).x3code;
});

describe('DevicesSection（症状回归：配对失败被吞成兜底文案）', () => {
  test('症状回归：网关 success:false 应答（error 为 commandError 对象）→ 展示 message，不出现 bad pairing response', async () => {
    const view = section({}, () => Promise.resolve({ ok: true, body: { success: false, error: { code: 'gw-command-failed', message: 'relayKeyFingerprint required for QR pairing' } } }));
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    expect(view.container.textContent).toContain('relayKeyFingerprint required for QR pairing');
    expect(view.container.textContent).not.toContain('bad pairing response');
    view.unmount();
  });

  test('症状回归：error 无 message（如 owner-only 判定）→ reason 取 code', async () => {
    const view = section({}, () => Promise.resolve({ ok: true, body: { success: false, error: { code: 'owner-only' } } }));
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    expect(view.container.textContent).toContain('owner-only');
    view.unmount();
  });

  test('症状回归：error 缺席（host 透逓路径）→ reason 取 code 兑底（诚实展示机器码）', async () => {
    const view = section({}, () => Promise.resolve({ ok: true, body: { success: false } }));
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    expect(view.container.textContent).toContain('gw-command-failed');
    view.unmount();
  });

  test('症状回归：IPC 层拒绝（ok:false）→ 展示 reason', async () => {
    const view = section({}, () => Promise.resolve({ ok: false, reason: 'gateway not configured' }));
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    expect(view.container.textContent).toContain('gateway not configured');
    view.unmount();
  });

  test('症状回归：成功应答缺配对字段 → strings 可诊断文案（无硬编码英文兜底）', async () => {
    const view = section({}, () => Promise.resolve({ ok: true, body: { success: true, data: {} } }));
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    expect(view.container.textContent).toContain(copy.settings.pairBadResponse);
    expect(view.container.textContent).not.toContain('bad pairing response');
    view.unmount();
  });

  test('数据面读 body.data：网关状态与设备列表渲染（读顶层即面板恒空）', async () => {
    const view = section({}, (payload) => {
      if (payload.command === 'gw/status') return okBody({ installationId: 'i1', remoteEnabled: true, devices: 2, threads: 3, hostAlive: true });
      if (payload.command === 'gw/devices/list') return okBody([{ deviceId: 'd1', name: '测试手机', scope: 'read', pairedAt: 1, lastSeenAt: 1 }]);
      return okBody({});
    });
    await flush();
    expect(view.container.textContent).toContain(copy.settings.remoteOn);
    expect(view.container.textContent).toContain('测试手机');
    view.unmount();
  });

  test('网关面缺失（浏览器直开）渲染引导卡不崩', () => {
    installDom();
    (window as unknown as { x3code?: unknown }).x3code = {};
    const view = render(<DevicesSection relay={{ relayUrl: '', relayKeyFingerprint: '' }} onRelaySave={() => Promise.resolve(true)} />);
    expect(view.container.textContent).toContain(copy.settings.gatewayUnavailable);
    view.unmount();
  });

  test('默认渲染：网关状态/发起配对/已配对设备三卡 + 档位三档', async () => {
    const view = section();
    await flush();
    const text = view.container.textContent ?? '';
    expect(text).toContain(copy.settings.pairStart);
    expect(text).toContain(copy.settings.pairedTitle);
    expect(text).toContain('只读');
    expect(text).toContain('可交互');
    expect(text).toContain('全权');
    view.unmount();
  });

  test('未配置自建 relay → 默认内置中继形态：高级区收起、无误导告警', async () => {
    const view = section();
    await flush();
    expect(view.container.textContent).toContain(copy.settings.relayAdvancedShow);
    expect(view.container.textContent).not.toContain('wss://relay.example.com');
    view.unmount();
  });

  test('设备行操作：升档与撤销各发一条 owner 命令', async () => {
    const seen: string[] = [];
    const view = section({}, (payload) => {
      seen.push(payload.command);
      if (payload.command === 'gw/devices/list') return okBody([{ deviceId: 'd1', name: '手机', scope: 'read', pairedAt: 1, lastSeenAt: 1 }]);
      return okBody({});
    });
    await flush();
    buttonOf(view, copy.settings.scopeUpgrade)?.click();
    await flush();
    expect(seen).toContain('gw/devices/set_scope');
    buttonOf(view, copy.settings.revoke)?.click();
    await flush();
    expect(seen).toContain('gw/devices/revoke');
    view.unmount();
  });

  test('配对会话建立后取消 → 发 gw/pairing/cancel', async () => {
    const seen: string[] = [];
    const view = section({}, (payload) => {
      seen.push(payload.command);
      if (payload.command === 'gw/pairing/start') return okBody({ pairingId: 'p1', qrPayload: 'payload-1' });
      return okBody({});
    });
    await flush();
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    expect(view.container.textContent).toContain(copy.settings.pairShowPayload);
    buttonOf(view, copy.settings.pairCancel)?.click();
    await flush();
    expect(seen).toContain('gw/pairing/cancel');
    view.unmount();
  });

  test('症状回归：配对面不再要人输入比对码（面板无 SAS 输入框、无确认按钮）', async () => {
    const view = section({}, (payload) => {
      if (payload.command === 'gw/pairing/start') return okBody({ pairingId: 'p1', qrPayload: 'payload-1', manualCode: '246813' });
      return okBody({});
    });
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    const inputs = [...view.container.querySelectorAll('input')].map((input) => input.getAttribute('aria-label'));
    expect(inputs).not.toContain('SAS 确认码');
    expect(view.container.textContent).toContain('246813');
    expect(view.container.textContent).toContain(copy.settings.pairWaiting);
    view.unmount();
  });

  test('手机完成扫码/输码后本机自动确认：用网关给的比对码发 gw/pairing/confirm', async () => {
    const confirms: Array<Record<string, unknown>> = [];
    const view = section({}, (payload) => {
      if (payload.command === 'gw/pairing/start') return okBody({ pairingId: 'p1', qrPayload: 'payload-1', manualCode: '246813' });
      if (payload.command === 'gw/pairing/status') return okBody({ pairingId: 'p1', ownerSas: '392653' });
      if (payload.command === 'gw/pairing/confirm') {
        confirms.push(payload.args ?? {});
        return okBody({ deviceId: 'd-1' });
      }
      return okBody({});
    });
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    await flush();
    expect(confirms).toEqual([{ pairingId: 'p1', ownerTypedSas: '392653' }]);
    expect(view.container.textContent).toContain(copy.settings.pairDone);
    view.unmount();
  });

  test('设备钥尚未呈递 → 本轮静默跳过（不把正常时序差报成失败）', async () => {
    const view = section({}, (payload) => {
      if (payload.command === 'gw/pairing/start') return okBody({ pairingId: 'p1', qrPayload: 'payload-1', manualCode: '246813' });
      if (payload.command === 'gw/pairing/status') return okBody({ pairingId: 'p1', ownerSas: '392653' });
      if (payload.command === 'gw/pairing/confirm') return { ok: true, body: { success: false, error: { code: 'gw-command-failed', message: 'device keys not presented' } } };
      return okBody({});
    });
    buttonOf(view, copy.settings.pairStart)?.click();
    await flush();
    await flush();
    expect(view.container.textContent).not.toContain('device keys not presented');
    expect(view.container.textContent).toContain(copy.settings.pairWaiting);
    view.unmount();
  });

  test('relay 表单：草稿取自偏好面，保存回传完整配置', async () => {
    const saved: Array<{ relayUrl: string; relayKeyFingerprint: string }> = [];
    stubGateway();
    // 注：本环境（bun + happy-dom + React 19）派发 input 事件不触发受控 onChange
    // （实测矩阵全红、仓库内无先例），故经 props 驱动草稿；键入路径归 bw 真机走查。
    const view = render(
      <DevicesSection
        relay={{ relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' }}
        onRelaySave={(relay) => {
          saved.push({ ...relay });
          return Promise.resolve(true);
        }}
      />,
    );
    await flush();
    const [urlInput, fpInput] = [...view.container.querySelectorAll('input')] as HTMLInputElement[];
    expect(urlInput.getAttribute('aria-label')).toBe(copy.settings.relayUrlLabel);
    expect(fpInput.getAttribute('aria-label')).toBe(copy.settings.relayFingerprintLabel);
    expect(urlInput.value).toBe('wss://relay.example.com');
    expect(fpInput.value).toBe('fp-1');
    buttonOf(view, copy.settings.relaySave)?.click();
    await flush();
    expect(saved).toEqual([{ remoteEnabled: true, relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' }]);
    expect(view.container.textContent).toContain(copy.settings.relaySaved);
    view.unmount();
  });
});

/**
 * 症状回归：点「复制」拿到的内容始终是 "1"。
 * 手机端配对框是 maxLength=6 + 只留数字，PC 端复制的是配对载荷 JSON 时，
 * 粘贴后前 6 个字符是 {"v":1, → 过滤后正好剩 1，用户永远配不上对。
 * 复制必须落在 6 位配对码本身，且写失败要如实报。
 */
describe('配对码复制（症状：复制内容始终是 1）', () => {
  const pairingData = (manualCode: string): Record<string, unknown> => ({
    pairingId: 'pr_1',
    manualCode,
    qrPayload: '{"v":1,"relayUrl":"ws://192.168.1.2:8787","pairingId":"pr_1","pairingTicket":"tk"}',
  });

  /**
   * 点击连同其后整条 then 链（配对命令 / 剪贴板写入）一起进 act：
   * 拆成 click + flush 会把中途的状态更新漏在 act 之外，测试噪音只增不减。
   */
  async function press(view: RenderHandle, text: string): Promise<void> {
    await React.act(async () => {
      buttonOf(view, text)?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function withClipboard(writeText: (text: string) => Promise<void>): () => void {
    const prior = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
    return () => {
      if (prior === undefined) delete (globalThis.navigator as { clipboard?: unknown }).clipboard;
      else Object.defineProperty(globalThis.navigator, 'clipboard', prior);
    };
  }

  test('复制的是 6 位配对码本身，不是 JSON 配对载荷', async () => {
    const written: string[] = [];
    const restore = withClipboard((text) => { written.push(text); return Promise.resolve(); });
    try {
      const view = section({}, (payload) => payload.command === 'gw/pairing/start' ? okBody(pairingData('681206')) : Promise.resolve({ ok: true, body: {} }));
      await press(view, copy.settings.pairStart);
      expect(view.container.textContent).toContain('681206');
      await press(view, copy.settings.pairCopy);
      expect(written).toEqual(['681206']);
      expect(written[0]).not.toContain('relayUrl');
      expect(view.container.textContent).toContain(copy.settings.pairCodeCopied);
      view.unmount();
    } finally {
      restore();
    }
  });

  test('剪贴板写失败如实报，不让用户以为复制成功', async () => {
    const restore = withClipboard(() => Promise.reject(new Error('denied')));
    try {
      const view = section({}, (payload) => payload.command === 'gw/pairing/start' ? okBody(pairingData('681206')) : Promise.resolve({ ok: true, body: {} }));
      await press(view, copy.settings.pairStart);
      await press(view, copy.settings.pairCopy);
      expect(view.container.textContent).toContain(copy.settings.pairCopyFailed);
      view.unmount();
    } finally {
      restore();
    }
  });

  test('没有 6 位码时不给复制入口（复制空串是静默失败）', async () => {
    const written: string[] = [];
    const restore = withClipboard((text) => { written.push(text); return Promise.resolve(); });
    try {
      const view = section({}, (payload) => payload.command === 'gw/pairing/start' ? okBody({ pairingId: 'pr_1', manualCode: '', qrPayload: '{"v":1}' }) : Promise.resolve({ ok: true, body: {} }));
      await press(view, copy.settings.pairStart);
      expect(buttonOf(view, copy.settings.pairCopy)).toBeUndefined();
      view.unmount();
    } finally {
      restore();
    }
  });
});

/** 装置纪律：本文件只挂 window.x3code，不替换 globalThis.window（曾把后续 DOM 测试全部打红）。 */
describe('测试装置不污染 window', () => {
  test('stub 后 window 仍是 DOM 实体（HTMLElement 可用）', () => {
    const view = section();
    expect(typeof (window as unknown as { HTMLElement?: unknown }).HTMLElement).toBe('function');
    expect(typeof document.createElement === 'function').toBe(true);
    view.unmount();
  });
});
