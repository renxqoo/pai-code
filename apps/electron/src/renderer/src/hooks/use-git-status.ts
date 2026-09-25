import * as React from 'react';

import type { ApiOutcome, GitStatusView } from '@paiapp/contracts';

/** 已结算快照：cwd 或 revision 与请求不等 = 在途（loading），旧响应按序号丢弃。 */
type GitStatusState = {
  cwd: string
  revision: number
  view: GitStatusView | null
  failed: boolean
};

export type GitStatusHandle = {
  view: GitStatusView | null
  loading: boolean
  failed: boolean
  /** 重新拉取（面板展开 / 轮结算 / 手动重试）。 */
  refresh: () => void
};

const EMPTY: GitStatusState = { cwd: '', revision: 0, view: null, failed: false };

/**
 * 按 cwd 拉取工作区变更速览（速览面板 Git 区数据源）：
 * cwd 变化或 revision 递增即重拉，序号守卫丢弃过期响应；cwd 为空不请求
 * （无工作目录 = 空形态）。refresh 读最新 cwd——它常在 await 之后被调用。
 * fetch 必须引用稳定（传内联箭头会在每次渲染重拉）。口径镜像 use-git-branches。
 */
export function useGitStatus(
  cwd: string,
  fetchStatus: (cwd: string) => Promise<ApiOutcome<'git/status'>>,
  /** 外部失效信号（checkout 成功 / 轮结算）：递增即重拉当前 cwd */
  revision = 0,
): GitStatusHandle {
  const [state, setState] = React.useState<GitStatusState>(EMPTY);
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
    void fetchStatus(target).then(
      (outcome) => {
        if (seq !== seqRef.current) return;
        setState({ cwd: target, revision: revisionAtLoad, view: outcome.ok ? outcome.data : null, failed: !outcome.ok });
      },
      () => {
        if (seq !== seqRef.current) return;
        setState({ cwd: target, revision: revisionAtLoad, view: null, failed: true });
      },
    );
  }, [fetchStatus]);

  React.useEffect(() => {
    load();
  }, [load, cwd, revision]);

  const settled = state.cwd === cwd && state.revision === revision;
  return {
    view: settled ? state.view : null,
    failed: settled && state.failed,
    loading: cwd.length > 0 && !settled,
    refresh: load,
  };
}
