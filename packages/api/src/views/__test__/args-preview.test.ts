import { describe, expect, test } from 'bun:test';

import { clip, previewArgs } from '../args-preview';

describe('previewArgs · 字段优先级与防御', () => {
  test.each([
    ['命令本体优先（command）', { command: 'git status' }, 'git status'],
    ['cmd 别名', { cmd: 'ls -la' }, 'ls -la'],
    ['路径次之（path）', { path: 'src/a.ts' }, 'src/a.ts'],
    ['file_path 兼容', { file_path: 'x.ts', n: 1 }, 'x.ts'],
    ['pattern', { pattern: 'TODO' }, 'TODO'],
    ['query', { query: '如何' }, '如何'],
    ['url', { url: 'https://x.dev' }, 'https://x.dev'],
    ['name', { name: 'explore' }, 'explore'],
    ['subagent_type', { subagent_type: 'general-purpose' }, 'general-purpose'],
    ['无已知字段取首项字符串值', { z: 'first', y: 2 }, 'first'],
    ['首项非字符串走浅层 JSON', { z: { a: 1, b: [1, 2] } }, '{"a":1,"b":[1,2]}'],
    ['空参数', {}, ''],
  ])('%s', (_name, args, expected) => {
    expect(previewArgs(args as Record<string, unknown>)).toBe(expected);
  });

  test('多行保留换行（口径 B：行边界留给渲染层）、超长截断到 160', () => {
    // 换行不折叠：命令预览要保住分行结构，折叠后注释/heredoc 的边界不可恢复
    expect(previewArgs({ command: 'echo a\n  b\tc' })).toBe('echo a\n  b\tc');
    const long = previewArgs({ command: 'x'.repeat(300) });
    expect(long.length).toBe(160);
    expect(long.endsWith('…')).toBe(true);
  });

  test('症状回归：截断点落在增补平面字符上不劈代理对（不产生替换符）', () => {
    // 截断点恰在高位代理上：该 emoji 整体舍弃，不留孤立代理项
    const splitPoint = clip(`${'x'.repeat(158)}😀😀`);
    expect(splitPoint).toBe(`${'x'.repeat(158)}…`);
    // 截断点在 emoji 完整落位之后：整体保留
    const wholeEmoji = clip(`${'x'.repeat(157)}😀😀`);
    expect(wholeEmoji).toBe(`${'x'.repeat(157)}😀…`);
    expect(splitPoint).not.toContain('\uFFFD');
    expect(wholeEmoji).not.toContain('\uFFFD');
  });
});

describe('clip · 保留换行（口径 B：对齐 pi 的 formatShellCall）', () => {
  test('症状回归：模型写在命令前的 shell 注释不得与命令粘连（用户实拍 # meter 54 用例全绿…）', () => {
    // 早前 clip 做 \s+→' '，注释与命令压成一行，界面上看起来像
    // 「思考被写进工具执行的消息里」——那不是 thinking，是 # 注释
    const raw = '# meter 54 用例全绿。四门全跑（worktree 全仓）\ncd /Users/wrr/work/x-harness-turn-reduction && bun run ci';
    const preview = previewArgs({ command: raw });
    // 换行保留 = 边界还在，下游 toolSummary 才能把注释整行去掉
    expect(preview).toContain('\n');
    expect(preview.split('\n')[0]).toBe('# meter 54 用例全绿。四门全跑（worktree 全仓）');
    expect(preview.split('\n')[1]).toBe('cd /Users/wrr/work/x-harness-turn-reduction && bun run ci');
  });

  test('换行原样保留（不折叠、不 strip）', () => {
    expect(clip('a\nb\nc')).toBe('a\nb\nc');
    expect(clip('cd /x\n  && bun test')).toBe('cd /x\n  && bun test');
  });

  test('超长时按行边界截断（不把一行劈成两半）', () => {
    const long = `${'x'.repeat(100)}\n${'y'.repeat(100)}`;
    const out = clip(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
    // 第一行完整保留，没被从中间切断
    expect(out.startsWith('x'.repeat(100))).toBe(true);
  });

  test('单行长命令仍按字符截断（无换行可依）', () => {
    const out = clip('z'.repeat(400));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(160);
  });

  test('症状回归：「已运行」后面没有命令——注释吃光截断预算后 toolSummary 剥完为空', () => {
    // 用户实拍形态：模型在命令前写长段 # 说明，previewArgs 的 160 截断被注释占满，
    // 渲染层 toolSummary 把整行注释剥掉后行内什么都不剩。
    // 修复：注释行不占预算——命令本体必须进入预览。
    const raw =
      '# 18/18 过。但第二个失败还揭示一件事：全界内 allow 用例里「batch in-root」归因路径在 V4 下 posture 插件先接手（in-root allow 由 postureDecide 出）——现在过了说明聚合链正确接上了。\n# 全仓四门（合并结果验证）\ncd /Users/wrr/work/x-harness && bun run lint && bun run typecheck && bun run build';
    const preview = previewArgs({ command: raw });
    // 剥掉注释后的可展示内容必须非空（命令本体在场）
    const displayable = preview
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join(' ')
      .trim();
    expect(displayable).toContain('cd /Users/wrr/work/x-harness');
    // 注释行仍在预览里（title 悬停能读到原意）
    expect(preview).toContain('# 全仓四门');
  });

  test('注释行零预算：非注释行在剩余预算内按行截断，行序不变', () => {
    const raw = '# 短注释\n' + `${'a'.repeat(80)}\n` + `${'b'.repeat(80)}`;
    const out = clip(raw);
    // 总长 160+ 会截断，但注释行不占预算：两行命令共 161 位放不下第二行——切在行边界
    expect(out).toContain('# 短注释');
    expect(out).toContain('a'.repeat(80));
    expect(out.endsWith('…')).toBe(true);
  });

  test('整段都是注释：退回无差别截断（原文本就没有命令可保）', () => {
    const raw = `${'# 只注释'.repeat(60)}`;
    const out = clip(raw);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
  });
});
