import type { GitGraphCommit, GitGraphView } from '@paiapp/contracts';

import { failureReason, mapGitFailure, runGit, type GitExec } from './git-branches';

/**
 * 本地 git 图谱读口（T36）：topo 序提交 + parents（渲染层算泳道几何）+ 本地分支装饰。
 * 装饰用 refs/heads 与 HEAD 双 pattern：attached 输出「HEAD -> main」、detached 输出
 * 「HEAD, main」，tag/remote 装饰不进图谱。只读不参与 checkout 串行链；同 cwd 在途单飞。
 */

export type GitGraphOutcome = { ok: true; data: GitGraphView } | { ok: false; reason: string };

/** 展示上限：渲染层按此量级直渲染 DOM（无虚拟滚动，见 T36 并发预算）。 */
const GRAPH_COMMIT_LIMIT = 500;
/** 多取 1 条用于判定「还有更多」（truncated）。 */
const GRAPH_PROBE_COUNT = GRAPH_COMMIT_LIMIT + 1;
/** 字段分隔 %x00 / 记录分隔 %x1e：主题与作者名可含任意可见字符。 */
const FIELD_SEP = '\0';
const RECORD_SEP = '\x1e';
const GRAPH_FIELD_COUNT = 7;

const okGraph = (data: GitGraphView): GitGraphOutcome => ({ ok: true, data });

const GRAPH_LOG_ARGS: readonly string[] = [
  'log',
  `--max-count=${GRAPH_PROBE_COUNT}`,
  '--topo-order',
  '--abbrev=7',
  '--decorate-refs=refs/heads',
  '--decorate-refs=HEAD',
  '--pretty=format:%H%x00%h%x00%an%x00%at%x00%s%x00%D%x00%P%x1e',
];

/** `git log --pretty` 输出 → 原始记录条数（截断判定用：畸形记录被 parse 跳过不影响「还有更多」的探测）。 */
export function countGraphRecords(stdout: string): number {
  return stdout.split(RECORD_SEP).filter((record) => record.trim().length > 0).length;
}

/** `git log --pretty` 输出 → 提交行；字段数不符的畸形记录跳过（垃圾输入降级不崩溃）。 */
export function parseGraphLog(stdout: string): GitGraphCommit[] {
  const commits: GitGraphCommit[] = [];
  for (const raw of stdout.split(RECORD_SEP)) {
    const record = raw.trim();
    if (record.length === 0) continue;
    const fields = record.split(FIELD_SEP);
    if (fields.length !== GRAPH_FIELD_COUNT) continue;
    const [hash, shortHash] = fields;
    if (hash === undefined || hash.length === 0 || shortHash === undefined || shortHash.length === 0) continue;
    const author = fields[2] ?? '';
    const timestamp = Number.parseInt(fields[3] ?? '0', 10);
    const subject = fields[4] ?? '';
    const decorations = fields[5] ?? '';
    const parents = fields[6] ?? '';
    const refs = decorations
      .split(', ')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    commits.push({
      hash,
      shortHash,
      subject,
      author,
      // 负值/垃圾（GIT_*_DATE 可造 1970 前时间）退化为 0，不产出违反契约 timestamp≥0 的数据
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
      parents: parents.split(' ').filter((parent) => parent.length > 0),
      refs,
      isHead: refs.some((token) => token === 'HEAD' || token.startsWith('HEAD ->')),
    });
  }
  return commits;
}

export interface GitGraph {
  list: (cwd: string) => Promise<GitGraphOutcome>
  /** 丢弃在途单飞缓存（checkout 改写 HEAD 后调用，防止紧随的图谱请求复用切换前快照）。 */
  invalidate: (cwd: string) => void
}

export function createGitGraph(run: GitExec = runGit): GitGraph {
  const graphInFlight = new Map<string, Promise<GitGraphOutcome>>();

  const readGraph = async (cwd: string): Promise<GitGraphOutcome> => {
    const probe = await run(['rev-parse', '--git-dir'], cwd);
    if (probe.error !== null) return { ok: false, reason: failureReason(probe) };
    if (probe.code !== 0) {
      if (mapGitFailure(probe.stderr) === 'not_a_repo') return okGraph({ isRepo: false, commits: [], truncated: false });
      return { ok: false, reason: mapGitFailure(probe.stderr) };
    }
    const log = await run(GRAPH_LOG_ARGS, cwd);
    if (log.error !== null) return { ok: false, reason: failureReason(log) };
    if (log.code !== 0) {
      // 空仓库（刚 init 未提交）是正常形态：空列表而非报错。判定不用 stderr 文案
      // （git 消息随用户 locale 本地化），用 rev-parse 验证 HEAD 是否存在——空仓库
      // 无 HEAD 可解析，非空仓库 log 失败则照实透传
      const head = await run(['rev-parse', '-q', '--verify', 'HEAD'], cwd);
      if (head.error !== null) return { ok: false, reason: failureReason(head) };
      if (head.code !== 0) return okGraph({ isRepo: true, commits: [], truncated: false });
      return { ok: false, reason: mapGitFailure(log.stderr) };
    }
    // 截断按原始记录数判定：parse 跳过畸形记录后条数变小，不能反过来丢失截断提示
    const truncated = countGraphRecords(log.stdout) > GRAPH_COMMIT_LIMIT;
    const rows = parseGraphLog(log.stdout);
    return okGraph({ isRepo: true, commits: truncated ? rows.slice(0, GRAPH_COMMIT_LIMIT) : rows, truncated });
  };

  return {
    list: (cwd: string): Promise<GitGraphOutcome> => {
      const running = graphInFlight.get(cwd);
      if (running !== undefined) return running;
      const task = readGraph(cwd).finally(() => {
        graphInFlight.delete(cwd);
      });
      graphInFlight.set(cwd, task);
      return task;
    },
    invalidate: (cwd: string): void => {
      graphInFlight.delete(cwd);
    },
  };
}
