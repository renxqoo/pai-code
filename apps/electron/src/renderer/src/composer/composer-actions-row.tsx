import { ChevronDown, FoldVertical, Paperclip, ArrowUp } from 'lucide-react';

import { IconButton, MenuButton, SparkMark, UsageRing } from '@paiapp/ui';

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
  contextUsed: number
  canSend: boolean
  /** 有生成任务时发送键让位给红色停止键 */
  generating: boolean
  /** 压缩进行中压缩键禁用，防止重复触发 */
  compacting: boolean
  onSelectModel: (value: string) => void
  onSelectEffort: (value: string) => void
  onCompact: () => void
  onAttach: () => void
  onStop: () => void
}

const menuTriggerClassName =
  'flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 text-[12px] leading-none text-muted-foreground outline-none select-none hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';

function optionItems(options: readonly string[], selected: string) {
  return options.map((option) => ({ kind: 'item' as const, id: option, label: option, selected: option === selected }));
}

/** 输入框底行：模型 / 推理档位两组下拉，右侧压缩、附件、上下文用量与发送（生成中为停止）。 */
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
  contextUsed,
  canSend,
  generating,
  compacting,
  onSelectModel,
  onSelectEffort,
  onCompact,
  onAttach,
  onStop,
}: ComposerActionsRowProps) {
  return (
    <div className="flex items-center gap-[7px] px-4 pt-1 pb-[13px]">
      <MenuButton
        aria-label={model}
        align="start"
        popupMinWidth={200}
        items={optionItems(modelOptions, model)}
        onSelect={onSelectModel}
        triggerClassName={menuTriggerClassName}
        trigger={
          <>
            <SparkMark size={13} className="text-spark" />
            <span className="whitespace-nowrap">{model}</span>
            <ChevronDown className="size-3 text-muted-foreground/70" strokeWidth={2} />
          </>
        }
      />
      <span aria-hidden="true" className="mx-[6px] h-[13px] w-px shrink-0 bg-border" />
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
      <div className="ml-auto flex items-center gap-[9px]">
        <IconButton label={compactLabel} size="sm" onClick={onCompact} disabled={compacting} className="text-muted-foreground/90">
          <FoldVertical strokeWidth={1.75} />
        </IconButton>
        <IconButton label={attachLabel} size="sm" onClick={onAttach} className="text-muted-foreground/90">
          <Paperclip strokeWidth={1.75} />
        </IconButton>
        <span title={contextUsageLabel} className="flex items-center">
          <UsageRing value={contextUsed} size={17} className="text-muted-foreground/70" />
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
