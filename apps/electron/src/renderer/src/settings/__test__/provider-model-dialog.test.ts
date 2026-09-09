import { describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProviderModel } from "@paiapp/contracts";

import { copy } from "@/strings";

import { ProviderModelDialog, buildProviderModel, previousIdFor } from "../provider-model-dialog";
import {
  ProviderModelDialogFields,
  digitsOnly,
  parsePositiveIntOrEmpty,
  serializeOptionalInt,
} from "../provider-model-dialog-fields";
import { clickByText, collectElementProps, findElementProps } from "./element-props";

/**
 * Base UI Dialog 走 Portal 挂载，renderToStaticMarkup 下弹窗本体零输出（SSR 实测）。
 * 因此：字段区拆为无 hooks 的 ProviderModelDialogFields 直接断言（结构/接线/数字契约）；
 * 弹窗外壳只做 open 两态冒烟（关态零渲染；开态不抛错且 SSR 无部分输出），
 * 开态视觉与 Esc/遮罩/保存交互依赖真机走查。
 */
const noop = (): void => undefined;

function renderShell(input: {
  open: boolean;
  mode: "add" | "edit";
  initial: ProviderModel | null;
}): string {
  return renderToStaticMarkup(
    React.createElement(ProviderModelDialog, {
      open: input.open,
      mode: input.mode,
      initial: input.initial,
      existingIds: [],
      onConfirm: noop,
      onClose: noop,
    }),
  );
}

type FieldsProps = Parameters<typeof ProviderModelDialogFields>[0];

function fieldsProps(overrides: Partial<FieldsProps> = {}): FieldsProps {
  return {
    id: "",
    idError: null,
    contextWindow: "",
    contextWindowError: null,
    maxTokens: "",
    maxTokensError: null,
    vision: false,
    onIdChange: noop,
    onContextWindowChange: noop,
    onMaxTokensChange: noop,
    onVisionToggle: noop,
    ...overrides,
  };
}

describe("模型弹窗外壳（SSR 冒烟）", () => {
  test("关态零渲染", () => {
    expect(renderShell({ open: false, mode: "add", initial: null })).toBe("");
  });

  test("开态：Base UI Portal 在 SSR 不产出内容，渲染路径不抛错", () => {
    expect(renderShell({ open: true, mode: "add", initial: null })).toBe("");
    expect(
      renderShell({
        open: true,
        mode: "edit",
        initial: { id: "glm-4.6", reasoning: true, vision: true, contextWindow: 1000000 },
      }),
    ).toBe("");
  });
});

describe("模型弹窗字段区", () => {
  test("三个输入字段：label 关联、占位符、预填值；id 字段等宽并 autoFocus", () => {
    const tree = ProviderModelDialogFields(
      fieldsProps({ id: " glm-4.6 ", contextWindow: "1000000" }),
    );
    const props = collectElementProps(tree);
    for (const id of [
      "provider-model-id",
      "provider-model-context-window",
      "provider-model-max-tokens",
    ]) {
      expect(props.some((p) => p["id"] === id)).toBe(true);
      expect(props.some((p) => p["htmlFor"] === id)).toBe(true);
    }
    const idInput = findElementProps(tree, (p) => p["id"] === "provider-model-id");
    expect(idInput["placeholder"]).toBe(copy.settings.modelDialogFieldIdPlaceholder);
    expect(idInput["value"]).toBe(" glm-4.6 ");
    expect(idInput["autoFocus"]).toBe(true);
    expect(String(idInput["className"])).toContain("font-mono");
    const contextInput = findElementProps(tree, (p) => p["id"] === "provider-model-context-window");
    expect(contextInput["placeholder"]).toBe(
      copy.settings.modelDialogFieldContextWindowPlaceholder,
    );
    expect(contextInput["value"]).toBe("1000000");
    const maxTokensInput = findElementProps(tree, (p) => p["id"] === "provider-model-max-tokens");
    expect(maxTokensInput["placeholder"]).toBe(copy.settings.modelDialogFieldMaxTokensPlaceholder);
  });

  test("错误文案渲染在字段下方（destructive 小字），无错误时不渲染", () => {
    const clean = collectElementProps(ProviderModelDialogFields(fieldsProps()));
    expect(clean.some((p) => p["children"] === copy.settings.modelDialogIdRequired)).toBe(false);

    const withErrors = collectElementProps(
      ProviderModelDialogFields(
        fieldsProps({
          idError: copy.settings.modelDialogIdDuplicate,
          maxTokensError: copy.settings.modelDialogNumberInvalid,
        }),
      ),
    );
    expect(withErrors.some((p) => p["children"] === copy.settings.modelDialogIdDuplicate)).toBe(
      true,
    );
    expect(withErrors.some((p) => p["children"] === copy.settings.modelDialogNumberInvalid)).toBe(
      true,
    );
    const idInput = withErrors.find((p) => p["id"] === "provider-model-id");
    expect(idInput?.["aria-invalid"]).toBe(true);
    const contextInput = withErrors.find((p) => p["id"] === "provider-model-context-window");
    expect(contextInput?.["aria-invalid"]).toBe(false);
  });

  test("锁定 chip：文本（输入/输出两处）恒选不可点 + 锁标注；输出类型行只有文本", () => {
    const props = collectElementProps(ProviderModelDialogFields(fieldsProps()));
    const locked = props.filter((p) => p["title"] === copy.settings.modelDialogInputLocked);
    expect(locked.length).toBe(2);
    for (const chip of locked) {
      expect(chip["disabled"]).toBe(true);
      expect(chip["aria-pressed"]).toBe("true");
    }
    expect(
      props.filter(
        (p) =>
          Array.isArray(p["children"]) &&
          (p["children"] as unknown[]).includes(copy.settings.modelDialogInputText),
      ).length,
    ).toBe(2);
  });

  test("视频/PDF chip 禁用弱化并标注不支持", () => {
    const props = collectElementProps(ProviderModelDialogFields(fieldsProps()));
    const unsupported = props.filter((p) => p["title"] === copy.settings.modelDialogUnsupported);
    expect(unsupported.length).toBe(2);
    for (const chip of unsupported) {
      expect(chip["disabled"]).toBe(true);
      expect(chip["onClick"]).toBeUndefined();
    }
  });

  test("图片 chip 可切换：aria-pressed 随 vision，点击回传 onVisionToggle", () => {
    const off = collectElementProps(ProviderModelDialogFields(fieldsProps({ vision: false })));
    const offChip = off.find(
      (p) =>
        Array.isArray(p["children"]) &&
        (p["children"] as unknown[]).includes(copy.settings.modelDialogInputImage),
    );
    expect(offChip?.["aria-pressed"]).toBe(false);

    let toggles = 0;
    const tree = ProviderModelDialogFields(
      fieldsProps({
        vision: true,
        onVisionToggle: () => {
          toggles += 1;
        },
      }),
    );
    const onChip = collectElementProps(tree).find(
      (p) =>
        Array.isArray(p["children"]) &&
        (p["children"] as unknown[]).includes(copy.settings.modelDialogInputImage),
    );
    expect(onChip?.["aria-pressed"]).toBe(true);
    clickByText(tree, copy.settings.modelDialogInputImage);
    expect(toggles).toBe(1);
  });

  test("数字输入只放行数字：onChange 回传过滤结果", () => {
    const received: string[] = [];
    const tree = ProviderModelDialogFields(
      fieldsProps({ onContextWindowChange: (digits) => received.push(digits) }),
    );
    const input = findElementProps(tree, (p) => p["id"] === "provider-model-context-window");
    (input["onChange"] as (event: unknown) => void)({ target: { value: "12a8九9" } });
    expect(received).toEqual(["1289"]);
  });
});

