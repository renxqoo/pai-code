import * as React from 'react';

import type { ApiOutcome, GitGraphView } from '@paiapp/contracts';

/** 已结算快照：cwd 或 revision 与请求不等 = 在途（loading），旧响应按序号丢弃。 */
type GitGraphState = {
  cwd: string
  revision: number
  view: GitGraphView | null
  failed: boolean
};

export type GitGraphHandle = {
  view: GitGraphView | null
  loading: boolean
  failed: boolean
  /** 重新拉取（弹窗刷新按钮）。 */
  refresh: () => void
};

const EMPTY: GitGraphState = { cwd: '', revision: 0, view: null, failed: false };

/**
 * 按 cwd 拉取 git 图谱视图（分支面板「Git 图谱」弹窗数据源）：
 * enabled=false（弹窗未开）不请求——图谱只在打开时拉取，无轮询；
 * cwd 变化或 revision 递增（如 checkout 成功）即重拉，序号守卫丢弃过期响应；
 * refresh 读最新 cwd。list 必须引用稳定（传内联箭头会在每次渲染重拉）。
 */
export function useGitGraph(
  cwd: string,
  list: (cwd: string) => Promise<ApiOutcome<'git/graph'>>,
  /** 外部失效信号（如 checkout 成功）：递增即重拉当前 cwd */
  revision = 0,
  enabled = true,
): GitGraphHandle {
  const [state, setState] = React.useState<GitGraphState>(EMPTY);
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
    if (enabled) load();
    // enabled 关闭即放弃在途结果之外的本地快照：下次打开重新拉取，不展示上次的旧图谱
    else setState((prev) => (prev.view === null && !prev.failed ? prev : { ...EMPTY, revision: prev.revision }));
  }, [load, cwd, revision, enabled]);

  // revision 也进结算键：外部失效触发的重拉期间必须回到 loading（否则旧图谱无提示地停在界面上）
  const settled = enabled && state.cwd === cwd && state.revision === revision;
  return {
    view: settled ? state.view : null,
    failed: settled && state.failed,
    loading: enabled && cwd.length > 0 && !settled,
    refresh: load,
  };
}
