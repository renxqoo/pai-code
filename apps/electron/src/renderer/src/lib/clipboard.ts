/**
 * 剪贴板写入：渲染层唯一的系统剪贴板触点。
 * 接入 Client（T8）后整体替换为 Port 注入，调用方只认这个返回形态。
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (text.length === 0) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
