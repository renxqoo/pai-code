import * as React from 'react';
import { ArrowUp, ChevronDown, Plus } from 'lucide-react';

import type { PermMode, SessionStatsView, TokenAnalyticsView } from '@paiapp/contracts';

import { UsageDetails, formatWindowPct } from './usage-details';

import { IconButton, MenuButton, menuTriggerClassName, PickerDialog, Progress, Spinner } from '@paiapp/ui';
import { groupModelOptions } from '@/components/group-model-options';
import { copy } from '@/strings';
import { formatTokenCount } from '@/thread/format-count-unit';
import { cn } from '@/lib/utils';

import { PermissionModeMenu } from './permission-mode-menu';
import { AgentStatusButton } from './agent-status-button';
import { useHoverIntent } from './use-hover-intent';

/** 思考档控件组：恒四档（会话读口当前值 / 新任务页本地选择），两页都渲染。 */
type EffortControls = {
  value: string
  options: readonly string[]
  onSelect: (value: string) => void
}

/** 用量控件组（会话面数据；无会话不渲染，不摆没有数据面的假控件）。 */
type UsageControls = {
  /** 用量明细（I1）；null = 未拉取，不可点。 */
  stats: SessionStatsView | null
  /** 上下文分析（T43）；在场 = 主芯片显上下文占用环，缺席 = 回落累计 total。 */
  analytics: TokenAnalyticsView | null
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
  /** 发送在途（表单提交 → 受理结算）：发送位换加载指示并禁用——唤醒/受理的慢窗口不再无反馈 */
  sending: boolean
  /** 生成中且无输入时发送键让位给红色停止键；有输入时发送键回归（提交=排队，投递语义由父层裁决） */
  generating: boolean
  onStop: () => void
  /** 会话权限模式（当前生效；null = 未加载/无会话，控件不渲染） */
  permissionMode: PermMode | null
  onSelectPermissionMode: (mode: PermMode) => void
  /** 会话面：工作中子代理状态徽标（不传 = 无会话面，不渲染）。 */
  agents?: { working: number; onOpen: () => void }
  /** 思考档控件（null = 不渲染） */
  effort: EffortControls | null
  /** 用量控件（null = 无会话数据面，不渲染） */
  usage: UsageControls | null
}

function optionItems(options: readonly string[], selected: string) {
  return options.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === selected }));
}

/**
 * 输入框底行：左侧附件与权限模式，右侧用量 / 模型 / 思考档 / 发送（在途呈加载指示；生成中且无输入时为红色停止）。
 * 模型选择走统一 CommandDialog 弹窗（T21）；思考档恒四档（会话读口当前值，新建页本地选择）；
 * 用量入口只在有会话时出现：主指标 = 上下文占用百分比环（T43，实报输入侧口径——
 * 累计 total 单调增不重置，不冒充上下文），插件缺席回落累计 total；环色随阈值
 * ≥70% 琥珀 / ≥90% 红（Claude Code 官方示例阈值）。明细弹层 hover 触发（延迟
 * 开关防闪烁）。压缩入口是斜杠命令 /compact。
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
  sending,
  generating,
  onStop,
  permissionMode,
  onSelectPermissionMode,
  agents,
  effort,
  usage,
}: ComposerActionsRowProps) {
  const usageHover = useHoverIntent();
  const [modelPickerOpen, setModelPickerOpen] = React.useState(false);
  return (
    <div className="flex items-center gap-[7px] px-4 pt-1 pb-[13px]">
      <IconButton label={attachLabel} size="sm" onClick={onAttach} className="text-muted-foreground/90">
        <Plus strokeWidth={1.9} />
      </IconButton>
      {permissionMode !== null ? (
        <PermissionModeMenu mode={permissionMode} onSelectMode={onSelectPermissionMode} />
      ) : null}
      {agents === undefined ? null : <AgentStatusButton count={agents.working} onOpen={agents.onOpen} />}
      {/* 右组可收缩（min-w-0），收缩量全部由模型名截断吸收；其余控件 shrink-0 保持原宽 */}
      <div className="ml-auto flex min-w-0 items-center gap-[9px]">
        {usage === null ? null : (
          <span
            className="relative flex shrink-0 items-center"
            onMouseEnter={usageHover.onEnter}
            onMouseLeave={usageHover.onLeave}
            onFocus={usageHover.openNow}
            onBlur={usageHover.closeNow}
          >
            {usageHover.open && usage.stats !== null ? <UsageDetails analytics={usage.analytics} /> : null}
            {usage.stats === null ? (
              <span title={usage.label} className="font-mono text-[11px] leading-none text-muted-foreground/50 tabular-nums">
                —
              </span>
            ) : usage.analytics !== null ? (
              <button
                type="button"
                title={`${usage.label} · ${copy.usage.contextUsed(formatWindowPct(usage.analytics.used, usage.analytics.window))}`}
                aria-label={usage.label}
                aria-expanded={usageHover.open}
                className={cn(
                  'rounded-md p-[2px] outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                  usage.analytics.utilizationPct >= 90
                    ? 'text-destructive'
                    : usage.analytics.utilizationPct >= 70
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                )}
              >
                <Progress value={usage.analytics.utilizationPct} />
              </button>
            ) : (
              <button
                type="button"
                title={usage.label}
                aria-label={usage.label}
                aria-expanded={usageHover.open}
                className="rounded-md px-[2px] font-mono text-[11px] leading-none text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {formatTokenCount(usage.stats.tokens.total) ?? '0'}
              </button>
            )}
          </span>
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
        {effort === null ? null : (
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
            disabled={!canSend || sending}
            aria-busy={sending}
            className="flex size-[29px] shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-foreground outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:bg-primary enabled:hover:bg-primary/90 disabled:cursor-default disabled:bg-send disabled:text-white"
          >
            {sending ? <Spinner label={copy.composer.sending} className="size-[15px]" strokeWidth={2.5} /> : <ArrowUp className="size-[15px]" strokeWidth={2.5} />}
          </button>
        )}
      </div>
    </div>
  );
}

export { ComposerActionsRow };
export type { ComposerActionsRowProps, EffortControls, UsageControls };
