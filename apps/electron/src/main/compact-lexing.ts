/** hub interceptCompact 词形镜像（单源：host-hub compact-invocation.ts ←
 *  core parseCommandInput——trim 后行首单斜杠、小写 kebab 词形；/COMPACT 与
 *  /compactx 都不命中）。用于超时分档与受理重试豁免，不改消息语义。 */
export function interceptsCompact(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (!/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/.test(trimmed)) return false;
  return /^\/compact(?:\s|$)/.test(trimmed);
}
