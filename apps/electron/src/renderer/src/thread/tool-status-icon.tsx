import { Check, Loader2, Minus, Terminal, X } from 'lucide-react';

import { copy } from '@/strings';
import type { ToolCallStatus } from './thread-model';
import type { ToolKind } from './tool-kind';

type ToolStatusIconProps = {
  status: ToolCallStatus
  /** 工具类型：运行中命令以命令行图标呈现（加载态由行内文字波纹承担） */
  kind?: ToolKind
};

/** 执行单元状态图标：成功绿、失败红、停止灰；命令行运行中显静态命令图标，其余旋转；颜色全走主题 token。 */
function ToolStatusIcon({ status, kind }: ToolStatusIconProps) {
  if (status === 'running') {
    if (kind === 'bash') {
      return (
        <span role="status" aria-label={copy.flow.toolRunning} title={copy.flow.toolRunning} className="flex size-3 shrink-0 items-center justify-center">
          <Terminal className="size-3 shrink-0 text-muted-foreground" strokeWidth={2} />
        </span>
      );
    }
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
