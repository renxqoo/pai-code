/**
 * 技能导入纯函数族（T42 M1；H 路线，D1=H）：形态判定与落盘全在 hub（skills/inspect|
 * skills/install，单一判定源）——本文件**零校验规则镜像**（不解析 frontmatter、不复制
 * 装载器规则），只含三类纯逻辑：
 * 1) 候选发现：两深度目录扫描（深度 2 拍平；fs 可注入）；
 * 2) hub 问题码/错误码 → app 错误 kind 的映射表（完备、未知码兜底）；
 * 3) 导入计划：目标名围栏/改名/冲突预检（hub 同名硬门的 app 预演，只为对话框可行动文案）。
 */
import type {
  ApiError,
  SkillCandidateView,
  SkillInspectedCandidate,
  SkillProblemCode,
  SkillView,
} from '@paiapp/contracts';

import { appError } from '../errors';

/** 目标名围栏（app 提交前预检；hub isSkillName 是同侧硬门的下界——本围栏更严）：
 *  首字符字母数字，其余字母数字/点/下划线/连字符，≤64；`.`/`..` 天然不达围栏。 */
const SKILL_NAME_FENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isInstallableSkillName(value: string): boolean {
  return value !== '.' && value !== '..' && SKILL_NAME_FENCE.test(value);
}

/** 候选诊断码闭集 = hub SkillProblemCode ∪ 'name_mismatch'（rename 态补码）。 */
export const SKILL_PROBLEM_CODES: readonly SkillProblemCode[] = [
  'not_found',
  'unreadable',
  'not_regular_file',
  'too_large',
  'no_frontmatter',
  'frontmatter_not_flat',
  'missing_fields',
];

/** hub 问题码 → app 错误 kind（T42 §1 错误形态；未知码兜底 skill_invalid）：
 *  not_found = 无 SKILL.md → skill_source_invalid（源侧问题）；
 *  其余六码（形态/字节问题）→ skill_invalid。 */
export function skillProblemKind(problem: string): 'skill_source_invalid' | 'skill_invalid' {
  return problem === 'not_found' ? 'skill_source_invalid' : 'skill_invalid';
}

/** hub skills/install 失败 → app 错误 kind（映射表，零判定语义）：
 *  name_conflict → skill_exists；io_failed/internal/state_conflict → skill_write_failed；
 *  unknown_command/unregistered_code（旧 hub，< 60 词表）→ skill_not_supported；
 *  invalid_input 按报文分诊（问题码 token → 对应 kind；name 围栏 → skill_name_invalid；
 *  其余 invalid_input 均涉源 → skill_source_invalid）；
 *  transient 族原样透传（不折平 face）。 */
export function mapSkillInstallError(error: ApiError): ApiError {
  switch (error.kind) {
    case 'name_conflict':
      return appError('skill_exists', error.message);
    case 'io_failed':
    case 'internal':
    case 'state_conflict':
      return appError('skill_write_failed', error.message);
    case 'unknown_command':
    case 'unregistered_code':
      return appError('skill_not_supported', error.message);
    case 'invalid_input':
      return appError(invalidInputKind(error.message), error.message);
    default:
      return error;
  }
}

function invalidInputKind(message: string): 'skill_invalid' | 'skill_name_invalid' | 'skill_source_invalid' {
  for (const problem of SKILL_PROBLEM_CODES) {
    // hub 报文形态：`invalid skill source: <problem>: <path>`（problem 是词表 token）
    if (message.includes(`: ${problem}:`)) return skillProblemKind(problem);
  }
  return message.includes('invalid skill name') ? 'skill_name_invalid' : 'skill_source_invalid';
}

/** hub skills/inspect 失败 → app 错误 kind（旧 hub 缺命令 → skill_not_supported；余原样）。 */
export function mapSkillInspectError(error: ApiError): ApiError {
  return error.kind === 'unknown_command' || error.kind === 'unregistered_code'
    ? appError('skill_not_supported', error.message)
    : error;
}

/** hub inspect 单项 → 候选视图（origin 由发现侧贴标签；blocked 回退名 = 源目录名）。 */
export function combineCandidate(
  inspected: SkillInspectedCandidate,
  origin: SkillCandidateView['origin'],
): SkillCandidateView {
  const sourcePath = inspected.sourcePath;
  if (inspected.state === 'blocked') {
    return {
      name: sourcePath.split('/').filter(Boolean).pop() ?? sourcePath,
      description: '',
      sourcePath,
      origin,
      state: 'blocked',
      problem: inspected.problem,
    };
  }
  return {
    name: inspected.name,
    description: inspected.description,
    sourcePath,
    origin,
    state: inspected.state,
    problem: inspected.state === 'rename' ? 'name_mismatch' : null,
  };
}

