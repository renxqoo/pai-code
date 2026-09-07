import { ChevronDown, Folder, GitBranch } from 'lucide-react';

import { MenuButton } from '@paiapp/ui';

type ComposerContextBarProps = {
  checkoutLabel: string
  checkout: string
  checkoutOptions: readonly string[]
  onSelectCheckout: (value: string) => void
}

/** 输入卡下方的本地检出条：左侧工作目录，右侧版本/分支切换。 */
function ComposerContextBar({ checkoutLabel, checkout, checkoutOptions, onSelectCheckout }: ComposerContextBarProps) {
  return (
    <div className="mx-[20px] -mt-px flex h-[29px] items-center justify-between rounded-[10px] border border-border bg-surface-subtle pr-[9px] pl-[13px]">
      <span className="flex min-w-0 items-center gap-[7px] text-[10.5px] leading-none text-muted-foreground/85">
        <Folder className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
        <span className="truncate">{checkoutLabel}</span>
      </span>
      <MenuButton
        aria-label={checkoutLabel}
        align="end"
        sideOffset={4}
        popupMinWidth={132}
        items={checkoutOptions.map((option) => ({
          kind: 'item' as const,
          id: option,
          label: option,
          selected: option === checkout,
        }))}
        onSelect={onSelectCheckout}
        triggerClassName="flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-0.5 pl-1 text-[10.5px] leading-none text-muted-foreground/85 outline-none select-none hover:text-foreground aria-expanded:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0"
        trigger={
          <>
            <GitBranch className="size-3 text-muted-foreground/70" strokeWidth={1.75} />
            <span className="whitespace-nowrap">{checkout}</span>
            <ChevronDown className="size-3 text-muted-foreground/60" strokeWidth={2} />
          </>
        }
      />
    </div>
  );
}

export { ComposerContextBar };
