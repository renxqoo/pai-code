/** 链接出口安全判定（纯函数）：仅放行 http(s)，其余协议（javascript:/file:/data: 等）降级纯文本。 */
export function safeExternalUrl(href: string | undefined): string | null {
  if (href === undefined) return null;
  const trimmed = href.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
