import * as React from 'react';
import { useStore } from 'zustand';

import type { CommandView } from '@paiapp/contracts';

import type { ComposerAttachment } from '@/composer/prompt-card';
import { imagePayloadOf } from '@/composer/read-image-file';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { projectDirsOf } from '@/lib/project-dirs';
import { copy } from '@/strings';
import { uiStore } from '@/ui/ui-store';
import type { NewTaskScreenProps, NewTaskStart } from './new-task-screen';

/** 新任务页已知目录快捷条上限（更多走系统文件夹选择）。 */
const KNOWN_DIRS_LIMIT = 6;

export type NewTaskPageHandle = {
  open: boolean
  /** 页内浮层开合（计入全局 Esc 链：浮层自行消费 Esc，不穿透关闭整页） */
  dialogOpen: boolean
  /** 分支视图失效代次（任一处 checkout 成功后递增，驱动线程页只读分支段重拉） */
  branchRevision: number
  /** 进入页面（cwd 空 = 跟随当前会话目录）；重复进入即重挂载，重置页内状态 */
  enter: (cwd: string) => void
  close: () => void
  /** 页面渲染属性；null = 未打开 */
  screen: { key: number; props: NewTaskScreenProps } | null
}

/**
 * 新建任务页的生命周期与装配（进入/退出/重挂载 + 全部渲染属性）。
 * 退出出口集中在这里：Esc、创建成功、以及任何「打开某个会话」的导航都走 close()。
 */
export function useNewTaskPage(input: {
  workspace: LiveWorkspaceView
  onOpenSettings: () => void
  /** 首条消息未投出时把文本回填到新会话草稿槽（切到会话页即可重发） */
  onDraftRestore: (threadId: string, text: string) => void
}): NewTaskPageHandle {
  const { workspace, onOpenSettings, onDraftRestore } = input;
  /** 开合/目录/重挂载代次/页内浮层在 ui store（跨语言重挂载存活）；页内派生态仍本地 */
  const open = useStore(uiStore, (s) => s.newTaskOpen);
  const key = useStore(uiStore, (s) => s.newTaskKey);
  const cwd = useStore(uiStore, (s) => s.newTaskCwd);
  const dialogOpen = useStore(uiStore, (s) => s.newTaskDialogOpen);
  const [branchRevision, setBranchRevision] = React.useState(0);
  /** 预会话命令目录（`/` 补全数据源）：每次打开重拉（技能启停/目录变化即时生效） */
  const [commands, setCommands] = React.useState<readonly CommandView[]>([]);
  const actions = workspace.actions;
  /** 宿主掉线（从未构建或 failed）：模型位文案不得伪装成「未配置模型」 */
  const hostDown = workspace.hostPhase === null || workspace.hostPhase === 'failed';

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void actions.fetchCommandPreview().then((list) => {
      if (!cancelled) setCommands(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open, actions]);

  /** 已知项目目录（活跃会话 + 已保存会话 cwd 去重，最近优先） */
  const knownDirs = React.useMemo(
    () =>
      projectDirsOf(
        workspace.sessions.map((session) => ({ cwd: session.cwd, at: session.lastActivityAt })),
        workspace.saved.map((session) => ({ cwd: session.cwd, at: session.modifiedAt })),
        KNOWN_DIRS_LIMIT,
      ),
    [workspace.sessions, workspace.saved],
  );

  /** 进入 = ui store 复合动作（open/cwd/key 递增/浮层复位，重复进入即重挂载） */
  const enter = React.useCallback((next: string) => uiStore.getState().openNewTask(next), []);
  const close = React.useCallback(() => uiStore.getState().closeNewTask(), []);
  const onDialogOpenChange = React.useCallback((next: boolean) => uiStore.getState().setNewTaskDialogOpen(next), []);

  /** 切分支包装：成功即失效线程页只读分支段（切完后返回会话页必须看到新分支） */
  const checkoutBranch = React.useCallback(
    async (target: string, branch: string, create: boolean) => {
      const outcome = await actions.checkoutGitBranch(target, branch, create);
      if (outcome.ok) setBranchRevision((revision) => revision + 1);
      return outcome;
    },
    [actions],
  );

  const create = React.useCallback(
    async (start: NewTaskStart): Promise<boolean> => {
      const result = await actions.startTask({
        cwd: start.cwd,
        trusted: start.trusted,
        model: start.model,
        permissionMode: start.permissionMode,
        thinkingLevel: start.thinkingLevel,
        text: start.text,
        images: start.attachments.map((item: ComposerAttachment) => imagePayloadOf(item.payload)),
      });
      if (!result.ok) return false;
      if (result.sendFailed) onDraftRestore(result.threadId, start.text);
      return true;
    },
    [actions, onDraftRestore],
  );

  const screen = React.useMemo<NewTaskPageHandle['screen']>(
    () =>
      open
        ? {
            key,
            props: {
              knownDirs,
              defaultCwd: cwd.length > 0 ? cwd : workspace.activeCwd,
              commands,
              trustedDefault: workspace.preferences.trustedDefault,
              defaultModelFor: actions.defaultModelFor,
              modelOptions: workspace.composer.modelOptions,
              effortOptionsFor: workspace.effortOptionsFor,
              noModelsLabel: hostDown ? copy.composer.hostDownModels : copy.composer.noModels,
              onOpenSettings,
              globalPermissionMode: workspace.permissionRules === null ? null : workspace.permissionRules.mode,
              onSearchFiles: actions.searchFilesIn,
              onListBranches: actions.listGitBranches,
              onCheckoutBranch: checkoutBranch,
              onPickDirectory: actions.pickDirectory,
              onCreate: create,
              onClose: close,
              onNotify: actions.showNotice,
              onDialogOpenChange,
            },
          }
        : null,
    [open, key, knownDirs, cwd, commands, hostDown, workspace, actions, onOpenSettings, checkoutBranch, create, close, onDialogOpenChange],
  );

  return { open, dialogOpen, branchRevision, enter, close, screen };
}
