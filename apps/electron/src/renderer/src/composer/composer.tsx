import * as React from 'react';

import { ComposerActionsRow } from '@/composer/composer-actions-row';
import { ComposerContextBar } from '@/composer/composer-context-bar';

type ComposerProps = {
  value: string
  placeholder: string
  /** 外部聚焦句柄：编辑重发回填草稿后聚焦输入框 */
  textareaRef?: React.Ref<HTMLTextAreaElement>
  attachLabel: string
  sendLabel: string
  stopLabel: string
  contextUsageLabel: string
  contextUsed: number
  model: string
  effort: string
  access: string
  checkout: string
  checkoutLabel: string
  modelOptions: readonly string[]
  effortOptions: readonly string[]
  accessOptions: readonly string[]
  checkoutOptions: readonly string[]
  /** 有生成任务时回车与提交动作都转为停止 */
  generating: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  onAttach: () => void
  onSelectModel: (value: string) => void
  onSelectEffort: (value: string) => void
  onSelectAccess: (value: string) => void
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
  contextUsed,
  model,
  effort,
  access,
  checkout,
  checkoutLabel,
  modelOptions,
  effortOptions,
  accessOptions,
  checkoutOptions,
  generating,
  onChange,
  onSubmit,
  onStop,
  onAttach,
  onSelectModel,
  onSelectEffort,
  onSelectAccess,
  onSelectCheckout,
}: ComposerProps) {
  const canSend = value.trim().length > 0;

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
        <textarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // 输入法组合期间的 Enter 是候选确认，不提交
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            // 统一走 form 提交路径：生成中转为停止、空文本不提交
            event.currentTarget.form?.requestSubmit();
          }}
          rows={2}
          className="block min-h-[84px] w-full resize-none bg-transparent px-4 pt-[17px] pb-1 text-[12.5px] leading-[19px] text-foreground outline-none placeholder:text-muted-foreground/85 field-sizing-content"
        />
        <ComposerActionsRow
          model={model}
          effort={effort}
          access={access}
          modelOptions={modelOptions}
          effortOptions={effortOptions}
          accessOptions={accessOptions}
          attachLabel={attachLabel}
          sendLabel={sendLabel}
          stopLabel={stopLabel}
          contextUsageLabel={contextUsageLabel}
          contextUsed={contextUsed}
          canSend={canSend}
          generating={generating}
          onSelectModel={onSelectModel}
          onSelectEffort={onSelectEffort}
          onSelectAccess={onSelectAccess}
          onAttach={onAttach}
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