/** 导入计划（提交 hub skills/install 的参数；预检只为对话框可行动文案——hub 硬门为准）。 */
export interface ImportPlan {
  readonly sourcePath: string;
  readonly name: string;
  readonly overwrite: boolean;
}

export function planImport(input: {
  candidate: SkillCandidateView;
  /** 显式目标名（用户改名）；缺省 = 候选建议名。 */
  name?: string;
  overwrite: boolean;
  /** 当前清单（冲突预检）；hub skills/list 同源。 */
  installed: readonly SkillView[];
}): { ok: true; plan: ImportPlan } | { ok: false; error: ApiError } {
  const { candidate } = input;
  if (candidate.state === 'blocked') {
    return { ok: false, error: appError(skillProblemKind(candidate.problem ?? 'missing_fields'), candidate.problem ?? undefined) };
  }
  const name = input.name ?? candidate.name;
  if (!isInstallableSkillName(name)) {
    return { ok: false, error: appError('skill_name_invalid', `invalid skill name: ${name}`) };
  }
  const conflict = input.installed.some((skill) => skill.name === name && skill.source === 'user');
  if (conflict && input.overwrite !== true) {
    return { ok: false, error: appError('skill_exists', `skill already installed: ${name}`) };
  }
  return { ok: true, plan: { sourcePath: candidate.sourcePath, name, overwrite: input.overwrite === true } };
}

/** 路径包含判定（child 须已 realpath 归一；纯字符串比较）：
 *  相等或位于 parent 的下级 —— 前缀兄弟（/a/bc 对 /a/b）不算。 */
export function isPathInside(parent: string, child: string): boolean {
  const root = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return child === root || child.startsWith(`${root}/`);
}

/** 候选发现的 fs 面（node:fs/promises 结构子集；测试可注入）。 */
export interface ScanFs {
  readdir(path: string, options: { withFileTypes: true }): Promise<ScanDirent[]>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}
export interface ScanDirent {
  name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/** POSIX 绝对路径拼接（纯包禁 node types；条目名不含分隔符，拼接即收敛） */
function joinPath(parent: string, name: string): string {
  return `${parent.endsWith('/') ? parent.slice(0, -1) : parent}/${name}`;
}

/** 源根发现（T42 §7 扫描口径）：
 *  - 根自身带 SKILL.md → 根即候选（用户可能直接选中技能目录）；
 *  - 深度 1 非隐藏目录带 SKILL.md → 候选；无 SKILL.md 的深度 1 目录**下探一级拍平**（嵌套形态
 *    `@scope/skill`），其下非隐藏且带 SKILL.md 的目录 → 候选；更深层不扫；
 *  - 隐藏条目（`.` 开头）跳过；无 SKILL.md 的目录忽略；symlink 目录跟随（越界拒在白名单层）。
 *  只做发现不做判定——形态/字节判定是 hub skills/inspect 的事。 */
export async function discoverSkillDirs(
  fs: ScanFs,
  root: string,
  origin: SkillCandidateView['origin'],
): Promise<Array<{ sourcePath: string; origin: SkillCandidateView['origin'] }>> {
  const out: Array<{ sourcePath: string; origin: SkillCandidateView['origin'] }> = [];
  if (await hasSkillMd(fs, root)) return [{ sourcePath: root, origin }];
  const entries = await readDirs(fs, root);
  for (const entry of entries) {
    const dir = joinPath(root, entry.name);
    if (await hasSkillMd(fs, dir)) {
      out.push({ sourcePath: dir, origin });
      continue;
    }
    for (const nested of await readDirs(fs, dir)) {
      const nestedDir = joinPath(dir, nested.name);
      if (await hasSkillMd(fs, nestedDir)) out.push({ sourcePath: nestedDir, origin });
    }
  }
  return out;
}

/** 非隐藏目录条目（symlink 跟随判目录；缺失/坏形状 → 空表） */
async function readDirs(fs: ScanFs, root: string): Promise<ScanDirent[]> {
  let entries: ScanDirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ScanDirent[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      out.push(entry);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const target = await fs.stat(joinPath(root, entry.name)).catch(() => undefined);
      if (target?.isDirectory()) out.push(entry);
    }
  }
  return out;
}

/** SKILL.md 在场探测（仅在场性——可解析性归 hub inspect） */
async function hasSkillMd(fs: ScanFs, dir: string): Promise<boolean> {
  const info = await fs.stat(joinPath(dir, 'SKILL.md')).catch(() => undefined);
  return info?.isDirectory() === false;
}
