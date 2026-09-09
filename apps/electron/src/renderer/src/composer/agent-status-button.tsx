import { Bot } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

type AgentStatusButtonProps = {
  /** 工作中子代理数量；<= 0 不渲染（没有在跑的就不摆控件）。 */
  count: number
  onOpen: () => void
}

/** 输入框底行子代理状态：Bot 图标 + 右上角小数字，点击打开 Agents 侧栏面板。 */
function AgentStatusButton({ count, onOpen }: AgentStatusButtonProps) {
  if (count <= 0) return null;
  const label = copy.flow.agentsWorking(count);
  return (
    <IconButton label={label} size="sm" onClick={onOpen} className="text-muted-foreground/90">
      <Bot strokeWidth={1.75} />
      <span
        aria-hidden="true"
        className="absolute -top-[3px] -right-[3px] flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-link px-[3px] font-mono text-[9px] leading-none tabular-nums text-white"
      >
        {count}
      </span>
    </IconButton>
  );
}

export { AgentStatusButton };
