import * as React from 'react';

import type { ComposerAttachment } from '@/composer/prompt-card';
import { imagePayloadOf } from '@/composer/read-image-file';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';
import { projectDirsOf } from '@/lib/project-dirs';
import { copy } from '@/strings';
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
  const [open, setOpen] = React.useState(false);
  /** 每次进入递增：整页重挂载即重置页内状态（cwd/草稿/浮层），与旧弹窗「打开即重置」同语义 */
  const [key, setKey] = React.useState(0);
  const [cwd, setCwd] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [branchRevision, setBranchRevision] = React.useState(0);
  const actions = workspace.actions;
  /** 宿主掉线（从未构建或 failed）：模型位文案不得伪装成「未配置模型」 */
  const hostDown = workspace.hostPhase === null || workspace.hostPhase === 'failed';

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

  const enter = React.useCallback((next: string) => {
    setCwd(next);
    setOpen(true);
    setKey((current) => current + 1);
  }, []);
  const close = React.useCallback(() => setOpen(false), []);
  const onDialogOpenChange = React.useCallback((next: boolean) => setDialogOpen(next), []);

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
              trustedDefault: workspace.preferences.trustedDefault,
              defaultModelFor: actions.defaultModelFor,
              modelOptions: workspace.composer.modelOptions,
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
    [open, key, knownDirs, cwd, hostDown, workspace, actions, onOpenSettings, checkoutBranch, create, close, onDialogOpenChange],
  );

  return { open, dialogOpen, branchRevision, enter, close, screen };
}
