import * as React from 'react';

import { ArrowDownIcon, InfoIcon } from 'lucide-react';
import { cn } from 'cn';

export type AutocompleteGroupItem = {
  id: string
  label: string
  description?: string | null
}

export type AutocompleteGroup = {
  id: string
  title: string
  items: readonly AutocompleteGroupItem[]
}

type AutocompleteGroupListProps = {
  /** 外部传入的分组列表；items 为空的组整组跳过（标题也不渲染） */
  groups: readonly AutocompleteGroup[]
  /** 键盘高亮条目 id（跨组扁平唯一）；null = 无高亮 */
  activeId: string | null
  onSelect: (id: string) => void
  /** 鼠标悬停同步高亮（防键盘/鼠标高亮打架） */
  onHover: (id: string) => void
  ariaLabel: string
  /** 底部 ⓘ 提示行文案；缺省不渲染底部行（含下滚按钮） */
  footerHint?: string
  /** 下滚按钮的无障碍名（用户可见文案由调用方从 strings 传入） */
  scrollDownLabel?: string
  className?: string
}

/** 列表是否还能向下滚动（scroll 事件与内容变化后重算的纯判定）。 */
function canScrollMore(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight < scrollHeight - 1;
}

/**
 * 分组补全面板：组标题 + 组条目两层结构，条目「名称（重点）+ 描述（弱化）」单行排布。
 * 不做绝对定位（由调用方包裹容器负责定位）；高亮统一由 activeId 驱动，
 * 鼠标悬停经 onHover 回流给调用方，避免键盘/鼠标高亮打架。
 * 底部下滚按钮只在列表还有更多内容时出现，点击下滚约一屏。
 */
function AutocompleteGroupList({
  groups,
  activeId,
  onSelect,
  onHover,
  ariaLabel,
  footerHint,
  scrollDownLabel,
  className,
}: AutocompleteGroupListProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = React.useState(false);

  const updateScrollable = React.useCallback(() => {
    const el = scrollRef.current;
    if (el === null) {
      setScrollable(false);
      return;
    }
    setScrollable(canScrollMore(el.scrollTop, el.clientHeight, el.scrollHeight));
  }, []);

  // 内容变化（分组数据）与首帧挂载都可能改变可滚动判定
  React.useEffect(() => {
    updateScrollable();
  }, [groups, updateScrollable]);

  const visibleGroups = groups.filter((group) => group.items.length > 0);
  if (visibleGroups.length === 0) return null;

  const scrollDown = (): void => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
  };

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className={cn(
        'w-full overflow-hidden rounded-2xl border border-border/70 bg-background py-[2px] shadow-[0_18px_40px_-20px_rgba(24,24,28,0.35)]',
        className,
      )}
    >
      <div ref={scrollRef} onScroll={updateScrollable} className="max-h-[220px] overflow-y-auto overscroll-contain">
        {visibleGroups.map((group) => (
          <div key={group.id} role="group" aria-label={group.title} className="px-1">
            <div className="truncate px-[10px] pb-[2px] pt-[10px] text-[12.5px] leading-4 text-muted-foreground">
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHover(item.id)}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-baseline gap-2.5 rounded-xl px-[10px] py-[6px] text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    active && 'bg-muted/70',
                  )}
                >
                  <span className="shrink-0 truncate text-[13.5px] leading-[22px] font-semibold text-foreground">
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="min-w-0 flex-1 truncate text-[13.5px] leading-[22px] text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {footerHint !== undefined ? (
        <div className="relative flex items-center gap-2 px-[14px] pb-[6px] pt-[4px]">
          <InfoIcon className="h-[14px] w-[14px] shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
          <span className="min-w-0 truncate text-[12.5px] leading-[18px] text-muted-foreground/90">{footerHint}</span>
          {scrollable ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={scrollDownLabel}
              title={scrollDownLabel}
              onClick={scrollDown}
              className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm outline-none"
            >
              <ArrowDownIcon className="h-3 w-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { AutocompleteGroupList }
export type { AutocompleteGroupListProps }
export { canScrollMore }
