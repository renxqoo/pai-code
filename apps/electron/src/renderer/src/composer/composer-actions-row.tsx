import * as React from 'react';
import { ArrowUp, ChevronDown, FoldVertical, Plus } from 'lucide-react';

import type { PermissionRules, SessionStatsView } from '@paiapp/contracts';

import { UsageDetails } from './usage-details';

import { IconButton, MenuButton, SparkMark, UsageRing } from '@paiapp/ui';

import { PickerDialog } from '@/components/picker-dialog';
import { groupModelOptions } from '@/components/group-model-options';
import { copy } from '@/strings';

import { PermissionModeMenu } from './permission-mode-menu';
import { AgentStatusButton } from './agent-status-button';
import { menuTriggerClassName } from './menu-trigger-style';

/** 会话面控件组：无会话（新任务页）传 null，三项都不渲染——不摆没有数据面的假控件。 */
type SessionControls = {
  effort: string
  effortOptions: readonly string[]
  onSelectEffort: (value: string) => void
  contextUsed: number
  /** 用量明细（I1）；null = 未拉取，环不可点。 */
  stats: SessionStatsView | null
  contextUsageLabel: string
  /** 压缩进行中压缩键禁用，防止重复触发 */
  compacting: boolean
  compactLabel: string
  effortUnavailableLabel: string
  onCompact: () => void
}

type ComposerActionsRowProps = {
  model: string
  modelOptions: readonly string[]
  onSelectModel: (value: string) => void
  /** 无可选模型时的引导文案（点击触发 onOpenSettings） */
  noModelsLabel: string
  /** 无可选模型时点击引导跳设置 */
  onOpenSettings?: () => void
  attachLabel: string
  onAttach: () => void
  sendLabel: string
  stopLabel: string
  canSend: boolean
  /** 有生成任务时发送键让位给红色停止键 */
  generating: boolean
  onStop: () => void
  /** 会话权限模式（当前生效；null = 未加载/无会话，控件不渲染） */
  permissionMode: PermissionRules['mode'] | null
  /** true = 生效规则来自全局文件（无会话 sidecar） */
  permissionFollowsGlobal: boolean
  onSelectPermissionMode: (mode: PermissionRules['mode']) => void
  onFollowPermissionGlobal: () => void
  /** 会话面：工作中子代理状态徽标（不传 = 无会话面，不渲染）。 */
  agents?: { working: number; onOpen: () => void }
  /** 会话面控件（思考档 / 压缩 / 用量环） */
  session: SessionControls | null
}

function optionItems(options: readonly string[], selected: string) {
  return options.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === selected }));
}

/**
 * 输入框底行：左侧附件与权限模式，右侧压缩 / 用量环 / 模型 / 思考档 / 发送（生成中为停止）。
 * 模型选择走统一 CommandDialog 弹窗（T21）；思考档与用量环只在有会话时出现。
 */
function ComposerActionsRow({
  model,
  modelOptions,
  onSelectModel,
  noModelsLabel,
  onOpenSettings,
  attachLabel,
  onAttach,
  sendLabel,
  stopLabel,
  canSend,
  generating,
  onStop,
  permissionMode,
  permissionFollowsGlobal,
  onSelectPermissionMode,
  onFollowPermissionGlobal,
  agents,
  session,
}: ComposerActionsRowProps) {
  const [usageOpen, setUsageOpen] = React.useState(false);
  const [modelPickerOpen, setModelPickerOpen] = React.useState(false);
  return (
    <div className="flex items-center gap-[7px] px-4 pt-1 pb-[13px]">
      <IconButton label={attachLabel} size="sm" onClick={onAttach} className="text-muted-foreground/90">
        <Plus strokeWidth={1.9} />
      </IconButton>
      {permissionMode !== null ? (
        <PermissionModeMenu
          mode={permissionMode}
          followsGlobal={permissionFollowsGlobal}
          onSelectMode={onSelectPermissionMode}
          onFollowGlobal={onFollowPermissionGlobal}
        />
      ) : null}
      {agents === undefined ? null : <AgentStatusButton count={agents.working} onOpen={agents.onOpen} />}
      <div className="ml-auto flex items-center gap-[9px]">
        {session === null ? null : (
          <>
            <IconButton label={session.compactLabel} size="sm" onClick={session.onCompact} disabled={session.compacting} className="text-muted-foreground/90">
              <FoldVertical strokeWidth={1.75} />
            </IconButton>
            <span className="relative flex items-center">
              {usageOpen && session.stats !== null ? <UsageDetails stats={session.stats} /> : null}
              {session.stats === null ? (
                <span title={session.contextUsageLabel}>
                  <UsageRing value={session.contextUsed} size={17} className="text-muted-foreground/70" />
                </span>
              ) : (
                <button
                  type="button"
                  title={session.contextUsageLabel}
                  aria-label={session.contextUsageLabel}
                  aria-expanded={usageOpen}
                  onClick={() => setUsageOpen((open) => !open)}
                  className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <UsageRing value={session.contextUsed} size={17} className="text-muted-foreground/70" />
                </button>
              )}
            </span>
          </>
        )}
        {modelOptions.length === 0 && onOpenSettings !== undefined ? (
          <button type="button" onClick={onOpenSettings} title={noModelsLabel} className={menuTriggerClassName}>
            <SparkMark size={13} className="text-spark" />
            <span className="whitespace-nowrap">{noModelsLabel}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label={model}
              aria-haspopup="dialog"
              aria-expanded={modelPickerOpen}
              onClick={() => setModelPickerOpen(true)}
              className={menuTriggerClassName}
            >
              <SparkMark size={13} className="text-spark" />
              <span className="whitespace-nowrap">{model}</span>
              <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
            </button>
            <PickerDialog
              open={modelPickerOpen}
              onOpenChange={setModelPickerOpen}
              title={copy.modelPicker.title}
              searchPlaceholder={copy.modelPicker.searchPlaceholder}
              emptyLabel={copy.modelPicker.empty}
              groups={groupModelOptions(modelOptions)}
              selectedId={model}
              onSelect={onSelectModel}
            />
          </>
        )}
        {session === null ? null : session.effortOptions.length === 0 ? (
          <span
            title={session.effortUnavailableLabel}
            className="flex cursor-default items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 text-[12px] leading-none text-muted-foreground/60 select-none"
          >
            <span className="whitespace-nowrap">{session.effortUnavailableLabel}</span>
          </span>
        ) : (
          <MenuButton
            aria-label={session.effort}
            align="end"
            popupMinWidth={168}
            items={optionItems(session.effortOptions, session.effort)}
            onSelect={session.onSelectEffort}
            triggerClassName={menuTriggerClassName}
            trigger={
              <>
                <span className="whitespace-nowrap">{session.effort}</span>
                <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
              </>
            }
          />
        )}
        {generating ? (
          <button
            type="button"
            aria-label={stopLabel}
            title={stopLabel}
            onClick={onStop}
            className="flex size-[29px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-stop text-white outline-none transition-colors select-none hover:bg-stop/85 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span aria-hidden="true" className="block size-[11px] rounded-[2px] bg-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label={sendLabel}
            title={sendLabel}
            disabled={!canSend}
            className="flex size-[29px] shrink-0 cursor-pointer items-center justify-center rounded-full text-white outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:bg-send-active enabled:hover:bg-send-active/85 disabled:cursor-default disabled:bg-send"
          >
            <ArrowUp className="size-[15px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

export { ComposerActionsRow };
export type { ComposerActionsRowProps, SessionControls };
