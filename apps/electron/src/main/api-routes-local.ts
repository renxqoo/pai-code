import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

import type { FileRead } from './file-read';
import { searchProjectFiles } from './file-search';
import type { GitBranches } from './git-branches';
import type { OpenLocation } from './open-location';

/**
 * 本地文件/shell/git 路由组（api-routes 的本地能力子集）：共用语汇是
 * isKnownCwd 目录门禁与审计；不含任何 hub 命令。handler 类型与 RouteTable
 * 对应键结构同构，装配侧展开进总表（RouteTable 保证完整性）。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

export type LocalRoutesDeps = {
  isKnownCwd: (cwd: string) => boolean;
  audit: (message: string) => void;
  git: GitBranches;
  openLocation: OpenLocation;
  fileRead: FileRead;
};

export function createLocalRoutes(deps: LocalRoutesDeps) {
  const fail = (reason: string): Promise<{ ok: false; reason: string }> => Promise.resolve({ ok: false, reason });

  const routes: {
    'file/search': Handler<'file/search'>;
    'file/read': Handler<'file/read'>;
    'shell/open': Handler<'shell/open'>;
    'git/branches': Handler<'git/branches'>;
    'git/checkout': Handler<'git/checkout'>;
  } = {
    'file/search': (params) => {
      // 目录门禁：只允许扫描本应用已知会话目录（活跃会话 + 注册表），缩小枚举面（见 T23 挂账）
      if (!deps.isKnownCwd(params.cwd)) return fail('cwd_forbidden');
      return Promise.resolve({ ok: true as const, data: searchProjectFiles(params.cwd, params.query) });
    },
    'file/read': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail('cwd_forbidden');
      return Promise.resolve(deps.fileRead.read(params.cwd, params.path));
    },
    'shell/open': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail('cwd_not_allowed');
      deps.audit(`shell_open:${params.target}:${params.cwd}`);
      return deps.openLocation.open(params.cwd, params.target);
    },
    'git/branches': (params) => {
      if (!deps.isKnownCwd(params.cwd)) return fail('cwd_not_allowed');
      return deps.git.list(params.cwd);
    },
    'git/checkout': (params) => {
      // 工作树是独占资源：门禁与串行都在主进程侧（渲染层只做按钮 busy 态）
      if (!deps.isKnownCwd(params.cwd)) return fail('cwd_not_allowed');
      deps.audit(`git_checkout:${params.cwd}:${params.branch}:${params.create ? 'create' : 'switch'}`);
      return deps.git.checkout(params.cwd, params.branch, params.create);
    },
  };

  return routes;
}
