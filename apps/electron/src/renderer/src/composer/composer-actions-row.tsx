import * as React from 'react';
import { ArrowUp, ChevronDown, Plus } from 'lucide-react';

import type { PermissionRules, SessionStatsView } from '@paiapp/contracts';

import { UsageDetails } from './usage-details';

import { IconButton, MenuButton, UsageRing } from '@paiapp/ui';

import { PickerDialog } from '@/components/picker-dialog';
import { groupModelOptions } from '@/components/group-model-options';
import { copy } from '@/strings';

import { PermissionModeMenu } from './permission-mode-menu';
import { AgentStatusButton } from './agent-status-button';
import { menuTriggerClassName } from './menu-trigger-style';

/** 思考档控件组：有会话走 hub 线程真相，新任务页按所选模型本地计算，两者都渲染。 */
type EffortControls = {
  value: string
  options: readonly string[]
  onSelect: (value: string) => void
  unavailableLabel: string
}

/** 用量环控件组（会话面数据；无会话不渲染，不摆没有数据面的假控件）。 */
type UsageControls = {
  contextUsed: number
  /** 用量明细（I1）；null = 未拉取，环不可点。 */
  stats: SessionStatsView | null
  label: string
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
  /** 生成中且无输入时发送键让位给红色停止键；有输入时发送键回归（提交=排队，投递语义由父层裁决） */
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
  /** 思考档控件（null = 不渲染） */
  effort: EffortControls | null
  /** 用量环控件（null = 无会话数据面，不渲染） */
  usage: UsageControls | null
}

function optionItems(options: readonly string[], selected: string) {
  return options.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === selected }));
}

/**
 * 输入框底行：左侧附件与权限模式，右侧用量环 / 模型 / 思考档 / 发送（生成中且无输入时为红色停止）。
 * 模型选择走统一 CommandDialog 弹窗（T21）；思考档在会话与新建任务页都可用
 * （选项数据源不同：会话走 hub 线程真相，新建页按模型能力本地计算）；
 * 用量环只在有会话时出现。压缩入口是斜杠命令 /compact（按钮已下线；hub prompt 通路拦截，见 T26）。
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
  effort,
  usage,
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
      {/* 右组可收缩（min-w-0），收缩量全部由模型名截断吸收；其余控件 shrink-0 保持原宽 */}
      <div className="ml-auto flex min-w-0 items-center gap-[9px]">
        {usage === null ? null : (
          <>
            <span className="relative flex shrink-0 items-center">
              {usageOpen && usage.stats !== null ? <UsageDetails stats={usage.stats} /> : null}
              {usage.stats === null ? (
                <span title={usage.label}>
                  <UsageRing value={usage.contextUsed} size={17} className="text-muted-foreground/70" />
                </span>
              ) : (
                <button
                  type="button"
                  title={usage.label}
                  aria-label={usage.label}
                  aria-expanded={usageOpen}
                  onClick={() => setUsageOpen((open) => !open)}
                  className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <UsageRing value={usage.contextUsed} size={17} className="text-muted-foreground/70" />
                </button>
              )}
            </span>
          </>
        )}
        {modelOptions.length === 0 && onOpenSettings !== undefined ? (
          <button
            type="button"
            onClick={onOpenSettings}
            title={noModelsLabel}
            className={`${menuTriggerClassName} shrink-0`}
          >
            <span className="whitespace-nowrap">{noModelsLabel}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label={model}
              title={model}
              aria-haspopup="dialog"
              aria-expanded={modelPickerOpen}
              onClick={() => setModelPickerOpen(true)}
              className={`${menuTriggerClassName} min-w-0`}
            >
              {/* 模型 id 长度无上界：空间不足时唯一收缩项，省略号截断，全名走 title/aria-label */}
              <span className="min-w-0 truncate">{model}</span>
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
        {effort === null ? null : effort.options.length === 0 ? (
          <span
            title={effort.unavailableLabel}
            className="flex shrink-0 cursor-default items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 text-[12px] leading-none text-muted-foreground/60 select-none"
          >
            <span className="whitespace-nowrap">{effort.unavailableLabel}</span>
          </span>
        ) : (
          <MenuButton
            aria-label={effort.value}
            align="end"
            popupMinWidth={168}
            items={optionItems(effort.options, effort.value)}
            onSelect={effort.onSelect}
            triggerClassName={`${menuTriggerClassName} shrink-0`}
            trigger={
              <>
                <span className="whitespace-nowrap">{effort.value}</span>
                <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
              </>
            }
          />
        )}
        {generating && !canSend ? (
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
            className="flex size-[29px] shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-foreground outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:bg-primary enabled:hover:bg-primary/90 disabled:cursor-default disabled:bg-send disabled:text-white"
          >
            <ArrowUp className="size-[15px]" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

export { ComposerActionsRow };
export type { ComposerActionsRowProps, EffortControls, UsageControls };
