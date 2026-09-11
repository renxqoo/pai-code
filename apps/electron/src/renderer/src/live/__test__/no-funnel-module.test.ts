import { expect, test } from 'bun:test';

/** 漏斗退役断言（T34 §3.4）：use-live-workspace 模块已物理删除（import 必须失败）。 */
test('use-live-workspace 模块不存在（漏斗退役）', async () => {
  let importable = true;
  try {
    await import('../use-live-workspace');
  } catch {
    importable = false;
  }
  expect(importable).toBe(false);
});
