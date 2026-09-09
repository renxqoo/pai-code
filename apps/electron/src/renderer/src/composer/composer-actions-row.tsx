import * as React from 'react';
import { ChevronDown, FoldVertical, Paperclip, ArrowUp } from 'lucide-react';

import type { PermissionRules } from '@paiapp/contracts';

import { UsageDetails } from './usage-details';

import { IconButton, MenuButton, SparkMark, UsageRing } from '@paiapp/ui';

import { PickerDialog } from '@/components/picker-dialog';
import { groupModelOptions } from '@/components/group-model-options';
import { copy } from '@/strings';

import { PermissionModeMenu } from './permission-mode-menu';
import { menuTriggerClassName } from './menu-trigger-style';

type ComposerActionsRowProps = {
  model: string
  effort: string
  modelOptions: readonly string[]
  effortOptions: readonly string[]
  attachLabel: string
  compactLabel: string
  sendLabel: string
  stopLabel: string
  contextUsageLabel: string
  noModelsLabel: string
  effortUnavailableLabel: string
  contextUsed: number
  canSend: boolean
  /** 有生成任务时发送键让位给红色停止键 */
  generating: boolean
  /** 压缩进行中压缩键禁用，防止重复触发 */
  compacting: boolean
  /** 会话权限模式（当前生效；null = 未加载/无会话，控件不渲染） */
  permissionMode: PermissionRules['mode'] | null
  /** true = 生效规则来自全局文件（无会话 sidecar） */
  permissionFollowsGlobal: boolean
  onSelectModel: (value: string) => void
  onSelectEffort: (value: string) => void
  onSelectPermissionMode: (mode: PermissionRules['mode']) => void
  onFollowPermissionGlobal: () => void
  onCompact: () => void
  onAttach: () => void
  /** 用量明细（I1）；null = 未拉取，环不可点。 */
  stats: { contextUsage: number | null; tokensTotal: number; cost: number; userMessages: number; assistantMessages: number; toolCalls: number } | null
  /** 无可选模型时点击引导跳设置 */
  onOpenSettings?: () => void
  onStop: () => void
}

function optionItems(options: readonly string[], selected: string) {
  return options.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === selected }));
}

/** 输入框底行：模型 / 推理档位 / 会话权限模式三组下拉，右侧压缩、附件、上下文用量与发送（生成中为停止）。 */
function ComposerActionsRow({
  model,
  effort,
  modelOptions,
  effortOptions,
  attachLabel,
  compactLabel,
  sendLabel,
  stopLabel,
  contextUsageLabel,
  noModelsLabel,
  effortUnavailableLabel,
  contextUsed,
  canSend,
  generating,
  compacting,
  permissionMode,
  permissionFollowsGlobal,
  onSelectModel,
  onSelectEffort,
  onSelectPermissionMode,
  onFollowPermissionGlobal,
  onCompact,
  onAttach,
  stats,
  onOpenSettings,
  onStop,
}: ComposerActionsRowProps) {
  const [usageOpen, setUsageOpen] = React.useState(false);
  const [modelPickerOpen, setModelPickerOpen] = React.useState(false);
  return (
    <div className="flex items-center gap-[7px] px-4 pt-1 pb-[13px]">
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
      <span aria-hidden="true" className="mx-[6px] h-[13px] w-px shrink-0 bg-border" />
      {effortOptions.length === 0 ? (
        <span
          title={effortUnavailableLabel}
          className="flex cursor-default items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 text-[12px] leading-none text-muted-foreground/60 select-none"
        >
          <span className="whitespace-nowrap">{effortUnavailableLabel}</span>
        </span>
      ) : (
        <MenuButton
          aria-label={effort}
          align="start"
          popupMinWidth={168}
          items={optionItems(effortOptions, effort)}
          onSelect={onSelectEffort}
          triggerClassName={menuTriggerClassName}
          trigger={
            <>
              <span className="whitespace-nowrap">{effort}</span>
              <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
            </>
          }
        />
      )}
      {permissionMode !== null ? (
        <>
          <span aria-hidden="true" className="mx-[6px] h-[13px] w-px shrink-0 bg-border" />
          <PermissionModeMenu
            mode={permissionMode}
            followsGlobal={permissionFollowsGlobal}
            onSelectMode={onSelectPermissionMode}
            onFollowGlobal={onFollowPermissionGlobal}
          />
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-[9px]">
        <IconButton label={compactLabel} size="sm" onClick={onCompact} disabled={compacting} className="text-muted-foreground/90">
          <FoldVertical strokeWidth={1.75} />
        </IconButton>
        <IconButton label={attachLabel} size="sm" onClick={onAttach} className="text-muted-foreground/90">
          <Paperclip strokeWidth={1.75} />
        </IconButton>
        <span className="relative flex items-center">
          {usageOpen && stats !== null ? <UsageDetails stats={stats} /> : null}
          {stats === null ? (
            <span title={contextUsageLabel}>
              <UsageRing value={contextUsed} size={17} className="text-muted-foreground/70" />
            </span>
          ) : (
            <button
              type="button"
              title={contextUsageLabel}
              aria-label={contextUsageLabel}
              aria-expanded={usageOpen}
              onClick={() => setUsageOpen((open) => !open)}
              className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <UsageRing value={contextUsed} size={17} className="text-muted-foreground/70" />
            </button>
          )}
        </span>
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
