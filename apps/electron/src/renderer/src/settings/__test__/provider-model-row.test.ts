import { describe, expect, test } from "bun:test";

import type { ProviderModel } from "@paiapp/contracts";

import { copy } from "@/strings";

import { ProviderModelRow } from "../provider-model-row";
import { clickByLabel, collectElementProps } from "./element-props";

const model: ProviderModel = { id: "glm-4.6", reasoning: false, vision: true };

describe("模型行回调接线", () => {
  test("思考/视觉按钮分别回传 reasoning 与 vision", () => {
    const toggles: string[] = [];
    const tree = ProviderModelRow({
      model,
      onToggle: (flag) => toggles.push(flag),
      onEdit: () => undefined,
      onRemove: () => undefined,
    });
    clickByLabel(tree, copy.settings.modelThinkingOff);
    clickByLabel(tree, copy.settings.modelVisionOn);
    expect(toggles).toEqual(["reasoning", "vision"]);
  });

  test("编辑按钮回传 onEdit", () => {
    let edits = 0;
    const tree = ProviderModelRow({
      model,
      onToggle: () => undefined,
      onEdit: () => {
        edits += 1;
      },
      onRemove: () => undefined,
    });
    clickByLabel(tree, copy.settings.providerModelEdit);
    expect(edits).toBe(1);
  });

  test("移除按钮回传 onRemove", () => {
    let removed = 0;
    const tree = ProviderModelRow({
      model,
      onToggle: () => undefined,
      onEdit: () => undefined,
      onRemove: () => {
        removed += 1;
      },
    });
    clickByLabel(tree, copy.settings.providerModelRemove);
    expect(removed).toBe(1);
  });

  test("能力按钮可访问名随声明状态翻转（aria-pressed 同步）", () => {
    const tree = ProviderModelRow({
      model: { ...model, reasoning: true },
      onToggle: () => undefined,
      onEdit: () => undefined,
      onRemove: () => undefined,
    });
    const props = collectElementProps(tree);
    expect(
      props.find((p) => p["aria-label"] === copy.settings.modelThinkingOn)?.["aria-pressed"],
    ).toBe(true);
    expect(
      props.find((p) => p["aria-label"] === copy.settings.modelVisionOn)?.["aria-pressed"],
    ).toBe(true);
  });
});

describe("模型行逐模型测试（编辑态）", () => {
  test("无 onTest 不渲染测试按钮；有 onTest 渲染且点击回传", () => {
    const without = collectElementProps(
      ProviderModelRow({
        model,
        onToggle: () => undefined,
        onEdit: () => undefined,
        onRemove: () => undefined,
      }),
    );
    expect(without.some((p) => p["aria-label"] === copy.settings.providerModelTest)).toBe(false);

    let fired = 0;
    const tree = ProviderModelRow({
      model,
      onToggle: () => undefined,
      onEdit: () => undefined,
      onRemove: () => undefined,
      onTest: () => {
        fired += 1;
      },
    });
    clickByLabel(tree, copy.settings.providerModelTest);
    expect(fired).toBe(1);
  });

  test("测试态展示：testing 中按钮禁用换 spinner；done 后行内渲染结果文案（成败两态）", () => {
    const base = {
      model,
      onToggle: () => undefined,
      onEdit: () => undefined,
      onRemove: () => undefined,
      onTest: () => undefined,
    };
    const testing = collectElementProps(
      ProviderModelRow({ ...base, testState: { phase: "testing" } }),
    );
    const testButton = testing.find((p) => p["aria-label"] === copy.settings.providerModelTest);
    expect(testButton?.["disabled"]).toBe(true);

    const ok = collectElementProps(
      ProviderModelRow({
        ...base,
        testState: { phase: "done", result: { ok: true, latencyMs: 321 } },
      }),
    );
    expect(ok.some((p) => p["children"] === copy.settings.testOk(321))).toBe(true);
    const failed = collectElementProps(
      ProviderModelRow({
        ...base,
        testState: { phase: "done", result: { ok: false, reason: "http_404" } },
      }),
    );
    expect(failed.some((p) => p["children"] === copy.settings.testFailed("http_404"))).toBe(true);
  });
});
