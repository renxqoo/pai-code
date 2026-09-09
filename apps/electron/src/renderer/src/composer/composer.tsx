import * as React from 'react';

import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { AutocompleteGroupList, type AutocompleteGroup } from '@paiapp/ui';
import type { CommandView, PermissionRules, SessionStatsView } from '@paiapp/contracts';

import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { ComposerContextBar } from '@/composer/composer-context-bar';
import { ComposerHighlightLayer } from '@/composer/composer-highlight-layer';
import { leadingCommandHighlight, commandTokenDeleteRange } from '@/composer/command-highlight';
import { AttachmentChips } from '@/composer/attachment-chips';
import { QueuedMessageCard } from '@/composer/queued-message-card';
import { imageDataUrl, readImageFile, type PendingImage } from '@/composer/read-image-file';
import { activeTokenQuery, applyTokenSelection, filterTokenItems, type TokenTrigger } from '@/composer/token-trigger';
import { fileGroup, slashCommandGroups } from '@/composer/command-groups';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

/** 输入卡持有的图片附件（提交时原样交 onSubmit，协议转换由调用层负责）。 */
export type ComposerAttachment = { id: number; name: string; payload: PendingImage };

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
  /** 会话权限模式（当前生效；null = 未加载/无会话，操作栏控件不渲染） */
  permissionMode: PermissionRules['mode'] | null
  /** true = 生效规则来自全局文件（无会话 sidecar） */
  permissionFollowsGlobal: boolean
  /** 会话内斜杠命令/技能目录（补全数据源） */
  commands: readonly CommandView[]
  /** 补全弹层的无障碍名（命令 / 文件） */
  slashAriaLabel: string
  fileAriaLabel: string
  /** @ 文件引用的目录搜索（失败返回 null，弹层按空结果呈现） */
  onSearchFiles: (query: string) => Promise<string[] | null>
  /** 用量明细（I1）。 */
  stats: SessionStatsView | null
  /** 会话标识：切换时清空附件（防图片串发到别的会话）。 */
  threadId: string
  /** 无可选模型时的引导文案（点击触发 onOpenSettings） */
  noModelsLabel: string
  /** 思考档不可用时的禁用原因文案 */
  effortUnavailableLabel: string
  /** 有生成任务时回车 = 排队消息（语义由父层按会话状态裁决），发送键仍为停止 */
  generating: boolean
  /** 压缩进行中：压缩按钮禁用，横幅由 ThreadBanner 呈现 */
  compacting: boolean
  /** 本地暂存的排队消息（旧→新；生成中显示为输入卡顶部的灰色卡片堆） */
  queuedMessages: readonly { id: number; text: string }[]
  onSendNowQueued: (id: number) => void
  onEditQueued: (id: number) => void
  onRemoveQueued: (id: number) => void
  /** 一次性图片回填信号：token 变化时把 images 并入附件态；null = 无回填 */
  restore: { token: number; images: readonly { name: string; payload: PendingImage }[] } | null
  onChange: (value: string) => void
  /** 提交（文本 + 附件原样交出，投递语义由父层决定）；resolve true = 已发出（composer 据此清空附件） */
  onSubmit: (text: string, attachments: readonly ComposerAttachment[]) => Promise<boolean>
  onStop: () => void
  onCompact: () => void
  onOpenSettings?: () => void
  onSelectModel: (value: string) => void
  onSelectEffort: (value: string) => void
  onSelectCheckout: (value: string) => void
  onSelectPermissionMode: (mode: PermissionRules['mode']) => void
  onFollowPermissionGlobal: () => void
}

/** 输入框排版度量：textarea 与高亮镜像层共用同一份（两处渲染必须逐像素对齐）。 */
const INPUT_METRICS_CLASS = 'px-4 pt-[17px] pb-1 text-[12.5px] leading-[19px]';
/** relative z-[1]：textarea 必须画在高亮镜像层（absolute 定位元素）之上——CSS 绘制顺序
 * 中定位元素恒高于普通流内容、与 DOM 先后无关，不提升层级时光标会被镜像层文字遮挡。 */
