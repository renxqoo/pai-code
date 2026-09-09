import * as React from 'react';

import type { CommandView } from '@paiapp/contracts';
import { AutocompleteGroupList, type AutocompleteGroup } from '@paiapp/ui';

import { ComposerHighlightLayer } from '@/composer/composer-highlight-layer';
import { leadingCommandHighlight, commandTokenDeleteRange } from '@/composer/command-highlight';
import { activeTokenQuery, applyTokenSelection, filterTokenItems, type TokenTrigger } from '@/composer/token-trigger';
import { fileGroup, slashCommandGroups } from '@/composer/command-groups';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

/** 输入框排版度量：textarea 与高亮镜像层共用同一份（两处渲染必须逐像素对齐）。 */
const INPUT_METRICS_CLASS = 'px-4 pt-[17px] pb-1 text-[12.5px] leading-[19px]';
/** relative z-[1]：textarea 必须画在高亮镜像层（absolute 定位元素）之上——CSS 绘制顺序
 * 中定位元素恒高于普通流内容、与 DOM 先后无关，不提升层级时光标会被镜像层文字遮挡。 */
const TEXTAREA_CLASS =
  'relative z-[1] block min-h-[84px] max-h-[280px] w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/85 field-sizing-content';

type PromptInputAreaProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** 外部聚焦句柄：编辑重发回填草稿后聚焦输入框 */
  textareaRef?: React.Ref<HTMLTextAreaElement>
  /** 会话内斜杠命令/技能目录（空 = 无会话：不启用 `/` 触发，仅 `@` 文件补全） */
  commands: readonly CommandView[]
  /** 补全弹层的无障碍名（命令 / 文件） */
  slashAriaLabel: string
  fileAriaLabel: string
  /** @ 文件引用的目录搜索（失败返回 null，弹层按空结果呈现） */
  onSearchFiles: (query: string) => Promise<string[] | null>
  /** 搜索上下文键（工作目录）：变化即丢弃旧目录结果并允许同 query 重拉（跨项目 @ 补全不串文件） */
  searchKey?: string
  /** 生成中：占位文案换排队提示（回车提交语义由父层裁决） */
  queueing: boolean
}

