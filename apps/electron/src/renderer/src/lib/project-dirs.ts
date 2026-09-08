/**
 * 已知项目目录集合：活跃会话与历史会话的 cwd 合并去重（最近优先），
 * 供新会话弹窗快捷选择。
 */

export interface DirActivitySource {
  readonly cwd: string;
  /** 最近活跃时刻（ms）；活跃会话用 lastActivityAt，历史用 modifiedAt。 */
  readonly at: number;
}

/** 目录键归一：去重复尾斜杠（符号链接形态差异不做 realpath，渲染层无文件系统面——已知限制）。 */
function dirKey(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : cwd;
}

/** 路径 basename（目录名展示用；兼容 POSIX 与 Windows 分隔；空路径回退整串）。 */
export function baseNameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

export function projectDirsOf(active: readonly DirActivitySource[], saved: readonly DirActivitySource[], limit: number): string[] {
  const latest = new Map<string, { key: string; at: number }>();
  for (const source of [...active, ...saved]) {
    if (source.cwd.length === 0) continue;
    const key = dirKey(source.cwd);
    const known = latest.get(key);
    if (known === undefined) {
      latest.set(key, { key: source.cwd, at: source.at });
      continue;
    }
    known.at = Math.max(known.at, source.at);
  }
  return [...latest.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((entry) => entry.key);
}
