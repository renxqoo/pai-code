import * as React from 'react';

import type { ApiOutcome, GitBranchesView } from '@paiapp/contracts';

/** 已结算快照：cwd 或 revision 与请求不等 = 在途（loading），旧响应按序号丢弃。 */
type GitBranchesState = {
  cwd: string
  revision: number
  view: GitBranchesView | null
  failed: boolean
};

export type GitBranchesHandle = {
  view: GitBranchesView | null
  loading: boolean
  failed: boolean
  /** 重新拉取（切换分支成功后刷新当前分支与列表）。 */
  refresh: () => void
};

const EMPTY: GitBranchesState = { cwd: '', revision: 0, view: null, failed: false };

/**
 * 按 cwd 拉取分支视图（线程页只读展示与新任务页分支选择共用）：
 * cwd 变化或 revision 递增即重拉，序号守卫丢弃过期响应（快速切目录时旧响应不覆盖新目录）；
 * cwd 为空不请求（无工作目录 = 空形态）。refresh 读最新 cwd——它常在 await 之后被调用。
 * list 必须引用稳定（传内联箭头会在每次渲染重拉）。
 */
export function useGitBranches(
  cwd: string,
  list: (cwd: string) => Promise<ApiOutcome<'git/branches'>>,
  /** 外部失效信号（如别处的 checkout 成功）：递增即重拉当前 cwd */
  revision = 0,
): GitBranchesHandle {
  const [state, setState] = React.useState<GitBranchesState>(EMPTY);
  const seqRef = React.useRef(0);
  /** 最新 cwd 快照：refresh 可能在 cwd 已变之后被调用，不得把旧目录刷回前台 */
  const cwdRef = React.useRef(cwd);
  cwdRef.current = cwd;
  /** 最新 revision 快照：load 由事件触发时要带上当时的失效代次，否则结算键永远落后 */
  const revisionRef = React.useRef(revision);
  revisionRef.current = revision;

  const load = React.useCallback(() => {
    const target = cwdRef.current;
    const revisionAtLoad = revisionRef.current;
    seqRef.current += 1;
    const seq = seqRef.current;
    if (target.length === 0) {
      setState({ ...EMPTY, revision: revisionAtLoad });
      return;
    }
    void list(target).then(
      (outcome) => {
        if (seq !== seqRef.current) return;
        setState({ cwd: target, revision: revisionAtLoad, view: outcome.ok ? outcome.data : null, failed: !outcome.ok });
      },
      () => {
        if (seq !== seqRef.current) return;
        setState({ cwd: target, revision: revisionAtLoad, view: null, failed: true });
      },
    );
  }, [list]);

  React.useEffect(() => {
    load();
  }, [load, cwd, revision]);

  // revision 也进结算键：外部失效触发的重拉期间必须回到 loading（否则旧分支名无提示地停在界面上）
  const settled = state.cwd === cwd && state.revision === revision;
  return {
    view: settled ? state.view : null,
    failed: settled && state.failed,
    loading: cwd.length > 0 && !settled,
    refresh: load,
  };
}
