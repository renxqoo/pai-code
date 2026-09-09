import * as React from "react";
import { Check, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { copy } from "@/strings";

import { FieldLabel } from "./field-label";

type ProviderModelDialogFieldsProps = {
  id: string;
  /** id 校验错误文案（null = 无错误，不渲染错误行）。 */
  idError: string | null;
  contextWindow: string;
  contextWindowError: string | null;
  maxTokens: string;
  maxTokensError: string | null;
  /** 图片输入模态（文本恒开，不在表单状态里）。 */
  vision: boolean;
  onIdChange: (id: string) => void;
  /** 数字输入回调收到的是已过滤的纯数字串（可能为空）。 */
  onContextWindowChange: (digits: string) => void;
  onMaxTokensChange: (digits: string) => void;
  onVisionToggle: () => void;
};

/** 数字输入契约：留空 = undefined（不设置，回落运行时默认）；非空必须是正整数。 */
export type ParsedNumberInput = { ok: true; value: number | undefined } | { ok: false };

/** 数字输入解析：空串回落 undefined；其余须为正整数且在安全整数域内
 * （超出 MAX_SAFE_INTEGER 会静默丢精度，拒绝优于落错值；'0'/'1.5'/'-1' 均非法）。 */
export function parsePositiveIntOrEmpty(text: string): ParsedNumberInput {
  if (text.length === 0) return { ok: true, value: undefined };
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? { ok: true, value } : { ok: false };
}

/** 可选整数 → 输入框字符串（编辑态预填；undefined = 留空）。 */
export function serializeOptionalInt(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** 输入期过滤：只保留 ASCII 数字（粘贴/输入法杂字符一并剥除）。 */
export function digitsOnly(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

const inputClassName =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13px] leading-[18px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30";

const chipClassName =
  "flex h-9 items-center gap-[8px] rounded-lg border px-3 text-[13px] leading-none outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed";

const chipSelectedClassName = "border-foreground bg-foreground text-background";
const chipUnselectedClassName =
  "cursor-pointer border-border bg-background text-foreground hover:border-foreground/30 hover:bg-accent";
const chipUnsupportedClassName =
  "cursor-not-allowed border-border bg-background text-foreground opacity-50";

/** chip 内的模态勾选方块：选中 = 前景色实底 + 对勾，未选中 = 空心。 */
function chipCheckbox(selected: boolean): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-[14px] items-center justify-center rounded-[3px] border",
        selected ? "border-current" : "border-muted-foreground/40",
      )}
    >
      {selected ? <Check className="size-[10px]" strokeWidth={3} /> : null}
    </span>
  );
}

/** 锁定选中 chip（文本模态）：恒开不可点，锁 icon 标注原因。 */
function lockedChip(label: string, lockedTitle: string): React.ReactElement {
  return (
    <button
      type="button"
      disabled
      aria-pressed="true"
      title={lockedTitle}
      className={cn(chipClassName, chipSelectedClassName)}
    >
      {chipCheckbox(true)}
      {label}
      <Lock className="size-3" strokeWidth={1.75} />
    </button>
  );
}

/** 数字字段（上下文窗口/最大输出）：文本框只收数字，错误显示在字段下方。 */
function numberField(input: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (digits: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-[6px]">
      <FieldLabel label={input.label} htmlFor={input.id} />
      <input
        id={input.id}
        type="text"
        inputMode="numeric"
        value={input.value}
        onChange={(event) => input.onChange(digitsOnly(event.target.value))}
        placeholder={input.placeholder}
        aria-invalid={input.error !== null}
        className={cn(
          inputClassName,
          input.error !== null && "border-destructive/60 focus:border-destructive/60",
        )}
      />
      {input.error === null ? null : (
        <p className="text-[11px] leading-[15px] text-destructive">{input.error}</p>
      )}
    </div>
  );
}

/**
 * 模型弹窗字段区（无 hooks 的纯展示组件，弹窗外壳持状态）：
 * 模型 ID / 上下文窗口 / 最大输出 Token 三个上标签输入框 + 输入/输出类型 chips。
 * 文本模态恒开（锁定）；图片可切换；视频/PDF 运行时不支持，按设计稿渲染但禁用弱化。
 */
function ProviderModelDialogFields({
  id,
  idError,
  contextWindow,
  contextWindowError,
  maxTokens,
  maxTokensError,
  vision,
  onIdChange,
  onContextWindowChange,
  onMaxTokensChange,
  onVisionToggle,
}: ProviderModelDialogFieldsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-[6px]">
        <FieldLabel label={copy.settings.modelDialogFieldId} htmlFor="provider-model-id" />
        <input
          id="provider-model-id"
          type="text"
          value={id}
          onChange={(event) => onIdChange(event.target.value)}
          placeholder={copy.settings.modelDialogFieldIdPlaceholder}
          autoFocus
          aria-invalid={idError !== null}
          className={cn(
            inputClassName,
            "font-mono text-[12.5px]",
            idError !== null && "border-destructive/60 focus:border-destructive/60",
          )}
        />
        {idError === null ? null : (
          <p className="text-[11px] leading-[15px] text-destructive">{idError}</p>
        )}
      </div>
      {numberField({
        id: "provider-model-context-window",
        label: copy.settings.modelDialogFieldContextWindow,
        placeholder: copy.settings.modelDialogFieldContextWindowPlaceholder,
        value: contextWindow,
        error: contextWindowError,
        onChange: onContextWindowChange,
      })}
      {numberField({
        id: "provider-model-max-tokens",
        label: copy.settings.modelDialogFieldMaxTokens,
        placeholder: copy.settings.modelDialogFieldMaxTokensPlaceholder,
        value: maxTokens,
        error: maxTokensError,
        onChange: onMaxTokensChange,
      })}
      <div className="flex flex-col gap-[6px]">
        <FieldLabel label={copy.settings.modelDialogFieldInputTypes} />
        <div className="flex flex-wrap gap-[8px]">
          {lockedChip(copy.settings.modelDialogInputText, copy.settings.modelDialogInputLocked)}
          <button
            type="button"
            aria-pressed={vision}
            onClick={onVisionToggle}
            className={cn(chipClassName, vision ? chipSelectedClassName : chipUnselectedClassName)}
          >
            {chipCheckbox(vision)}
            {copy.settings.modelDialogInputImage}
          </button>
          <button
            type="button"
            disabled
            title={copy.settings.modelDialogUnsupported}
            className={cn(chipClassName, chipUnsupportedClassName)}
          >
            {chipCheckbox(false)}
            {copy.settings.modelDialogInputVideo}
          </button>
          <button
            type="button"
            disabled
            title={copy.settings.modelDialogUnsupported}
            className={cn(chipClassName, chipUnsupportedClassName)}
          >
            {chipCheckbox(false)}
            {copy.settings.modelDialogInputPdf}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-[6px]">
        <FieldLabel label={copy.settings.modelDialogFieldOutputTypes} />
        <div className="flex flex-wrap gap-[8px]">
          {lockedChip(copy.settings.modelDialogInputText, copy.settings.modelDialogInputLocked)}
        </div>
      </div>
    </div>
  );
}

export { ProviderModelDialogFields };
export type { ProviderModelDialogFieldsProps };
