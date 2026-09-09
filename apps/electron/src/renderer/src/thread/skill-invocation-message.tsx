import { Sparkles } from "lucide-react";

import { ChatBubble } from "@paiapp/ui";

import type { SkillInvocation } from "./skill-invocation";

type SkillInvocationMessageProps = {
  invocation: SkillInvocation;
};

/**
 * 技能调用消息框：会话真相是 hub 预改写的指针行（[name](url:path)，不含正文），
 * 完整 skill+path 只服务底层协议（发给模型），展示层不出现路径；
 * 单消息框内联高亮技能名（星光图标 + 着色），用户附加的指令紧随其后同框呈现。
 */
function SkillInvocationMessage({ invocation }: SkillInvocationMessageProps) {
  return (
    <ChatBubble>
      <span className="font-medium text-dot-active">
        <Sparkles
          className="mr-[4px] inline-block size-[13px] align-[-2px]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {invocation.name}
      </span>
      {invocation.instructions.length > 0 ? ` ${invocation.instructions}` : null}
    </ChatBubble>
  );
}

export { SkillInvocationMessage };
export type { SkillInvocationMessageProps };
