import * as React from "react";

import type { ProviderModel } from "@paiapp/contracts";

import { copy } from "@/strings";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  ProviderModelDialogFields,
  parsePositiveIntOrEmpty,
  serializeOptionalInt,
} from "./provider-model-dialog-fields";

type ProviderModelDialogProps = {
  open: boolean;
  mode: "add" | "edit";
  /** 编辑态预填被编辑的模型；新建态为 null。 */
  initial: ProviderModel | null;
  /** 当前渠道已有模型 id（不含正在编辑的这条）——查重。 */
  existingIds: readonly string[];
  /** 确认：编辑后的完整模型 + 被编辑对象的原 id（新建为 null）。 */
  onConfirm: (model: ProviderModel, previousId: string | null) => void;
  onClose: () => void;
};

/**
 * 表单态 → ProviderModel：id 取 trim 后值；留空数字不写键（= 不设置，回落运行时默认）；
 * reasoning 原样保留（行上开关维护，不在弹窗内）；调用前须先过 canSave 校验。
 */
export function buildProviderModel(input: {
  initial: ProviderModel | null;
  id: string;
  contextWindow: string;
  maxTokens: string;
  vision: boolean;
}): ProviderModel {
  const contextWindow = parsePositiveIntOrEmpty(input.contextWindow);
  const maxTokens = parsePositiveIntOrEmpty(input.maxTokens);
  return {
    id: input.id.trim(),
    reasoning: input.initial?.reasoning ?? false,
    vision: input.vision,
    ...(contextWindow.ok && contextWindow.value !== undefined
      ? { contextWindow: contextWindow.value }
      : {}),
    ...(maxTokens.ok && maxTokens.value !== undefined ? { maxTokens: maxTokens.value } : {}),
  };
}

/** previousId 装配：编辑态回传被编辑对象的原 id（改 id 时据此原位替换）；新建为 null。 */
export function previousIdFor(mode: "add" | "edit", initial: ProviderModel | null): string | null {
  return mode === "edit" ? (initial?.id ?? null) : null;
}

/**
 * 添加/编辑模型弹窗：模型 ID（必填查重）+ 上下文窗口/最大输出（正整数，留空回落默认）
 * + 输入/输出类型 chips（文本恒开；图片 ↔ vision；reasoning 不在此维护，原样保留）。
 * 关态零渲染（open=false 早退）；调用方在打开期挂载、关闭即卸载（PickerDialog 同款），
 * useState 初值即打开时刻的 initial——每次打开都是干净表单。
 * Esc/遮罩/✕/取消 → onClose（不确认）；保存校验通过才回调 onConfirm，关闭由调用方收口。
 */
function ProviderModelDialog({
  open,
  mode,
  initial,
  existingIds,
  onConfirm,
  onClose,
}: ProviderModelDialogProps): React.JSX.Element | null {
  const [id, setId] = React.useState(initial?.id ?? "");
  const [contextWindow, setContextWindow] = React.useState(
    serializeOptionalInt(initial?.contextWindow),
  );
  const [maxTokens, setMaxTokens] = React.useState(serializeOptionalInt(initial?.maxTokens));
  const [vision, setVision] = React.useState(initial?.vision ?? false);

  if (!open) return null;

  const idTrimmed = id.trim();
  const idError =
    idTrimmed.length === 0
      ? copy.settings.modelDialogIdRequired
      : existingIds.includes(idTrimmed)
        ? copy.settings.modelDialogIdDuplicate
        : null;
  const contextWindowParsed = parsePositiveIntOrEmpty(contextWindow);
  const maxTokensParsed = parsePositiveIntOrEmpty(maxTokens);
  const canSave = idError === null && contextWindowParsed.ok && maxTokensParsed.ok;

  /** 保存：校验通过才上报，previousId = 编辑对象原 id（新建为 null）；关闭由调用方收口。 */
  const confirm = (): void => {
    if (!canSave) return;
    const model = buildProviderModel({ initial, id: idTrimmed, contextWindow, maxTokens, vision });
    onConfirm(model, previousIdFor(mode, initial));
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "add"
              ? copy.settings.modelDialogAddTitle
              : copy.settings.modelDialogEditTitle}
          </DialogTitle>
        </DialogHeader>
        <ProviderModelDialogFields
          id={id}
          idError={idError}
          contextWindow={contextWindow}
          contextWindowError={
            contextWindowParsed.ok ? null : copy.settings.modelDialogNumberInvalid
          }
          maxTokens={maxTokens}
          maxTokensError={maxTokensParsed.ok ? null : copy.settings.modelDialogNumberInvalid}
          vision={vision}
          onIdChange={setId}
          onContextWindowChange={setContextWindow}
          onMaxTokensChange={setMaxTokens}
          onVisionToggle={() => setVision((current) => !current)}
        />
        <div className="flex items-center justify-end gap-[8px]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 cursor-pointer rounded-lg border border-border bg-background px-4 text-[13px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.settings.modelDialogCancel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canSave}
            className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-[13px] leading-none font-medium text-background outline-none select-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
          >
            {copy.settings.modelDialogSave}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ProviderModelDialog };
export type { ProviderModelDialogProps };
