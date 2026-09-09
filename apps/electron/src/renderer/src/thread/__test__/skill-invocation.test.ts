import { describe, expect, test } from "bun:test";

import { parseSkillInvocation, toSkillInvocationInput } from "../skill-invocation";

/** pai hub 指针行构造器：`[name](url:location)`，可选 `\n\n` + 附加指令。 */
function pointer(name: string, location: string, instructions?: string): string {
  const line = `[${name}](url:${location})`;
  return instructions === undefined ? line : `${line}\n\n${instructions}`;
}

describe("parseSkillInvocation", () => {
  test("标准指针行：name/location/空指令", () => {
    const parsed = parseSkillInvocation(
      pointer("tavily-cli", "/Users/w/.agents/skills/tavily/SKILL.md"),
    );
    expect(parsed).toEqual({
      name: "tavily-cli",
      location: "/Users/w/.agents/skills/tavily/SKILL.md",
      instructions: "",
    });
  });

  test("带附加指令：拖尾归属 instructions（多行、连字符技能名、含空格路径）", () => {
    const parsed = parseSkillInvocation(
      pointer(
        "repo-migration-e2e-v2",
        "/Users/w/.agents/skills/repo-migration-e2e-v2/SKILL.md",
        "迁移 A 仓库\n分两阶段",
      ),
    );
    expect(parsed?.name).toBe("repo-migration-e2e-v2");
    expect(parsed?.location).toBe("/Users/w/.agents/skills/repo-migration-e2e-v2/SKILL.md");
    expect(parsed?.instructions).toBe("迁移 A 仓库\n分两阶段");
  });

  test("空白附加指令拖尾归一为空串", () => {
    const parsed = parseSkillInvocation(`${pointer("a", "/s/a/SKILL.md")}\n\n   `);
    expect(parsed?.instructions).toBe("");
  });

  test("非技能文本 / 普通 markdown 链接（非 url: 目标）/ 未经改写的裸命令返回 null", () => {
    expect(parseSkillInvocation("普通消息")).toBeNull();
    expect(parseSkillInvocation("[点击](https://example.com)")).toBeNull();
    expect(parseSkillInvocation("/skill:writer 直接输入形式（未经改写）")).toBeNull();
  });

  test("畸形形状降级：缺技能名 / 缺路径 / 缺闭合括号", () => {
    expect(parseSkillInvocation("[](url:/s/a/SKILL.md)")).toBeNull();
    expect(parseSkillInvocation("[a](url:)")).toBeNull();
    expect(parseSkillInvocation("[a](url:/s/a/SKILL.md")).toBeNull();
  });
});

describe("toSkillInvocationInput", () => {
  test("无附加指令回填裸命令", () => {
    const parsed = parseSkillInvocation(pointer("writer", "/s/writer/SKILL.md"));
    expect(parsed !== null && toSkillInvocationInput(parsed)).toBe("/skill:writer");
  });

  test("有附加指令回填命令 + 单空格 + 指令（hub 会再次改写，重发等价）", () => {
    const parsed = parseSkillInvocation(pointer("writer", "/s/writer/SKILL.md", "写一段 介绍"));
    expect(parsed !== null && toSkillInvocationInput(parsed)).toBe("/skill:writer 写一段 介绍");
  });
});
