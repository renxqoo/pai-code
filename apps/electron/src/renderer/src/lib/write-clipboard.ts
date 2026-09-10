/** 剪贴板写入（可注入 writer 供测试）：失败不抛异常，返回布尔由调用方提示。 */

export type ClipboardWriter = (text: string) => Promise<void>;

const defaultWrite: ClipboardWriter = (text) => {
  const clipboard = navigator.clipboard;
  if (clipboard === undefined) return Promise.reject(new Error('clipboard_unavailable'));
  return clipboard.writeText(text);
};

export async function writeClipboard(text: string, write: ClipboardWriter = defaultWrite): Promise<boolean> {
  try {
    await write(text);
    return true;
  } catch {
    return false;
  }
}