/** 输入区：多行 textarea + 首部命令高亮镜像层 + `@`/`/` 补全弹层（caret 跟踪与键盘状态机自治）。 */
function PromptInputArea({
  value,
  onChange,
  placeholder,
  textareaRef,
  commands,
  slashAriaLabel,
  fileAriaLabel,
  onSearchFiles,
  searchKey = '',
  queueing,
}: PromptInputAreaProps) {
  /** 首部命令 token 高亮：镜像层只画半透明底色带（垫在文字下），textarea
   * 文字保持原生渲染——textarea 与 div 的文本布局存在亚像素级差异，文字层
   * 镜像无法像素对齐；底色带误差视觉无感，光标/选区/输入法组合全部原生正确。 */
  const commandRanges = React.useMemo(() => leadingCommandHighlight(value, commands), [value, commands]);
  const highlighting = commandRanges.length > 0;
  const [inputScrollTop, setInputScrollTop] = React.useState(0);

  /** 斜杠补全交互态：caret 跟踪 + 键盘高亮 + Esc 抑制（query 变化后自动复弹）。
   * dismissedQuery 是单槽记忆：只记住最近一次被 Esc 关闭的 query 值——
   * 「Esc 后再输入新字符会复弹；删回到已关闭的旧值也可能复弹」为既定取舍。 */
  const [caret, setCaret] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dismissedQuery, setDismissedQuery] = React.useState<string | null>(null);
  const [pendingCaret, setPendingCaret] = React.useState<number | null>(null);
  /** 用户事件产出的最新 value：外部回填（编辑重发/切会话草稿）时重置交互态防幽灵弹层 */
  const userValueRef = React.useRef(value);

  /** 双触发：`/` 命令（同步过滤，无命令目录时不启用）与 `@` 文件（去抖异步搜索，序号守卫） */
  const slashQuery = commands.length > 0 ? activeTokenQuery(value, caret, '/') : null;
  const atQuery = activeTokenQuery(value, caret, '@');
  const trigger: TokenTrigger | null = slashQuery !== null ? '/' : atQuery !== null ? '@' : null;
  const query = trigger === null ? null : (trigger === '/' ? slashQuery : atQuery);
  const [fileItems, setFileItems] = React.useState<readonly string[]>([]);
  const fileSeqRef = React.useRef(0);
  const lastFileQueryRef = React.useRef<string | null>(null);

  /** 斜杠命令分组视图（组序即键盘导航序，items 由 groups 拍平派生） */
  const slashGroups = React.useMemo(
    () =>
      slashQuery === null
        ? []
        : slashCommandGroups(filterTokenItems(commands, slashQuery), {
            commandTitle: copy.composer.groupCommands,
            skillTitle: copy.composer.groupSkills,
          }),
    [commands, slashQuery],
  );
  const atGroup = React.useMemo(
    () => (atQuery === null ? null : fileGroup(fileItems, atQuery, copy.composer.groupFiles)),
    [fileItems, atQuery],
  );
  const groups: readonly AutocompleteGroup[] =
    trigger === '/' ? slashGroups : trigger === '@' ? (atGroup === null ? [] : [atGroup]) : [];
  const items = groups.flatMap((group) => group.items);
  const dismissedKey = trigger === null || query === null ? null : `${trigger}:${query}`;
  const autocompleteActive = trigger !== null && dismissedKey !== dismissedQuery && items.length > 0;
  const activeItemIndex = autocompleteActive ? activeIndex % items.length : -1;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [dismissedKey]);

  // @ 触发：200ms 去抖搜索；序号守卫丢弃过期响应；同目录同 query 不重复拉取
  //（key 带 searchKey：换目录后同 query 必须重拉，否则会把上一个项目的文件列进消息）
  React.useEffect(() => {
    if (atQuery === null) {
      lastFileQueryRef.current = null;
      return;
    }
    const key = `${searchKey}\u0000${atQuery}`;
    if (lastFileQueryRef.current === key) return;
    const handle = window.setTimeout(() => {
      fileSeqRef.current += 1;
      const seq = fileSeqRef.current;
      lastFileQueryRef.current = key;
      void onSearchFiles(atQuery).then((paths) => {
        if (seq !== fileSeqRef.current) return;
        setFileItems(paths ?? []);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [atQuery, searchKey, onSearchFiles]);

  // 换搜索上下文（目录）先清旧结果并丢弃去重记忆：新响应回来前不得展示上一个目录的文件，
  // 去重键不同步清则 A→B→A 快速折返会命中旧键而永不重拉
  React.useEffect(() => {
    setFileItems([]);
    lastFileQueryRef.current = null;
  }, [searchKey]);

  React.useEffect(() => {
    if (value === userValueRef.current) return;
    // 外部回填：caret 置末尾并清抑制态（弹层随 query 重算自然关闭/重开）
    userValueRef.current = value;
    setCaret(value.length);
    setDismissedQuery(null);
  }, [value]);

  React.useEffect(() => {
    if (pendingCaret === null) return;
    // textareaRef 是 Ref 或回调 ref 的联合：仅对象 ref 可直接定位光标
    if (textareaRef !== null && textareaRef !== undefined && typeof textareaRef !== 'function') {
      textareaRef.current?.setSelectionRange(pendingCaret, pendingCaret);
    }
    setCaret(pendingCaret);
    setPendingCaret(null);
  }, [pendingCaret, textareaRef]);

  const acceptToken = (label: string): void => {
    if (trigger === null) return;
    const next = applyTokenSelection(value, caret, trigger, label);
    onChange(next.text);
    setPendingCaret(next.caret);
    setDismissedQuery(null);
  };

  const syncCaret = (element: HTMLTextAreaElement): void => {
    userValueRef.current = element.value;
    setCaret(element.selectionStart ?? 0);
  };

  return (
    <div className="relative">
      {autocompleteActive ? (
        <div className="absolute bottom-full left-1 right-1 z-10 mb-[6px]">
          <AutocompleteGroupList
            groups={groups}
            activeId={items[activeItemIndex]?.id ?? null}
            onSelect={(id) => {
              const item = items.find((entry) => entry.id === id);
              if (item !== undefined) acceptToken(item.label);
            }}
            onHover={(id) => {
              const index = items.findIndex((entry) => entry.id === id);
              if (index >= 0) setActiveIndex(index);
            }}
            ariaLabel={trigger === '/' ? slashAriaLabel : fileAriaLabel}
            footerHint={trigger === '/' ? copy.composer.slashHint : undefined}
            scrollDownLabel={copy.composer.scrollDown}
          />
        </div>
      ) : null}
      {highlighting ? (
        <ComposerHighlightLayer text={value} ranges={commandRanges} scrollTop={inputScrollTop} metricsClassName={INPUT_METRICS_CLASS} />
      ) : null}
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={queueing ? copy.composer.queuePlaceholder : placeholder}
        onScroll={(event) => setInputScrollTop(event.currentTarget.scrollTop)}
        onChange={(event) => {
          onChange(event.target.value);
          syncCaret(event.currentTarget);
        }}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onFocus={(event) => syncCaret(event.currentTarget)}
        onKeyDown={(event) => {
          // 原子删除：光标紧贴命中 token 边界时整体删除（execCommand 走原生
          // 编辑路径保住撤销栈；不可用时回退直接改值）；补全弹层打开期间不拦截
          if ((event.key === 'Backspace' || event.key === 'Delete') && !autocompleteActive && !event.nativeEvent.isComposing) {
            const element = event.currentTarget;
            const target = commandTokenDeleteRange(
              commandRanges[0],
              element.selectionStart ?? 0,
              element.selectionEnd ?? 0,
              event.key,
            );
            if (target !== null) {
              event.preventDefault();
              element.setSelectionRange(target.start, target.end);
              if (!document.execCommand('delete')) {
                onChange(value.slice(0, target.start) + value.slice(target.end));
                setPendingCaret(target.start);
              }
              return;
            }
          }
          if (autocompleteActive && !event.nativeEvent.isComposing) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % items.length);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + items.length) % items.length);
              return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              // 采纳补全：Enter 不再走提交语义
              event.preventDefault();
              const picked = items[activeItemIndex];
              if (picked !== undefined) acceptToken(picked.label);
              return;
            }
            if (event.key === 'Escape') {
              // 只关补全层，不外溢全局停止语义
              event.stopPropagation();
              setDismissedQuery(dismissedKey);
              return;
            }
          }
          // 输入法组合期间的 Enter 是候选确认，不提交
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          // 统一走 form 提交路径：生成中转为排队、空文本不提交（语义由父层 form onSubmit 裁决）
          event.currentTarget.form?.requestSubmit();
        }}
        rows={2}
        className={cn(TEXTAREA_CLASS, INPUT_METRICS_CLASS, 'text-foreground')}
      />
    </div>
  );
}

export { PromptInputArea };
export type { PromptInputAreaProps };
