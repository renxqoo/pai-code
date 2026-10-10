import * as React from 'react';
import { useHistoryStore } from '@/store/history-store';
import { buildKnownWorkspaces, type Workspace } from '@/features/workspace/known-workspaces';

/**
 * PC 侧已建过会话的工作目录（手机端唯一可选的工作空间集合）。
 * 订阅历史 store：会话水合/归档后候选即时补齐，不必重开面板。
 */
export function useKnownWorkspaces(): readonly Workspace[] {
  const sessions = useHistoryStore((state) => state.sessions);
  return React.useMemo(() => buildKnownWorkspaces(sessions), [sessions]);
}