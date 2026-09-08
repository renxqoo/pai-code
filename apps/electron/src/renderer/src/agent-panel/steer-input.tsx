import * as React from 'react';
import { CornerDownLeft } from 'lucide-react';

import { copy } from '@/strings';

type SteerInputProps = {
  onSubmit: (message: string) => void
}

/** 运行中子代理的行内 steer 输入（H1）：Enter 提交（IME 组合期放行），提交后清空。 */
function SteerInput({ onSubmit }: SteerInputProps) {
  const [value, setValue] = React.useState('');
  return (
    <div className="mt-[8px] pl-[16px]">
      <div className="flex items-center gap-[6px] rounded-[8px] border border-border px-[8px] py-[4px] focus-within:border-foreground/25">
        <input
          value={value}
          placeholder={copy.flow.steerPlaceholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing || value.trim().length === 0) return;
            event.preventDefault();
            onSubmit(value.trim());
            setValue('');
          }}
          className="h-[22px] min-w-0 flex-1 bg-transparent text-[11.5px] leading-none text-foreground outline-none placeholder:text-muted-foreground/80"
        />
        <CornerDownLeft className="size-[11px] shrink-0 text-muted-foreground/60" strokeWidth={1.75} aria-hidden="true" />
      </div>
    </div>
  );
}

export { SteerInput };
