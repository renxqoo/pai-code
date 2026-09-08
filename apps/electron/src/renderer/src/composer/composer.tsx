import * as React from 'react';

import { AutocompleteList } from '@paiapp/ui';
import type { CommandView } from '@paiapp/contracts';

import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { ComposerContextBar } from '@/composer/composer-context-bar';
import { activeSlashQuery, applySlashSelection, filterSlashItems } from '@/composer/slash-trigger';

type ComposerProps = {
  value: string
  placeholder: string
  /** 外部聚焦句柄：编辑重发回填草稿后聚焦输入框 */
  textareaRef?: React.Ref<HTMLTextAreaElement>
  attachLabel: string
  sendLabel: string
  stopLabel: string
  contextUsageLabel: string
  compactLabel: string
  contextUsed: number
  model: string
  effort: string
  checkout: string
  checkoutLabel: string
  modelOptions: readonly string[]
  effortOptions: readonly string[]
  checkoutOptions: readonly string[]
  /** 会话内斜杠命令/技能目录（补全数据源） */
  commands: readonly CommandView[]
  /** 补全弹层的无障碍名 */
  slashAriaLabel: string
  /** 无可选模型时的引导文案（点击触发 onOpenSettings） */
  noModelsLabel: string
  /** 思考档不可用时的禁用原因文案 */
  effortUnavailableLabel: string
  /** 有生成任务时回车与提交动作都转为停止 */
  generating: boolean
  /** 压缩进行中：压缩按钮禁用，横幅由 ThreadBanner 呈现 */
  compacting: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  onAttach: () => void
  onCompact: () => void
  onOpenSettings?: () => void
  onSelectModel: (value: string) => void
  onSelectEffort: (value: string) => void
  onSelectCheckout: (value: string) => void
}

/** 输入卡：多行输入 + 操作行 + 本地检出条，底部锚定于主区。 */
function Composer({
  value,
  placeholder,
  textareaRef,
  attachLabel,
  sendLabel,
  stopLabel,
  contextUsageLabel,
  compactLabel,
  contextUsed,
  model,
  effort,
  checkout,
  checkoutLabel,
  modelOptions,
  effortOptions,
  checkoutOptions,
  commands,
  slashAriaLabel,
  noModelsLabel,
  effortUnavailableLabel,
  generating,
  compacting,
  onChange,
  onSubmit,
  onStop,
  onAttach,
  onCompact,
  onOpenSettings,
  onSelectModel,
  onSelectEffort,
  onSelectCheckout,
}: ComposerProps) {
  const canSend = value.trim().length > 0;

  /** 斜杠补全交互态：caret 跟踪 + 键盘高亮 + Esc 抑制（query 变化后自动复弹）。
   * dismissedQuery 是单槽记忆：只记住最近一次被 Esc 关闭的 query 值——
   * 「Esc 后再输入新字符会复弹；删回到已关闭的旧值也可能复弹」为既定取舍。 */
  const [caret, setCaret] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dismissedQuery, setDismissedQuery] = React.useState<string | null>(null);
  const [pendingCaret, setPendingCaret] = React.useState<number | null>(null);
  /** 用户事件产出的最新 value：外部回填（编辑重发/切会话草稿）时重置交互态防幽灵弹层 */
  const userValueRef = React.useRef(value);

  const query = activeSlashQuery(value, caret);
  const slashItems = React.useMemo(
    () => (query === null ? [] : filterSlashItems(commands, query)),
    [commands, query],
  );
  const slashActive = query !== null && query !== dismissedQuery && slashItems.length > 0;
  const activeItem = slashActive ? slashItems[activeIndex % slashItems.length] : undefined;
  const itemId = (command: { source: string; name: string }): string => `${command.source}:${command.name}`;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

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

  const acceptSlash = (name: string): void => {
    const next = applySlashSelection(value, caret, name);
    onChange(next.text);
    setPendingCaret(next.caret);
    setDismissedQuery(null);
  };

  const syncCaret = (element: HTMLTextAreaElement): void => {
    userValueRef.current = element.value;
    setCaret(element.selectionStart ?? 0);
  };

  return (
    <div className="mx-auto w-full max-w-[700px]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // 生成中 Enter = 排队消息（followUp，api.md 语义）；停止走停止按钮/Esc
          if (!canSend) return;
          onSubmit();
        }}
        className="rounded-[20px] border border-border bg-background shadow-[0_14px_22px_-16px_rgba(24,24,28,0.22)] transition-colors duration-150 focus-within:border-foreground/15"
      >
        <div className="relative">
          {slashActive ? (
            <div className="absolute bottom-full left-4 z-10 mb-[4px]">
              <AutocompleteList
                items={slashItems.map((command) => ({ id: itemId(command), label: command.name, description: command.description }))}
                activeId={activeItem === undefined ? null : itemId(activeItem)}
                onSelect={(id) => {
                  const item = slashItems.find((command) => itemId(command) === id);
                  if (item !== undefined) acceptSlash(item.name);
                }}
                onHover={(id) => {
                  const index = slashItems.findIndex((command) => itemId(command) === id);
                  if (index >= 0) setActiveIndex(index);
                }}
                ariaLabel={slashAriaLabel}
              />
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value);
              syncCaret(event.currentTarget);
            }}
            onKeyUp={(event) => syncCaret(event.currentTarget)}
            onClick={(event) => syncCaret(event.currentTarget)}
            onFocus={(event) => syncCaret(event.currentTarget)}
            onKeyDown={(event) => {
              if (slashActive && !event.nativeEvent.isComposing) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((index) => (index + 1) % slashItems.length);
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => (index - 1 + slashItems.length) % slashItems.length);
                  return;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  // 采纳补全：Enter 不再走提交语义
                  event.preventDefault();
                  if (activeItem !== undefined) acceptSlash(activeItem.name);
                  return;
                }
                if (event.key === 'Escape') {
                  // 只关补全层，不外溢全局停止语义
                  event.stopPropagation();
                  setDismissedQuery(query);
                  return;
                }
              }
              // 输入法组合期间的 Enter 是候选确认，不提交
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              // 统一走 form 提交路径：生成中转为停止、空文本不提交
              event.currentTarget.form?.requestSubmit();
            }}
            rows={2}
            className="block min-h-[84px] w-full resize-none bg-transparent px-4 pt-[17px] pb-1 text-[12.5px] leading-[19px] text-foreground outline-none placeholder:text-muted-foreground/85 field-sizing-content"
          />
        </div>
        <ComposerActionsRow
          model={model}
          effort={effort}
          modelOptions={modelOptions}
          effortOptions={effortOptions}
          attachLabel={attachLabel}
          sendLabel={sendLabel}
          stopLabel={stopLabel}
          contextUsageLabel={contextUsageLabel}
          compactLabel={compactLabel}
          contextUsed={contextUsed}
          canSend={canSend}
          generating={generating}
          compacting={compacting}
          noModelsLabel={noModelsLabel}
          effortUnavailableLabel={effortUnavailableLabel}
          onSelectModel={onSelectModel}
          onSelectEffort={onSelectEffort}
          onAttach={onAttach}
          onCompact={onCompact}
          onOpenSettings={onOpenSettings}
          onStop={onStop}
        />
      </form>
      <ComposerContextBar
        checkoutLabel={checkoutLabel}
        checkout={checkout}
        checkoutOptions={checkoutOptions}
        onSelectCheckout={onSelectCheckout}
      />
    </div>
  );
}

const ComposerMemo = React.memo(Composer);
export { ComposerMemo as Composer };