describe("数字输入契约（留空回落默认 / 正整数）", () => {
  test("parsePositiveIntOrEmpty：空 = ok(undefined)；正整数 = ok(值)；其余非法", () => {
    expect(parsePositiveIntOrEmpty("")).toEqual({ ok: true, value: undefined });
    expect(parsePositiveIntOrEmpty("128000")).toEqual({ ok: true, value: 128000 });
    expect(parsePositiveIntOrEmpty("0")).toEqual({ ok: false });
    expect(parsePositiveIntOrEmpty("-1")).toEqual({ ok: false });
    expect(parsePositiveIntOrEmpty("1.5")).toEqual({ ok: false });
    expect(parsePositiveIntOrEmpty("abc")).toEqual({ ok: false });
  });

  test("超安全整数域拒绝（静默丢精度不如拒绝）；上界本身合法（对抗审查 P2-1）", () => {
    expect(parsePositiveIntOrEmpty("9007199254740993")).toEqual({ ok: false });
    expect(parsePositiveIntOrEmpty(String(Number.MAX_SAFE_INTEGER))).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
  });

  test("digitsOnly 剥除非数字；serializeOptionalInt 往返数字与留空", () => {
    expect(digitsOnly(" 1a2b3 ")).toBe("123");
    expect(digitsOnly("")).toBe("");
    expect(serializeOptionalInt(undefined)).toBe("");
    expect(serializeOptionalInt(1000000)).toBe("1000000");
  });
});

describe("保存装配（buildProviderModel）", () => {
  test("新建：id 取 trim 值，reasoning 缺省 false，留空数字不写键", () => {
    expect(
      buildProviderModel({
        initial: null,
        id: "  glm-5  ",
        contextWindow: "",
        maxTokens: "",
        vision: true,
      }),
    ).toEqual({
      id: "glm-5",
      reasoning: false,
      vision: true,
    });
  });

  test("编辑：reasoning 原样保留，非空数字写入对应键", () => {
    expect(
      buildProviderModel({
        initial: { id: "glm-4.6", reasoning: true, vision: false },
        id: "glm-4.6",
        contextWindow: "1000000",
        maxTokens: "128000",
        vision: true,
      }),
    ).toEqual({
      id: "glm-4.6",
      reasoning: true,
      vision: true,
      contextWindow: 1000000,
      maxTokens: 128000,
    });
  });
});

describe("previousId 装配（previousIdFor）", () => {
  test("编辑态回传原 id（改 id 时据此原位替换）；新建与编辑缺 initial 为 null", () => {
    expect(previousIdFor("edit", { id: "glm-4.6", reasoning: false, vision: false })).toBe(
      "glm-4.6",
    );
    expect(previousIdFor("add", { id: "x", reasoning: false, vision: false })).toBe(null);
    expect(previousIdFor("add", null)).toBe(null);
    expect(previousIdFor("edit", null)).toBe(null);
  });
});
