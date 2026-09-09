/**
 * pai hub 技能调用指针行（host 侧把 `/skill:<name> [附加指令]` 预改写后的用户消息文本）：
 * `[name](url:<SKILL.md 路径>)`，可选拖尾 `\n\n<附加指令>`。
 * 会话真相不再内联 SKILL.md 正文（模型用 read/bash 自行加载），描述也不在消息里
 * （技能清单携带）；本模块只服务展示层紧凑化与编辑回填重构，形状不符一律返回 null
 * （调用方按普通文本原样降级）。
 */

export type SkillInvocation = {
  /** 技能名（slug，如 repo-migration-e2e-v2） */
  readonly name: string;
  /** SKILL.md 文件路径（指针行的 url: 目标） */
  readonly location: string;
  /** 技能名后附加的用户指令；无则空串 */
  readonly instructions: string;
};

export function parseSkillInvocation(text: string): SkillInvocation | null {
  if (!text.startsWith("[")) return null;
  const boundary = text.indexOf("\n\n");
  const pointer = boundary === -1 ? text : text.slice(0, boundary);
  const linkStart = pointer.indexOf("](url:");
  if (linkStart === -1 || !pointer.endsWith(")")) return null;
  const name = pointer.slice(1, linkStart);
  const location = pointer.slice(linkStart + 6, -1);
  if (name.length === 0 || location.length === 0) return null;
  return {
    name,
    location,
    instructions: boundary === -1 ? "" : text.slice(boundary + 2).trim(),
  };
}

/** 编辑/重试回填：指针行重构为等价输入形式（hub 收到后会再次改写，语义不变）。 */
export function toSkillInvocationInput(invocation: SkillInvocation): string {
  const suffix = invocation.instructions.length > 0 ? ` ${invocation.instructions}` : "";
  return `/skill:${invocation.name}${suffix}`;
}
