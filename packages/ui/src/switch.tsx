import { Switch } from '@base-ui/react/switch'

import { cn } from 'cn'

type ToggleSwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

/** 开关（受控）：轨道 + 滑块，禁用态降不透明度。 */
function ToggleSwitch({ checked, onCheckedChange, disabled = false, className, 'aria-label': ariaLabel }: ToggleSwitchProps) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-foreground' : 'bg-border',
        className,
      )}
    >
      <Switch.Thumb
        className={cn(
          'block size-[14px] rounded-full bg-background shadow-sm transition-transform',
          checked ? 'translate-x-[15px]' : 'translate-x-[2px]',
        )}
      />
    </Switch.Root>
  )
}

export { ToggleSwitch }
export type { ToggleSwitchProps }
