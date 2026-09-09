import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { UserMessageRow } from "../user-message-row";
import type { SessionMessage } from "../thread-model";

/** pai hub 预改写后的技能指针行。 */
const SKILL_TEXT = "[writer](url:/Users/x/skills/writer/SKILL.md)";

/** 气泡本体 class 片段：一次渲染应恰好出现一个用户消息框。 */
const BUBBLE_TOKEN = "rounded-[15px]";

function renderRow(text: string): string {
  const message: SessionMessage = { id: "m1", role: "user", text, images: [] };
  return renderToStaticMarkup(
    <UserMessageRow message={message} onEdit={() => undefined} />,
  );
}

describe("UserMessageRow 技能调用转义", () => {
  test("指针行单框转义：高亮技能名 + 附加指令同气泡，路径不进展示层", () => {
    const html = renderRow(`${SKILL_TEXT}\n\n写一段介绍`);
    expect(html).toContain("writer");
    expect(html).toContain("写一段介绍");
    expect(html).not.toContain("/Users/x/skills/writer/SKILL.md");
    expect(html.split(BUBBLE_TOKEN)).toHaveLength(2);
  });

  test("无附加指令只显高亮技能名，无展开开关（无 aria-expanded 属性）", () => {
    const html = renderRow(SKILL_TEXT);
    expect(html).toContain("writer");
    expect(html).not.toContain('aria-expanded="');
    expect(html.split(BUBBLE_TOKEN)).toHaveLength(2);
  });

  test("非技能普通消息维持原气泡渲染", () => {
    const html = renderRow("普通用户消息");
    expect(html).toContain("普通用户消息");
    expect(html).toContain(BUBBLE_TOKEN);
  });
});
