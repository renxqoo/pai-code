import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import { appError } from '../errors';
import type { GitBranches } from './git-branches';
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
  };

  return routes;
}
