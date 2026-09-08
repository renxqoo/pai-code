/** 图片附件读取：File → 协议 ImagePayload 的 data/mimeType（base64 无前缀）。 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type PendingImage = { data: string; mimeType: string };

/** 非图片/超限/读取失败 → null（调用方提示），不抛。 */
export function readImageFile(file: File): Promise<PendingImage | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const header = comma > 0 ? result.slice(0, comma) : '';
      const match = /data:([^;]+);base64/.exec(header);
      resolve(match !== null && result.length > comma + 1 ? { data: result.slice(comma + 1), mimeType: file.type } : null);
    };
    reader.readAsDataURL(file);
  });
}

export function imagePayloadOf(image: PendingImage): { type: 'image'; data: string; mimeType: string } {
  return { type: 'image', data: image.data, mimeType: image.mimeType };
}
