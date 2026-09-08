import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildSkillInventory, parseSkillPatterns, skillDescription, skillDisabledBy, toggleSkillPatterns } from '../skills-inventory';

/** 技能开关（T13）纯函数回归：pi settings skills 宽容解析、精确名启停、目录扫描。 */

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pai-skills-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseSkillPatterns（pi settings skills 宽容读取）', () => {
  test('合法数组透传；非字符串项丢弃', () => {
    expect(parseSkillPatterns({ skills: ['-a', '!b', '+c', 3, null] })).toEqual(['-a', '!b', '+c']);
  });

  test.each([
    ['缺 skills 键', {}],
    ['skills 非数组', { skills: '-a' }],
    ['非对象输入', '-a'],
    ['null', null],
  ])('%s → 空数组', (_name, raw) => {
    expect(parseSkillPatterns(raw)).toEqual([]);
  });
});

describe('skillDisabledBy / toggleSkillPatterns（pi override 精确名子集）', () => {
  test('表驱动：`-skills/name` 与 `!skills/name` 判禁用；`+`/裸名/部分匹配不判禁用', () => {
    const patterns = ['-skills/rxopen-hot', '!skills/tavily', '+skills/keep', 'plain', '-skills/sub/dir/name'];
    expect(skillDisabledBy(patterns, 'rxopen-hot')).toBe(true);
    expect(skillDisabledBy(patterns, 'tavily')).toBe(true);
    expect(skillDisabledBy(patterns, 'keep')).toBe(false);
    expect(skillDisabledBy(patterns, 'plain')).toBe(false);
    expect(skillDisabledBy(patterns, 'rxopen')).toBe(false);
    expect(skillDisabledBy(patterns, 'name')).toBe(false);
  });

  test('disable 追加 `-skills/name`（幂等）；enable 移除精确条目、保留其余', () => {
    const base = ['+skills/keep', '-skills/other', 'glob-*'];
    expect(toggleSkillPatterns(base, 'hot', false)).toEqual(['+skills/keep', '-skills/other', 'glob-*', '-skills/hot']);
    const once = toggleSkillPatterns(base, 'hot', false);
    expect(toggleSkillPatterns(once, 'hot', false)).toEqual(once);
    expect(toggleSkillPatterns(['-skills/hot', '!skills/hot', '+skills/hot', '-skills/x'], 'hot', true)).toEqual(['+skills/hot', '-skills/x']);
  });

  test('对抗审查补：pi 优先级子集——`!`+`+` 组合为启用，`-` 击杀最高；`./` 前缀归一', () => {
    expect(skillDisabledBy(['!skills/x', '+skills/x'], 'x')).toBe(false);
    expect(skillDisabledBy(['!skills/x', '-skills/x'], 'x')).toBe(true);
    expect(skillDisabledBy(['+skills/x', '-skills/x'], 'x')).toBe(true);
    expect(skillDisabledBy(['-./skills/x'], 'x')).toBe(true);
    expect(skillDisabledBy(['!./skills/x'], 'x')).toBe(true);
  });
});

describe('skillDescription（frontmatter 提取）', () => {
  test('有引号/无引号/多行 frontmatter 均可取；无 description 或无 frontmatter → null', () => {
    const dir = tempDir();
    const write = (name: string, body: string): string => {
      const path = join(dir, name, 'SKILL.md');
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(path, body);
      return path;
    };
    expect(skillDescription(write('a', '---\nname: a\ndescription: "查天气"\n---\n正文'))).toBe('查天气');
    expect(skillDescription(write('b', '---\nname: b\ndescription: no-quote\n---\n'))).toBe('no-quote');
    expect(skillDescription(write('c', '---\nname: c\n---\n'))).toBeNull();
    expect(skillDescription(write('d', 'no frontmatter'))).toBeNull();
    expect(skillDescription(write('e', '---\ndescription:\n---\n'))).toBeNull();
    expect(skillDescription(join(dir, 'missing', 'SKILL.md'))).toBeNull();
  });
});

describe('buildSkillInventory（目录扫描 + 启用态）', () => {
  test('SKILL.md 子目录计入、缺目录静默空、同名双源一并禁用', () => {
    const agentDir = tempDir();
    const agentsDir = tempDir();
    mkdirSync(join(agentDir, 'alpha', ), { recursive: true });
    writeFileSync(join(agentDir, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: A\n---\n');
    mkdirSync(join(agentDir, 'not-a-skill'), { recursive: true });
    mkdirSync(join(agentsDir, 'beta'), { recursive: true });
    writeFileSync(join(agentsDir, 'beta', 'SKILL.md'), '---\nname: beta\n---\n');
    mkdirSync(join(agentsDir, 'alpha'), { recursive: true });
    writeFileSync(join(agentsDir, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\n');

    const sources = [
      { origin: 'agent' as const, dir: agentDir },
      { origin: 'agents' as const, dir: agentsDir },
      { origin: 'agent' as const, dir: join(agentDir, 'missing') },
    ];
    expect(buildSkillInventory(sources, [])).toEqual([
      { name: 'alpha', description: 'A', enabled: true, origin: 'agent' },
      { name: 'beta', description: null, enabled: true, origin: 'agents' },
      { name: 'alpha', description: null, enabled: true, origin: 'agents' },
    ]);
    expect(buildSkillInventory(sources, ['-skills/alpha'])[0]?.enabled).toBe(false);
    expect(buildSkillInventory(sources, ['-skills/alpha'])[2]?.enabled).toBe(false);
  });
});
