/** x-harness COMMAND_LEXER 的 /compact 词形镜像（单源：packages/commands/src/
 *  lexer.ts——trim 后行首单斜杠 + 小写 [a-z][a-z0-9_-]* 词形 + $|\s 前瞻；/COMPACT
 *  与 /compactx、// 前缀都不命中）。命中后 app 直发 compact 命令（D7——不依赖
 *  hub prompt 拦截面），行余部 = customInstructions。 */
export function compactInvocationOf(message: string): { customInstructions: string } | undefined {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return undefined;
  const rest = trimmed.slice(1);
  const match = /^compact(?=$|\s)/.exec(rest);
  if (match === null) return undefined;
  return { customInstructions: rest.slice(match[0].length).trim() };
}

/** 词形命中判定（超时分档/受理重试豁免的布尔面）。 */
export function interceptsCompact(message: string): boolean {
  return compactInvocationOf(message) !== undefined;
}
