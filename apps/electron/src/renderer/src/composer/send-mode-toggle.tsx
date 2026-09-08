import { cn } from '@/lib/utils';

import { copy } from '@/strings';

type SendModeToggleProps = {
  value: 'steer' | 'followUp'
  onChange: (value: 'steer' | 'followUp') => void
}

/** 生成中的投递方式显式选择（A7）：Steer 即时改向 / 轮后排队。 */
function SendModeToggle({ value, onChange }: SendModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full border border-border p-[2px]" role="radiogroup">
      {(['steer', 'followUp'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            'cursor-pointer rounded-full px-[9px] py-[3px] text-[11px] leading-none outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
            value === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode === 'steer' ? copy.flow.sendModeSteer : copy.flow.sendModeQueue}
        </button>
      ))}
    </div>
  );
}

export { SendModeToggle };
