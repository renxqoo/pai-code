/** 仅放行形态健全的 http/https 绝对地址（T56 §2 不变量 1）：
 * 协议、主机（域名/IPv4/IPv6/可带端口）、可选路径齐全才可信——`https:///etc`、
 * `https://:8080`、`https://?q`、`https://\evil` 这类「`//` 后非主机」形态一律拒绝，
 * 空主机永不触发打开；控制字符先行拒绝；协议大小写不敏感。 */
const hostShape =
  /^https?:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;
const ipv6Shape = /^https?:\/\/\[[0-9a-f:.]+\](?::\d{1,5})?(?:[/?#][^\s]*)?$/i;

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isSafeExternalUrl(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0 || hasControlChars(trimmed)) return false;
  return hostShape.test(trimmed) || ipv6Shape.test(trimmed);
}
