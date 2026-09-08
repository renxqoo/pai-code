import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 用户级技能目录与 pi 启停语义（agentDir/settings.json 的 skills overrides）：
 * pi 的精确条目按 baseDir 相对路径匹配——两种用户级来源（agentDir/skills 与 ~/.agents/skills）
 * 的技能相对路径同为 `skills/<rel>`（递归嵌套为 `skills/a/b`），故 Pai 固定生成/消费该形态；
 * 手写的 glob/绝对路径条目原样保留（Pai 判定只认精确条目子集）。
 * 扫描对齐 pi 的 collectSkillEntries：跳过 `.` 开头与 node_modules、父目录无 SKILL.md 时递归下钻、
 * 跟随符号链接目录（根级散装 .md 文件形态不处理——罕见，留档）。
 */

export interface SkillEntry {
  name: string;
  description: string | null;
  enabled: boolean;
  origin: 'agent' | 'agents';
}

/** 技能名（相对 skills 根的 posix 路径）→ pi override 精确条目形态（相对 baseDir）。 */
export function skillPatternOf(name: string): string {
  return `skills/${name}`;
}

/** pi settings 的 skills 数组宽容读取：非数组/非字符串项丢弃。 */
export function parseSkillPatterns(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
  const skills = (raw as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) return [];
  return skills.filter((item): item is string => typeof item === 'string');
}

/** 精确条目归一（pi 语义：剥 `./` 前缀后字面比较）。 */
const normalizeExact = (pattern: string): string => pattern.replace(/^\.\//, '');

const exactHit = (pattern: string, target: string): boolean =>
  (pattern.startsWith('-') || pattern.startsWith('+') || pattern.startsWith('!')) && normalizeExact(pattern.slice(1)) === target;

/**
 * 启停判定（pi isEnabledByOverrides 的精确条目子集，优先级一致）：
 * `!target` 排除 → `+target` 精确复活 → `-target` 精确击杀（最高）。
 * 手写 glob/绝对路径条目不参与（显示为启用，已知局限）。
 */
export function skillDisabledBy(patterns: readonly string[], name: string): boolean {
  const target = skillPatternOf(name);
  let disabled = false;
  if (patterns.some((pattern) => pattern.startsWith('!') && exactHit(pattern, target))) disabled = true;
  if (patterns.some((pattern) => pattern.startsWith('+') && exactHit(pattern, target))) disabled = false;
  if (patterns.some((pattern) => pattern.startsWith('-') && exactHit(pattern, target))) disabled = true;
  return disabled;
}

/** toggle 条目增删：disable 追加 `-target`；enable 移除排他条目（`-`/`!`），保留手写 `+`。 */
export function toggleSkillPatterns(patterns: readonly string[], name: string, enabled: boolean): string[] {
  const target = skillPatternOf(name);
  if (enabled) {
    return patterns.filter((pattern) => !(pattern.startsWith('-') || pattern.startsWith('!')) || !exactHit(pattern, target));
  }
  if (patterns.some((pattern) => pattern.startsWith('-') && exactHit(pattern, target))) return [...patterns];
  return [...patterns, `-${target}`];
}

/** SKILL.md frontmatter 的 description 提取（轻量行扫描；无/畸形 → null）。 */
export function skillDescription(skillMdPath: string): string | null {
  try {
    const content = readFileSync(skillMdPath, 'utf8');
    const lines = content.split('\n').slice(0, 60);
    let inFrontmatter = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!inFrontmatter) {
        if (trimmed === '---') inFrontmatter = true;
        continue;
      }
      if (trimmed === '---') break;
      const match = /^description:\s*(.*)$/.exec(trimmed);
      if (match !== null) {
        const value = match[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
        return value.length > 0 ? value : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface SkillDirSource {
  origin: 'agent' | 'agents';
  dir: string;
}

const isIgnoredDir = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** 收集一个技能目录下的技能（相对根的 posix 路径为名；对齐 pi 的递归与忽略规则）。 */
function collectSkillNames(skillsRoot: string, prefix: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(skillsRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isIgnoredDir(entry)) continue;
    const child = join(skillsRoot, entry);
    if (!isDirectory(child)) continue;
    const rel = prefix.length > 0 ? `${prefix}/${entry}` : entry;
    if (existsSync(join(child, 'SKILL.md'))) {
      out.push(rel);
      continue;
    }
    // 父目录不是技能：递归下钻（pi 对无 SKILL.md 的父目录继续找嵌套技能）
    collectSkillNames(child, rel, out);
  }
}

/** 扫描两处用户级技能目录：返回 {name（相对路径）, skillMd}；目录缺失静默空。 */
function listSkillFiles(sources: readonly SkillDirSource[]): Array<{ name: string; skillMd: string; origin: 'agent' | 'agents' }> {
  const out: Array<{ name: string; skillMd: string; origin: 'agent' | 'agents' }> = [];
  for (const source of sources) {
    const names: string[] = [];
    collectSkillNames(source.dir, '', names);
    for (const name of names) out.push({ name, skillMd: join(source.dir, ...name.split('/'), 'SKILL.md'), origin: source.origin });
  }
  return out;
}

export interface SkillsInventoryDeps {
  /** 目录列表注入（测试替身）；缺省真实 readdirSync/existsSync。 */
  listDir?: (dir: string) => string[] | null;
  fileExists?: (path: string) => boolean;
}

/** 全集 + 启用态合成（同名双源一并生效）。 */
export function buildSkillInventory(sources: readonly SkillDirSource[], patterns: readonly string[], deps: SkillsInventoryDeps = {}): SkillEntry[] {
  const files = deps.listDir !== undefined ? injectedInventory(sources, deps) : listSkillFiles(sources);
  return files.map((file) => ({ name: file.name, description: skillDescription(file.skillMd), origin: file.origin, enabled: !skillDisabledBy(patterns, file.name) }));
}

/** 测试替身路径：注入的一层目录 + SKILL.md 判定（保持旧注入面）。 */
function injectedInventory(sources: readonly SkillDirSource[], deps: SkillsInventoryDeps): Array<{ name: string; skillMd: string; origin: 'agent' | 'agents' }> {
  const fileExists = deps.fileExists ?? existsSync;
  const out: Array<{ name: string; skillMd: string; origin: 'agent' | 'agents' }> = [];
  for (const source of sources) {
    const names = deps.listDir?.(source.dir) ?? null;
    if (names === null) continue;
    for (const name of names) {
      const skillMd = join(source.dir, name, 'SKILL.md');
      if (!fileExists(skillMd)) continue;
      out.push({ name, skillMd, origin: source.origin });
    }
  }
  return out;
}

