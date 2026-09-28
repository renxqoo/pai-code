import { describe, expect, test } from 'bun:test';

import { toolSummary } from '../tool-summary';

/**
 * 命令摘要：**命令忠实展示，一行放不下才由视觉层截断**（用户裁决，两次确认）。
 *
 * 唯一允许的加工是「去整行注释」与「折平空白」——任何内容改写（剥 flag、
 * 剥目录前缀、切命令链、剥重定向）都会让显示的不再是原命令。曾经的实现
 * 因为剥重定向，把 `cd /x && python3 - <<'EOF' …` 吃成只剩 `python3`。
 */
describe('toolSummary 命令忠实展示', () => {
  test('短命令原样：动作、参数、flag、路径全部保留', () => {
    expect(toolSummary('bun test')).toBe('bun test');
    expect(toolSummary('git status')).toBe('git status');
    expect(toolSummary('bun test --coverage')).toBe('bun test --coverage');
    expect(toolSummary('grep -rn TODO src')).toBe('grep -rn TODO src');
    expect(toolSummary('cat apps/mobile/src/strings/zh.ts')).toBe('cat apps/mobile/src/strings/zh.ts');
  });

  test('命令链原样保留（曾被切到只剩 cd 后的第一个动词）', () => {
    const cmd = "cd /Users/wrr/work/agent-app && python3 - <<'PY'\np='a.tsx'\nPY";
    expect(toolSummary(cmd)).toBe("cd /Users/wrr/work/agent-app && python3 - <<'PY' p='a.tsx' PY");
  });

  test('症状回归：heredoc 命令必须完整展示（剥重定向曾把 << 一起吃掉）', () => {
    // 用户的真实命令形态
    const cmd =
      "cd /Users/wrr/work/agent-app && python3 - <<'PY'\np='apps/electron/src/renderer/src/thread/__test__/tool-call-row.test.tsx'\ns=open(p).read()\nPY";
    const summary = toolSummary(cmd);
    expect(summary).toContain('python3');
    expect(summary).toContain("<<'PY'");
    expect(summary).not.toBe('python3');
    // 不得只剩动词
    expect(summary.split(' ').length).toBeGreaterThan(2);
  });

  test('重定向与管道原样保留（不剥——`cat > f` 就是这条命令的一部分）', () => {
    expect(toolSummary('cat > out.txt')).toBe('cat > out.txt');
    expect(toolSummary('cat a.txt >> log')).toBe('cat a.txt >> log');
    expect(toolSummary('cat f.txt | wc -l')).toBe('cat f.txt | wc -l');
  });

  test('同名不同包可区分（剥 basename 会让它们变成两行一样的文字）', () => {
    expect(toolSummary('cat packages/api/src/views/foo.ts')).not.toBe(toolSummary('cat packages/ui/src/views/foo.ts'));
  });

  test('症状回归：模型写在命令前的 shell 注释不进摘要（用户实拍 # meter 54 用例全绿…）', () => {
    // 换行由 argsPreview 保留（口径 B），注释在摘要层按整行去掉——
    // 折平后注释与命令连成一行，界面上看起来像「思考被写进了工具执行的消息里」
    expect(toolSummary('# meter 54 用例全绿。四门全跑\ncd /x && bun run ci')).toBe('cd /x && bun run ci');
    expect(toolSummary('# a\n# b\nbun test')).toBe('bun test');
    expect(toolSummary('; 说明\nbun test')).toBe('bun test');
  });

  test('症状回归：「已运行」后面没有命令——预览只剩注释行时摘要为空串不得发生（预算侧修复的下游护栏）', () => {
    // 完整管线症状：previewArgs(160 截断) 曾被注释吃光预算 → toolSummary 剥完为空。
    // 预算侧已修（注释不占额度）；本断言锁展示层行为：正常预览剥注释后必非空。
    // 若上游又送来只剩注释的预览，摘要为空串是数据面事实——组件层需容忍空串不悬挂。
    expect(toolSummary('# a\n# b')).toBe('');
    expect(toolSummary('cd /x && bun run ci')).toBe('cd /x && bun run ci');
    expect(toolSummary('# a\ncd /x\n# b\nbun test')).toBe('cd /x bun test');
  });

  test('引号内的 # 不是注释，完整保留（不能误伤实参）', () => {
    expect(toolSummary('grep -n "#" src')).toBe('grep -n "#" src');
    expect(toolSummary('sed -i "/#/d" a.txt')).toBe('sed -i "/#/d" a.txt');
    expect(toolSummary('curl https://x.com/#frag')).toBe('curl https://x.com/#frag');
    expect(toolSummary('a#b')).toBe('a#b');
  });

  test('摘要层不产省略号：截断交给视觉层按真实渲染宽度裁剪（用户裁决口径 A）', () => {
    // 任何 JS 字符上限都表达不了「一行放不下」：等宽下 CJK 是 ASCII 两倍宽
    expect(toolSummary('bun test')).not.toContain('…');
    expect(toolSummary('sed -n 1,60p apps/mobile/src/chat/timeline-list.tsx')).not.toContain('…');
    // 超长命令原样透出，由行内视觉层（CSS truncate / numberOfLines）截断
    const long = 'b'.repeat(500);
    expect(toolSummary(long)).toBe(long);
    expect(toolSummary(long)).not.toContain('…');
  });

  test('多行命令折平成一行（行内不得出现换行/制表），但内容一字不少', () => {
    const messy = "python3 - <<'PY'\nimport os\nprint('中文')\nPY";
    const summary = toolSummary(messy);
    expect(summary).not.toContain('\n');
    expect(summary).not.toContain('\t');
    // heredoc 正文确实在（忠实展示），只是被折平
    expect(summary).toContain('import os');
    expect(summary).toContain('中文');
  });

  test('空白折叠：多余空格不撑宽行', () => {
    expect(toolSummary('bun   test    --coverage')).toBe('bun test --coverage');
    expect(toolSummary('  bun test  ')).toBe('bun test');
  });

  test('引号原样保留：引号对 shell 是语法内容（撕破它比多两个字符糟得多）', () => {
    // 症状回归：曾把 `"./lint.sh" --fix "src/**"` 剥成
    // `./lint.sh" --fix "src/**`（引号不平衡的破命令）
    expect(toolSummary('"./lint.sh" --fix "src/**"')).toBe('"./lint.sh" --fix "src/**"');
    expect(toolSummary('`git status`')).toBe('`git status`');
    expect(toolSummary('"quoted task description"')).toBe('"quoted task description"');
  });

  test('垃圾输入安全降级', () => {
    expect(toolSummary('')).toBe('');
    expect(toolSummary('   ')).toBe('');
  });
});