const TEXTAREA_CLASS =
  'relative z-[1] block min-h-[84px] max-h-[280px] w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/85 field-sizing-content';

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
  permissionMode,
  permissionFollowsGlobal,
  commands,
  slashAriaLabel,
  fileAriaLabel,
  onSearchFiles,
  stats,
  threadId,
  noModelsLabel,
  effortUnavailableLabel,
  generating,
  compacting,
  queuedMessages,
  onSendNowQueued,
  onEditQueued,
  onRemoveQueued,
  restore,
  onChange,
  onSubmit,
  onStop,
  onCompact,
  onOpenSettings,
  onSelectModel,
  onSelectEffort,
  onSelectCheckout,
  onSelectPermissionMode,
  onFollowPermissionGlobal,
}: ComposerProps) {
  const canSend = value.trim().length > 0;

  /** 首部命令 token 高亮：镜像层只画半透明底色带（垫在文字下），textarea
   * 文字保持原生渲染——textarea 与 div 的文本布局存在亚像素级差异，文字层
   * 镜像无法像素对齐；底色带误差视觉无感，光标/选区/输入法组合全部原生正确。 */
  const commandRanges = React.useMemo(() => leadingCommandHighlight(value, commands), [value, commands]);
  const highlighting = commandRanges.length > 0;
  const [inputScrollTop, setInputScrollTop] = React.useState(0);

  /** 图片附件态：读取与持有都在本组件（提交成功才清空）；预览用 data URL，无对象 URL 生命周期。 */
  const [attachments, setAttachments] = React.useState<readonly ComposerAttachment[]>([]);
  const [attachError, setAttachError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const attachSeqRef = React.useRef(0);

  const addFiles = (files: readonly File[]): void => {
    setAttachError(null);
    void Promise.all(files.map(async (file) => ({ file, image: await readImageFile(file) }))).then((results) => {
      const added: ComposerAttachment[] = [];
      for (const result of results) {
        if (result.image === null) {
          setAttachError(copy.composer.imageUnsupported);
          continue;
        }
        attachSeqRef.current += 1;
        added.push({ id: attachSeqRef.current, name: result.file.name, payload: result.image });
      }
      if (added.length > 0) setAttachments((current) => [...current, ...added]);
    });
  };

  const removeAttachment = (id: number): void => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  };

  /** 一次性回填：编辑重发等通路的图片并入附件态（不覆盖已有附件），token 只消费一次 */
  const appliedRestoreTokenRef = React.useRef<number | null>(restore === null ? null : restore.token);
  React.useEffect(() => {
    if (restore === null || appliedRestoreTokenRef.current === restore.token) return;
    appliedRestoreTokenRef.current = restore.token;
    if (restore.images.length === 0) return;
    const added = restore.images.map((image) => {
      attachSeqRef.current += 1;
      return { id: attachSeqRef.current, name: image.name, payload: image.payload };
    });
    setAttachments((current) => [...current, ...added]);
  }, [restore]);

  // 切会话清空附件（文本草稿按会话隔离，附件同样不得串扰）
  const prevThreadRef = React.useRef(threadId);
  React.useEffect(() => {
    if (prevThreadRef.current === threadId) return;
    prevThreadRef.current = threadId;
    setAttachments([]);
    setAttachError(null);
  }, [threadId]);

  const clearAttachments = (): void => {
    setAttachments([]);
  };

  /** 斜杠补全交互态：caret 跟踪 + 键盘高亮 + Esc 抑制（query 变化后自动复弹）。
   * dismissedQuery 是单槽记忆：只记住最近一次被 Esc 关闭的 query 值——
   * 「Esc 后再输入新字符会复弹；删回到已关闭的旧值也可能复弹」为既定取舍。 */
  const [caret, setCaret] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dismissedQuery, setDismissedQuery] = React.useState<string | null>(null);
  const [pendingCaret, setPendingCaret] = React.useState<number | null>(null);
  /** 用户事件产出的最新 value：外部回填（编辑重发/切会话草稿）时重置交互态防幽灵弹层 */
  const userValueRef = React.useRef(value);

  /** 双触发：`/` 命令（同步过滤）与 `@` 文件（去抖异步搜索，序号守卫） */
  const slashQuery = activeTokenQuery(value, caret, '/');
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

  // @ 触发：200ms 去抖搜索；序号守卫丢弃过期响应；同 query 不重复拉取
  React.useEffect(() => {
    if (atQuery === null) {
      lastFileQueryRef.current = null;
      return;
    }
    if (lastFileQueryRef.current === atQuery) return;
    const handle = window.setTimeout(() => {
      fileSeqRef.current += 1;
      const seq = fileSeqRef.current;
      lastFileQueryRef.current = atQuery;
      void onSearchFiles(atQuery).then((paths) => {
        if (seq !== fileSeqRef.current) return;
        setFileItems(paths ?? []);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [atQuery, onSearchFiles]);

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
    <div className={`${CONVERSATION_COLUMN_CLASS} pointer-events-auto`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // 生成中 Enter = 排队消息（投递语义由父层裁决）；停止走停止按钮/Esc
          if (!canSend) return;
          void onSubmit(value, attachments).then((sent) => {
            if (sent) clearAttachments();
          });
        }}
        className="rounded-[20px] border border-border bg-background shadow-[0_14px_22px_-16px_rgba(24,24,28,0.22)] transition-colors duration-150 focus-within:border-foreground/15"
      >
        {queuedMessages.length > 0 ? (
          // 贴卡片顶部的排队堆：容器裁出与输入卡一致的内圆角，多条卡片纵向相连（旧→新）
          <div className="overflow-hidden rounded-t-[19px]">
            {queuedMessages.map((item) => (
              <QueuedMessageCard
                key={item.id}
                text={item.text}
                sendNowLabel={copy.composer.sendNow}
                editLabel={copy.composer.editQueued}
                removeLabel={copy.composer.removeQueued}
                onSendNow={() => onSendNowQueued(item.id)}
                onEdit={() => onEditQueued(item.id)}
                onRemove={() => onRemoveQueued(item.id)}
              />
            ))}
          </div>
        ) : null}
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
            placeholder={generating ? copy.composer.queuePlaceholder : placeholder}
            onScroll={(event) => setInputScrollTop(event.currentTarget.scrollTop)}
            onChange={(event) => {
              onChange(event.target.value);
              syncCaret(event.currentTarget);
            }}
            onKeyUp={(event) => syncCaret(event.currentTarget)}
            onClick={(event) => syncCaret(event.currentTarget)}
            onFocus={(event) => syncCaret(event.currentTarget)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData?.items ?? [])
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
              if (files.length === 0) return;
              event.preventDefault();
              addFiles(files);
            }}
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
              // 统一走 form 提交路径：生成中转为停止、空文本不提交
              event.currentTarget.form?.requestSubmit();
            }}
            rows={2}
            className={cn(
              TEXTAREA_CLASS,
              INPUT_METRICS_CLASS,
              'text-foreground',
            )}
          />
        </div>
        {attachments.length > 0 ? (
          <AttachmentChips
            items={attachments.map((item) => ({ id: item.id, name: item.name, preview: imageDataUrl(item.payload) }))}
            removeLabel={copy.composer.removeImage}
            onRemove={removeAttachment}
          />
        ) : null}
        {attachError !== null ? <p className="px-4 pt-[6px] text-[11px] text-red-600">{attachError}</p> : null}
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
          permissionMode={permissionMode}
          permissionFollowsGlobal={permissionFollowsGlobal}
          onSelectPermissionMode={onSelectPermissionMode}
          onFollowPermissionGlobal={onFollowPermissionGlobal}
          stats={stats}
          onAttach={() => fileInputRef.current?.click()}
          onCompact={onCompact}
          onOpenSettings={onOpenSettings}
          onStop={onStop}
        />
      </form>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          // 允许连续选择同一文件
          event.target.value = '';
        }}
      />
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
