import { describe, expect, test } from 'bun:test';

import { toolGroupSummary } from '../tool-group-summary';
import type { ToolCallStatus } from '@x3code/contracts';
import type { ToolCallRef } from '../tool-refs';
import { zhToolCopy } from './zh-tool-copy';

function call(name: string, status: ToolCallStatus = 'ok'): ToolCallRef {
  return { name, status };
}

/** 组标题：工具调用 + 思考次数（思考不进子行，只计标题）。 */
const summary = (calls: readonly ToolCallRef[], thinking = 0): string =>
  toolGroupSummary({ calls, thinkingCount: thinking }, zhToolCopy);

describe('toolGroupSummary 计数式标题（逐字断言）', () => {
  test('单桶带计数：都是编辑 → 编辑 3 个文件', () => {
    expect(summary([call('edit'), call('edit'), call('edit')])).toBe('编辑 3 个文件');
    // write 与 edit 同桶（都是文件改写），计数合并
    expect(summary([call('edit'), call('write'), call('edit')])).toBe('编辑 3 个文件');
  });

  test('多桶按桶序拼接（编辑 → 思考 → 命令）：半角逗号 + 空格', () => {
    expect(summary([call('edit'), call('bash')], 2)).toBe('编辑 1 个文件, 思考 2 次, 运行 1 条命令');
  });

  test('思考计入标题：只有思考时也算一个桶', () => {
    expect(summary([], 3)).toBe('思考 3 次');
    // 思考排在编辑之后、阅读之前（桶序固定，与到达序无关）
    expect(summary([call('read'), call('read')], 1)).toBe('思考 1 次, 查看 2 个文件');
  });

  test('命令桶排位靠后但不受截断影响（保底）', () => {
    // 阅读 / 目录 / 命令 / 子代理 四桶：>3 收口，子代理在末位，命令必须挤进去
    expect(summary([call('read'), call('ls'), call('bash'), call('agent_spawn')])).toBe(
      '查看 1 个文件, 列出 1 个目录, 运行 1 条命令',
    );
    // 命令已在入选三桶内时保底不触发，不替换任何一条
    expect(summary([call('bash'), call('read'), call('ls'), call('agent_spawn')])).toBe(
      '查看 1 个文件, 列出 1 个目录, 运行 1 条命令',
    );
  });

  test('>3 桶收口只取前三，不追加「等」', () => {
    expect(summary([call('edit'), call('read'), call('grep'), call('ls')])).toBe(
      '编辑 1 个文件, 查看 1 个文件, 搜索 1 次',
    );
    // 真实长跑的形态：思考 / 查看 / 命令 都在，收口词不出现
    expect(summary([call('read'), call('read'), call('read'), call('bash'), call('bash')], 9)).toBe(
      '思考 9 次, 查看 3 个文件, 运行 2 条命令',
    );
  });

  test('空输入降级为空串（不渲染悬空标题）', () => {
    expect(summary([])).toBe('');
  });

  test('未知工具点名（不因名分桶、不追加收口词）', () => {
    expect(summary([call('weird_tool')])).toBe('调用 1 次 weird_tool');
    // 未知桶只点名首个工具名（不比动宾流水版更啰嗦）
    expect(summary([call('weird_tool'), call('other_tool'), call('third_tool')])).toBe('调用 3 次 weird_tool');
  });
});