import type * as React from 'react';
import { ChevronDown, Folder, GitBranch } from 'lucide-react';

import { AnchoredPanel } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

/** 锚定面板插槽：开合状态由调用方持有，content 为面板内容件渲染产物。 */
type ContextSegmentPanel = {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: React.ReactNode
};

/** 上下文条单段：可点（给了 onSelect）为切换入口，缺省即只读文本。 */
type ContextSegmentSpec = {
  label: string
  /** 完整路径 / 状态原因 tooltip */
  title?: string
  /** 只读弱化呈现（加载中 / 非仓库 / 游离 HEAD） */
  muted?: boolean
  ariaLabel: string
  onSelect?: () => void
  /** 锚定面板插槽：存在时该段升级为面板触发器（呈现 ⌄，开合由锚定底座接管）；当前仅分支段消费 */
  panel?: ContextSegmentPanel
};

type PromptContextBarProps = {
  /** 项目段：null = 无工作目录（不渲染） */
  project: ContextSegmentSpec | null
  /** 分支段：null = 尚未选定工作目录（不渲染，不拿「分支不可用」冒充未选状态） */
  branch: ContextSegmentSpec | null
};

/** 单段渲染（图标 + 文案 + 可点 chevron）；非组件：无状态、无 hooks。 */
function segmentNode(icon: 'project' | 'branch', spec: ContextSegmentSpec): React.JSX.Element {
  const Icon = icon === 'project' ? Folder : GitBranch;
  const interactive = spec.onSelect !== undefined || spec.panel !== undefined;
  const body = (
    <>
      <Icon className="size-3 shrink-0" strokeWidth={1.75} />
      <span className="max-w-[220px] truncate whitespace-nowrap">{spec.label}</span>
      {interactive ? <ChevronDown className="size-3 opacity-70" strokeWidth={2} /> : null}
    </>
  );
  const base = cn(
    'flex h-[22px] items-center gap-[6px] rounded-[7px] px-[7px] text-[11.5px] leading-none',
    spec.muted === true ? 'text-muted-foreground/70' : 'text-muted-foreground/90',
  );
  if (!interactive) {
    return (
      <span className={base} title={spec.title}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={spec.ariaLabel}
      title={spec.title}
      onClick={spec.onSelect}
      className={cn(
        base,
        'cursor-pointer outline-none select-none hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5 aria-expanded:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      {body}
    </button>
  );
}

/**
 * 输入卡上方的项目/分支灰底条：新任务页两段皆可切（打开选择弹窗），
 * 线程页两段只读（运行中切分支会改工作树基线，见方案「不处理」）。
 * 分支段带 panel 插槽时渲染为锚定面板触发器，面板从触发器上缘向上弹出。
 * 下圆角由输入卡（-mt 叠合）压住，视觉上与卡片连成一体。
 */
function PromptContextBar({ project, branch }: PromptContextBarProps) {
  return (
    <div className="flex items-center gap-[2px] rounded-[12px] bg-surface-subtle px-[10px] pt-[6px] pb-[12px]">
      {project === null ? null : segmentNode('project', project)}
      {branch === null ? null : branch.panel === undefined ? (
        segmentNode('branch', branch)
      ) : (
        <AnchoredPanel
          open={branch.panel.open}
          onOpenChange={branch.panel.onOpenChange}
          trigger={segmentNode('branch', branch)}
          label={copy.branch.panelTitle}
        >
          {branch.panel.content}
        </AnchoredPanel>
      )}
    </div>
  );
}

export { PromptContextBar };
export type { PromptContextBarProps, ContextSegmentSpec, ContextSegmentPanel };
