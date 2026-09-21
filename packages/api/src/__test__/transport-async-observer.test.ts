/**
 * transport onCall 隔离契约对 async 观测者的封洞回归。
 *
 * 契约（transport.ts 头注释）：「onCall 观测钩子独立隔离（观测者抛错只吞……
 * 绝不影响命令结果）」。observe() 的同步 try/catch 只能吞同步 throw——而
 * CallObserver 是 void 返回签名，TS 允许把 async 函数（Promise<void>）赋给它；
 * async 观测者的 reject 不经过同步 throw，修复前逃逸为 unhandled rejection
 * （bun test 直接判红）。「只吞」的隔离对两种形态都必须成立。
 */
import { expect, test } from 'bun:test';

import { createTransport } from '../transport';

test('async onCall 的 reject 不逃逸隔离（命令结果不受影响，无 unhandled rejection）', async () => {
  const transport = createTransport({
    request: () => Promise.resolve({ ok: true as const, data: 1 }),
    onCall: () => Promise.reject(new Error('observer boom')),
  });
  const result = await transport<number>({ type: 'get_host_info' }, 1_000);
  expect(result).toEqual({ ok: true, data: 1 });
  // 给 microtask/tick 队列时间：若 reject 逃逸，bun test 以 unhandled rejection 判红
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
});
