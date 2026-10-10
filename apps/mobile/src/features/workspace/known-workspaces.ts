import type { ConversationSession } from '@/types/domain';

export type Workspace = {
  /** PC 侧会话的工作目录（thread/start 的 cwd 真值）。 */
  path: string;
  /** 目录末段名，供窄屏单行显示。 */
  name: string;
};

/** 磁盘根不是工作目录：会话 header 读不出 cwd 时 hub 会回退 process.cwd()（宿主进程目录），
 * 这类根路径不是用户的工作空间，选中它会在电脑上把会话开在 /。 */
function isWorkspacePath(path: string): boolean {
  return path.length > 1 && path !== '/' && path !== '.' && path !== '..';
}

/**
 * 工作空间候选 = 电脑端已有对话的目录（thread/list 在册线程 + thread/list_saved 落盘归档的 cwd）。
 * 设备面没有列目录能力（无 file/* 词表），电脑上的目录树在协议层不可达——
 * 能选的集合只能是「已有对话的目录」，电脑上有目录但没对话的不在此列。
 */
export function buildKnownWorkspaces(sessions: readonly ConversationSession[]): readonly Workspace[] {
  const paths = [...new Set(sessions.map((session) => session.project.trim()).filter(isWorkspacePath))];
  return paths
    .sort()
    .map((path) => ({ path, name: path.split('/').filter(Boolean).pop() ?? path }));
}

/** 路径包含匹配（大小写不敏感）；空查询即全量。 */
export function filterWorkspaces(workspaces: readonly Workspace[], query: string): readonly Workspace[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return workspaces;
  return workspaces.filter((workspace) => workspace.path.toLowerCase().includes(needle) || workspace.name.toLowerCase().includes(needle));
}