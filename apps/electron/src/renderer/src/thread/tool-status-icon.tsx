import { Check, Loader2, Minus, X } from 'lucide-react';

import { copy } from '@/strings';
import type { ToolCallStatus } from './thread-model';

type ToolStatusIconProps = {
  status: ToolCallStatus
};

/** 执行单元状态图标：运行中旋转、成功绿、失败红、停止灰；颜色全部走主题 token（暗色亮色共用）。 */
function ToolStatusIcon({ status }: ToolStatusIconProps) {
  if (status === 'running') {
    return (
      <span role="status" aria-label={copy.flow.toolRunning} title={copy.flow.toolRunning} className="flex size-3 shrink-0 items-center justify-center">
        <Loader2 className="size-3 animate-spin text-dot-active motion-reduce:animate-none" strokeWidth={2} />
      </span>
    );
  }
  if (status === 'ok') {
    return <Check aria-hidden="true" className="size-3 shrink-0 text-dot-done" strokeWidth={2.25} />;
  }
  if (status === 'failed') {
    return <X aria-hidden="true" className="size-3 shrink-0 text-diff-del" strokeWidth={2.25} />;
  }
  return <Minus aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/60" strokeWidth={2} />;
}

export { ToolStatusIcon };
