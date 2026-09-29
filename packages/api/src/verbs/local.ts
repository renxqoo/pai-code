import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import { appError } from '../errors';
import type { GitBranches } from './git-branches';
import type { GitWorktree } from './git-worktree';
import type { GitGraph } from './git-graph';
import type { GitStatus } from './git-status';

/** 宿主能力端口（结构满足即可——electron 注入实现）；git/图谱端口直接用 verbs 内真型（同一事实一套接口） */
interface FileReadPort { read(cwd: string, path: string): { ok: true; data: { content: string; truncated: boolean; size: number } } | { ok: false; error: ApiError }; }
interface FileSearchPort { search(cwd: string, query: string): string[]; }
interface OpenLocationPort { open(cwd: string, target: string): Promise<ApiOutcome<'shell/open'>>; }

/**
 * 本地文件/shell/git 路由组（api-routes 的本地能力子集）：共用语汇是
 * isKnownCwd 目录门禁与审计；不含任何 hub 命令。handler 类型与 RouteTable
 * 对应键结构同构，装配侧展开进总表（RouteTable 保证完整性）。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

export type LocalRoutesDeps = {
  isKnownCwd: (cwd: string) => boolean;
  audit: (message: string) => void;
  fileSearch: FileSearchPort;
  git: GitBranches;
  gitWorktree: GitWorktree;
  /** worktree 树被移除后的宿主回调（登记面 GC——api 包不持状态）。 */
  onTreeRemoved: (path: string) => void;
  /** 建树成功后的宿主回调（通告投递与登记——busy/idle 分流和来源判定在宿主侧；originThreadHint = 打开新建页时定格的来源会话）。 */
  onTreeCreated: (tree: { readonly path: string; readonly branch: string; readonly repoTop: string; readonly cwd: string; readonly originThreadHint: string | null }) => void;
  /** 登记面三张表读口（主进程 worktree-registry 注入）。 */
  worktreeRegistry: () => { dirs: string[]; treeToRepoTop: Record<string, string>; sessionTrees: Record<string, string> };
  graph: GitGraph;
  gitStatus: GitStatus;
  openLocation: OpenLocationPort;
  fileRead: FileReadPort;
};

export function createLocalRoutes(deps: LocalRoutesDeps) {
  const fail = (error: ApiError): Promise<{ ok: false; error: ApiError }> => Promise.resolve({ ok: false, error });

  const routes: {
    'file/search': Handler<'file/search'>;
    'file/read': Handler<'file/read'>;
    'shell/open': Handler<'shell/open'>;
    'git/branches': Handler<'git/branches'>;
    'git/checkout': Handler<'git/checkout'>;
    'git/graph': Handler<'git/graph'>;
    'git/status': Handler<'git/status'>;
    'git/worktree/list': Handler<'git/worktree/list'>;
    'git/worktree/registry': Handler<'git/worktree/registry'>;
    'git/worktree/create': Handler<'git/worktree/create'>;
    'git/worktree/remove': Handler<'git/worktree/remove'>;
    'git/worktree/merge': Handler<'git/worktree/merge'>;
  } = {
    'file/search': (params) => {
      // 目录门禁：只允许扫描本应用已知会话目录（活跃会话 + 注册表），缩小枚举面（见 T23 挂账）
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_forbidden'));
      return Promise.resolve({ ok: true as const, data: deps.fileSearch.search(params.cwd, params.query) });
    },
    'file/read': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_forbidden'));
      return Promise.resolve(deps.fileRead.read(params.cwd, params.path));
    },
    'shell/open': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      deps.audit(`shell_open:${params.target}:${params.cwd}`);
      return deps.openLocation.open(params.cwd, params.target);
    },
    'git/branches': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      return deps.git.list(params.cwd);
    },
    'git/checkout': async (params) => {
      // 工作树是独占资源：门禁与串行都在主进程侧（渲染层只做按钮 busy 态）
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      deps.audit(`git_checkout:${params.cwd}:${params.branch}:${params.create ? 'create' : 'switch'}`);
      const outcome = await deps.git.checkout(params.cwd, params.branch, params.create);
      // HEAD 已改写：丢弃图谱/变更速览的在途快照，紧随的请求不再复用切换前数据
      if (outcome.ok) {
        deps.graph.invalidate(params.cwd);
        deps.gitStatus.invalidate(params.cwd);
      }
      return outcome;
    },
    'git/graph': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      return deps.graph.list(params.cwd);
    },
    'git/status': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      return deps.gitStatus.status(params.cwd);
    },
    'git/worktree/list': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      return deps.gitWorktree.list(params.cwd);
    },
    'git/worktree/registry': () => Promise.resolve({ ok: true as const, data: deps.worktreeRegistry() }),
    'git/worktree/create': async (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      deps.audit(`git_worktree_create:${params.cwd}:${params.branch}`);
      const outcome = await deps.gitWorktree.create(params.cwd, params.branch);
      if (outcome.ok) {
        deps.graph.invalidate(params.cwd);
        deps.gitStatus.invalidate(params.cwd);
        deps.onTreeCreated({
          path: outcome.data.path,
          branch: params.branch,
          repoTop: params.cwd,
          cwd: params.cwd,
          originThreadHint: typeof params.originThreadHint === 'string' && params.originThreadHint !== '' ? params.originThreadHint : null,
        });
      }
      return outcome;
    },
    'git/worktree/remove': async (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      deps.audit(`git_worktree_remove:${params.path}`);
      const outcome = await deps.gitWorktree.remove(params.cwd, params.path);
      if (outcome.ok) {
        deps.graph.invalidate(params.cwd);
        deps.gitStatus.invalidate(params.cwd);
        deps.onTreeRemoved(params.path);
      }
      return outcome;
    },
    'git/worktree/merge': async (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail(appError('cwd_not_allowed'));
      deps.audit(`git_worktree_merge:${params.cwd}:${params.branch}`);
      const outcome = await deps.gitWorktree.merge(params.cwd, params.branch);
      if (outcome.ok) {
        deps.graph.invalidate(params.cwd);
        deps.gitStatus.invalidate(params.cwd);
      }
      return outcome;
    },
  };

  return routes;
}
