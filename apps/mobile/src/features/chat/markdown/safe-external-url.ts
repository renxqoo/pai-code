const safeExternalUrl = /^https?:\/\/[^\s.]+.*$/i;

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isSafeExternalUrl(href: string): boolean {
  const trimmed = href.trim();
  return !hasControlChars(trimmed) && safeExternalUrl.test(trimmed);
}
