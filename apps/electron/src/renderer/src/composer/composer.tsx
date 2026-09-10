import * as React from 'react';

import type { CommandView, PermissionRules, SessionStatsView } from '@paiapp/contracts';

import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { PromptCard, type ComposerAttachment } from '@/composer/prompt-card';
import { PromptContextBar } from '@/composer/prompt-context-bar';
import { PromptInputArea } from '@/composer/prompt-input-area';
import { QueuedMessageCard } from '@/composer/queued-message-card';
import { type PendingImage } from '@/composer/read-image-file';
import { baseNameOf } from '@/lib/project-dirs';
import { copy } from '@/strings';
type ComposerProps = {
  value: string
  placeholder: string
  /** 外部聚焦句柄：编辑重发回填草稿后聚焦输入框 */
  textareaRef?: React.Ref<HTMLTextAreaElement>
  attachLabel: string
  sendLabel: string
  stopLabel: string
  contextUsageLabel: string
  contextUsed: number
  model: string
  effort: string
  modelOptions: readonly string[]
  effortOptions: readonly string[]
  /** 会话权限模式（当前生效；null = 未加载/无会话，操作栏控件不渲染） */
  permissionMode: PermissionRules['mode'] | null
  /** true = 生效规则来自全局文件（无会话 sidecar） */
  permissionFollowsGlobal: boolean
  /** 会话内斜杠命令/技能目录（补全数据源） */
  commands: readonly CommandView[]
  /** 补全弹层的无障碍名（命令 / 文件） */
  slashAriaLabel: string
  fileAriaLabel: string
  /** @ 文件引用的目录搜索（失败返回 null，弹层按空结果呈现） */
  onSearchFiles: (query: string) => Promise<string[] | null>
  /** 用量明细（I1）。 */
  stats: SessionStatsView | null
  /** 会话标识：切换时清空附件（防图片串发到别的会话）。 */
  threadId: string
  /** 无可选模型时的引导文案（点击触发 onOpenSettings） */
  noModelsLabel: string
  /** 思考档不可用时的禁用原因文案 */
  effortUnavailableLabel: string
  /** 有生成任务时回车 = 排队消息（语义由父层按会话状态裁决），发送键仍为停止 */
  generating: boolean
  /** 本地暂存的排队消息（旧→新；生成中显示为输入卡顶部的灰色卡片堆） */
  queuedMessages: readonly { id: number; text: string }[]
  onSendNowQueued: (id: number) => void
  onEditQueued: (id: number) => void
  onRemoveQueued: (id: number) => void
  /** 一次性图片回填信号：token 变化时把 images 并入附件态；null = 无回填 */
  restore: { token: number; images: readonly { name: string; payload: PendingImage }[] } | null
  onChange: (value: string) => void
  /** 提交（文本 + 附件原样交出，投递语义由父层决定）；resolve true = 已发出（composer 据此清空附件） */
  onSubmit: (text: string, attachments: readonly ComposerAttachment[]) => Promise<boolean>
  onStop: () => void
  onOpenSettings?: () => void
  onSelectModel: (value: string) => void
  onSelectEffort: (value: string) => void
  onSelectPermissionMode: (mode: PermissionRules['mode']) => void
  onFollowPermissionGlobal: () => void
  /** 工作中子代理数（底行状态徽标；0 = 不展示）。 */
  agentsWorking: number
  /** 点击子代理状态徽标：打开 Agents 侧栏面板。 */
  onOpenAgents: () => void
  /** 上下文条：当前工作目录（'' = 无会话目录，项目段不渲染） */
  cwd: string
  /** 上下文条：分支段呈现（真实 git 分支名 / 空形态文案 + 弱化态） */
  branch: { label: string; title?: string; muted?: boolean }
}

/** 输入卡（线程页装配）：白卡壳 + 输入区 + 底行动作行 + 上下文条；两者共用同一套 composer 组件。 */
function Composer({
  value,
  placeholder,
  textareaRef,
  attachLabel,
  sendLabel,
  stopLabel,
  contextUsageLabel,
  contextUsed,
  model,
  effort,
  modelOptions,
  effortOptions,
  permissionMode,
  permissionFollowsGlobal,
  commands,
  slashAriaLabel,
  fileAriaLabel,
  onSearchFiles,
  stats,
  threadId,
  noModelsLabel,
  effortUnavailableLabel,
  generating,
  queuedMessages,
  onSendNowQueued,
  onEditQueued,
  onRemoveQueued,
  restore,
  onChange,
  onSubmit,
  onStop,
  onOpenSettings,
  onSelectModel,
  onSelectEffort,
  onSelectPermissionMode,
  onFollowPermissionGlobal,
  agentsWorking,
  onOpenAgents,
  cwd,
  branch,
}: ComposerProps) {
  return (
    <div className={`${CONVERSATION_COLUMN_CLASS} pointer-events-auto`}>
      <PromptContextBar
        project={cwd.length === 0 ? null : { label: baseNameOf(cwd) || cwd, title: cwd, ariaLabel: copy.composer.projectSegment }}
        branch={{ ...branch, ariaLabel: copy.composer.branchSegment }}
      />
      <PromptCard
        className="relative z-[1] -mt-[10px]"
        value={value}
        onSubmit={onSubmit}
        scope={threadId}
        restore={restore}
        canSubmit={value.trim().length > 0}
        queued={
          queuedMessages.length === 0
            ? undefined
            : queuedMessages.map((item) => (
                <QueuedMessageCard
                  key={item.id}
                  text={item.text}
                  sendNowLabel={copy.composer.sendNow}
                  editLabel={copy.composer.editQueued}
                  removeLabel={copy.composer.removeQueued}
                  onSendNow={() => onSendNowQueued(item.id)}
                  onEdit={() => onEditQueued(item.id)}
                  onRemove={() => onRemoveQueued(item.id)}
                />
              ))
        }
        input={
          <PromptInputArea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            textareaRef={textareaRef}
            commands={commands}
            slashAriaLabel={slashAriaLabel}
            fileAriaLabel={fileAriaLabel}
            onSearchFiles={onSearchFiles}
            searchKey={cwd}
            queueing={generating}
          />
        }
        actions={({ openFilePicker }) => (
          <ComposerActionsRow
            model={model}
            modelOptions={modelOptions}
            onSelectModel={onSelectModel}
            noModelsLabel={noModelsLabel}
            onOpenSettings={onOpenSettings}
            attachLabel={attachLabel}
            onAttach={openFilePicker}
            sendLabel={sendLabel}
            stopLabel={stopLabel}
            canSend={value.trim().length > 0}
            generating={generating}
            onStop={onStop}
            permissionMode={permissionMode}
            permissionFollowsGlobal={permissionFollowsGlobal}
            onSelectPermissionMode={onSelectPermissionMode}
            onFollowPermissionGlobal={onFollowPermissionGlobal}
            agents={{ working: agentsWorking, onOpen: onOpenAgents }}
            effort={{
              value: effort,
              options: effortOptions,
              onSelect: onSelectEffort,
              unavailableLabel: effortUnavailableLabel,
            }}
            usage={{ contextUsed, stats, label: contextUsageLabel }}
          />
        )}
      />
    </div>
  );
}

const ComposerMemo = React.memo(Composer);
export { ComposerMemo as Composer };
