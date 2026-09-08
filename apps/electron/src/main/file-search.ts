import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 项目文件搜索（@ 引用数据源）：BFS 扫描 cwd 下相对路径。
 * 预算：结果上限 200、深度上限 8、跳过依赖/构建产物目录与点前缀条目；
 * 符号链接不跟随（按文件计，不遍历）；任何读取异常按空目录降级。
 */

const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', 'target']);
const MAX_RESULTS = 200;
const MAX_DEPTH = 8;

export function searchProjectFiles(cwd: string, query: string): string[] {
  const needle = query.trim().toLowerCase();
  const results: string[] = [];
  const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: cwd, rel: '', depth: 0 }];
  while (queue.length > 0 && results.length < MAX_RESULTS) {
    const next = queue.shift();
    if (next === undefined) break;
    const { dir, rel, depth } = next;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const childRel = rel.length === 0 ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (depth + 1 < MAX_DEPTH) queue.push({ dir: join(dir, entry.name), rel: childRel, depth: depth + 1 });
      } else if (needle.length === 0 || childRel.toLowerCase().includes(needle)) {
        results.push(childRel);
      }
    }
  }
  return results.sort();
}
