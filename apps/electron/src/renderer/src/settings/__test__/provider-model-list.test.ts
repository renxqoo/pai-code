import { describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProviderModel } from "@paiapp/contracts";

import { copy } from "@/strings";

import { ProviderModelList, upsertModel } from "../provider-model-list";

/**
 * 渲染冒烟（组件持弹窗会话 state，走 SSR 而非直呼）：
 * 新 props（无 draft）下添加按钮、模型行渲染、弹窗关态零渲染、确认落表纯函数。
 * 「添加 → 弹窗录入 → onConfirm」的弹窗开合交互链路依赖真机走查（SSR 无法触发回调）。
 */
const glm: ProviderModel = { id: "glm-4.6", reasoning: true, vision: false };

function renderList(models: readonly ProviderModel[]): string {
  return renderToStaticMarkup(
    React.createElement(ProviderModelList, { models, onModelsChange: () => undefined }),
  );
}

describe("模型清单渲染冒烟", () => {
  test("空清单：空态文案 + 添加按钮，弹窗关态零渲染", () => {
    const html = renderList([]);
    expect(html).toContain(copy.settings.providerModelAdd);
    expect(html).toContain(copy.settings.providerModelsEmpty);
    expect(html).not.toContain(copy.settings.modelDialogAddTitle);
    expect(html).not.toContain(copy.settings.modelDialogFieldId);
  });

  test("有模型：按行渲染 id 与编辑/移除入口，无空态文案", () => {
    const html = renderList([glm, { id: "glm-5", reasoning: false, vision: true }]);
    expect(html).toContain("glm-4.6");
    expect(html).toContain("glm-5");
    expect(html).toContain(copy.settings.providerModelEdit);
    expect(html).toContain(copy.settings.providerModelRemove);
    expect(html).not.toContain(copy.settings.providerModelsEmpty);
  });

  test("行内渲染能力开关可访问名（思考/视觉）", () => {
    const html = renderList([glm]);
    expect(html).toContain(copy.settings.modelThinkingOn);
    expect(html).toContain(copy.settings.modelVisionOff);
  });
});

describe("弹窗确认落表（upsertModel）", () => {
  test("新建（previousId = null）追加到末尾", () => {
    const next: ProviderModel = { id: "glm-5", reasoning: false, vision: true };
    expect(upsertModel([glm], next, null)).toEqual([glm, next]);
    expect(upsertModel([], next, null)).toEqual([next]);
  });

  test("编辑按原 id 原位替换（id 可被改），其余条目不动", () => {
    const renamed: ProviderModel = { id: "glm-4.7", reasoning: true, vision: false };
    expect(
      upsertModel([glm, { id: "kimi", reasoning: false, vision: false }], renamed, "glm-4.6"),
    ).toEqual([renamed, { id: "kimi", reasoning: false, vision: false }]);
  });

  test("原 id 不在清单时原样返回（无谓改），不追加", () => {
    const next: ProviderModel = { id: "glm-5", reasoning: false, vision: false };
    expect(upsertModel([glm], next, "ghost")).toEqual([glm]);
  });
});
