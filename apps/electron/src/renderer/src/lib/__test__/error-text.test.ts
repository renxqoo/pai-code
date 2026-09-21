import { describe, expect, test } from 'bun:test';

import { copyOfError } from '../error-text';

/** copyOfError 查表（bun test 无 window → 默认语言 zh，与 new-task-copy 同装置口径）。 */

describe('copyOfError', () => {
  test('kind 查表命中对应文案（message 不再拼接进密文）', () => {
    expect(copyOfError({ kind: 'branch_exists' })).toBe('同名分支已存在，换一个名称。');
    expect(copyOfError({ kind: 'invalid_params' })).toBe('参数不合法，请检查后重试。');
    expect(copyOfError({ kind: 'model_unavailable', message: 'Model not found: x' })).toBe('所选模型不可用，请在设置中检查 Provider 配置。');
    expect(copyOfError({ kind: 'capability_images' })).toBe('当前模型不接受图片附件，请移除附件或切换到多模态模型。');
  });

  test('transient 按 face 细分（kind 恒为 transient 无区分度）；message 为诊断原文，存在时括注透传（不折平）', () => {
    expect(copyOfError({ kind: 'transient', face: 'host_unavailable' })).toBe('agent 宿主未就绪（正在启动或重启），请稍后重试。');
    expect(copyOfError({ kind: 'transient', face: 'host_failed' })).toBe('agent 宿主未就绪（正在启动或重启），请稍后重试。');
    expect(copyOfError({ kind: 'transient', face: 'busy' })).toBe('宿主忙，请稍后重试。');
    expect(copyOfError({ kind: 'transient', face: 'timeout', message: 'git_failed:timeout' })).toBe('操作超时，请重试。（git_failed:timeout）');
    expect(copyOfError({ kind: 'transient', face: 'command_failed', message: '' })).toBe('命令执行失败，请重试。');
  });

  test('unregistered_code 原文透传（code+message 不丢——e2e 断言它可见）', () => {
    expect(copyOfError({ kind: 'unregistered_code', code: 'future_code', message: 'boom' })).toBe('future_code: boom');
    expect(copyOfError({ kind: 'unregistered_code', code: 'future_code', message: '' })).toBe('future_code');
  });
});
