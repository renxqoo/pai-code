import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 用户 worktree 登记面（SESSION-WORKTREE-WORKFLOW §1.6 三张表，单 JSON 持久化）：
 * 1. dirs——目录白名单（extraCwds 消费面：isKnownCwd 放行分支段/附件搜索；不进
 *    pickedRoots 信任面——技能/插件批准根零交集）；
 * 2. treeToRepoTop——树路径→主仓映射（侧栏组键与 [wt] 徽标悬停数据源——D3 编码
 *    切分不可逆，词法推导不成立，映射表是唯一可靠源）；
 * 3. sessionTrees——threadId→树路径（派生树 chip；单值 last-wins——同会话二次
 *    建树覆盖前值，旧树仍经分支面板可达）。
 * GC：remove 成功顺带清条目 + 启动时按树存在性过滤（防白名单只增不减与死路径 chip）。
 */

export interface WorktreeRegistryData {
  readonly dirs: readonly string[];
  readonly treeToRepoTop: Readonly<Record<string, string>>;
  readonly sessionTrees: Readonly<Record<string, string>>;
}

const EMPTY: WorktreeRegistryData = { dirs: [], treeToRepoTop: {}, sessionTrees: {} };

export interface WorktreeRegistry {
  read(): WorktreeRegistryData;
  addTree(tree: { readonly path: string; readonly repoTop: string; readonly sessionThreadId?: string }): void;
  removeTree(path: string): void;
  /** 启动 GC：树目录缺席的条目剔除（外部 rm 残留防堆积）。 */
  gc(): void;
}

/** 纯函数：登记树（写侧单一真相——dirs 去重、sessionTrees last-wins）。 */
export function withTree(data: WorktreeRegistryData, tree: { readonly path: string; readonly repoTop: string; readonly sessionThreadId?: string }): WorktreeRegistryData {
  return {
    dirs: data.dirs.includes(tree.path) ? data.dirs : [...data.dirs, tree.path],
    treeToRepoTop: { ...data.treeToRepoTop, [tree.path]: tree.repoTop },
    sessionTrees: tree.sessionThreadId !== undefined ? { ...data.sessionTrees, [tree.sessionThreadId]: tree.path } : data.sessionTrees,
  };
}

/** 纯函数：注销树（三张表联清）。 */
export function withoutTree(data: WorktreeRegistryData, path: string): WorktreeRegistryData {
  const sessionTrees: Record<string, string> = {};
  for (const [threadId, tree] of Object.entries(data.sessionTrees)) if (tree !== path) sessionTrees[threadId] = tree;
  const { [path]: _removed, ...treeToRepoTop } = data.treeToRepoTop;
  return {
    dirs: data.dirs.filter((dir) => dir !== path),
    treeToRepoTop,
    sessionTrees,
  };
}

/** 纯函数：启动 GC（树存在性过滤）。 */
export function gcData(data: WorktreeRegistryData, exists: (path: string) => boolean): WorktreeRegistryData {
  const kept = data.dirs.filter(exists);
  if (kept.length === data.dirs.length) return data;
  const keptSet = new Set(kept);
  const treeToRepoTop: Record<string, string> = {};
  for (const [tree, repoTop] of Object.entries(data.treeToRepoTop)) if (keptSet.has(tree)) treeToRepoTop[tree] = repoTop;
  const sessionTrees: Record<string, string> = {};
  for (const [threadId, tree] of Object.entries(data.sessionTrees)) if (keptSet.has(tree)) sessionTrees[threadId] = tree;
  return { dirs: kept, treeToRepoTop, sessionTrees };
}

function parse(raw: string): WorktreeRegistryData {
  try {
    const parsed = JSON.parse(raw) as Partial<WorktreeRegistryData>;
    return {
      dirs: Array.isArray(parsed.dirs) ? parsed.dirs.filter((d): d is string => typeof d === 'string') : [],
      treeToRepoTop: typeof parsed.treeToRepoTop === 'object' && parsed.treeToRepoTop !== null ? parsed.treeToRepoTop : {},
      sessionTrees: typeof parsed.sessionTrees === 'object' && parsed.sessionTrees !== null ? parsed.sessionTrees : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export function createWorktreeRegistry(file: string, exists: (path: string) => boolean = existsSync): WorktreeRegistry {
  const write = (data: WorktreeRegistryData): void => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  let data = exists(file) ? parse(readFileSync(file, 'utf8')) : { ...EMPTY };
  return {
    read: () => data,
    addTree: (tree) => {
      data = withTree(data, tree);
      write(data);
    },
    removeTree: (path) => {
      data = withoutTree(data, path);
      write(data);
    },
    gc: () => {
      data = gcData(data, exists);
      write(data);
    },
  };
}
