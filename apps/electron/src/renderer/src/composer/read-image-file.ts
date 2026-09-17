/**
 * 图片附件读取管线：原图 → 解码 → 长边等比缩放 → JPEG 重编码 → 协议 ImagePayload（base64 无前缀）。
 *
 * 用户裁决（2026-09-08，方案 A）：入口原图 ≤20MB、长边 ≤2000px、JPEG q0.85、压后 >4MB 拒绝。
 * 依据：provider 单图限制 5-20MB（智谱 GLM 5MB 最严）且按 base64 编码后计；
 * 长边超过 1568-2048px 的部分会被服务端缩掉或按 tile 计费——压缩不损失模型可见信息，
 * 且会话上下文每轮全量重发、图片随消息落盘，原图会三重放大成本（token/流量/磁盘）。
 * 非 png/jpeg/webp/gif 格式（如 HEIC）Canvas 无法解码 → 拒绝（返回 null 由调用方提示）。
 */

import type { ImagePayload } from '@paiapp/contracts';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 0.85;
const MAX_ENCODED_BYTES = 4 * 1024 * 1024;

/** 本地暂存形态（协议载荷的 mimeType 同义名；发送时经 imagePayloadOf 转协议 mediaType）。 */
export type PendingImage = { data: string; mimeType: string };

/** 等比缩放目标尺寸：长边超限按比例缩小，不放大；最小 1px 防退化。 */
export function scaledImageSize(width: number, height: number, maxEdge = MAX_EDGE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = Math.min(1, maxEdge / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 解码/压缩失败、超入口上限、压后超限 → null（调用方提示），不抛。 */
export function readImageFile(file: File): Promise<PendingImage | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_SOURCE_BYTES) return Promise.resolve(null);
  return createImageBitmap(file)
    .then((bitmap) => {
      const size = scaledImageSize(bitmap.width, bitmap.height);
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext('2d');
      if (context === null) {
        bitmap.close();
        return null;
      }
      // JPEG 无 alpha：透明区域合成白底，避免透明 PNG 转出黑底
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      bitmap.close();
      return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    })
    .then((blob) => (blob === null || blob.size > MAX_ENCODED_BYTES ? null : blobToBase64(blob)))
    .then((image) => image ?? null);
}

function blobToBase64(blob: Blob): Promise<PendingImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const header = comma > 0 ? result.slice(0, comma) : '';
      const match = /data:([^;]+);base64/.exec(header);
      resolve(match !== null && result.length > comma + 1 ? { data: result.slice(comma + 1), mimeType: 'image/jpeg' } : null);
    };
    reader.readAsDataURL(blob);
  });
}

/** 暂存形态 → 协议 ImagePayload（mimeType 本地名 → mediaType 协议名的唯一转换点）。 */
export function imagePayloadOf(image: PendingImage): ImagePayload {
  return { type: 'image', data: image.data, mediaType: image.mimeType };
}

/** 预览直读 data URL（CSP img-src 允许 data:；无需对象 URL 生命周期管理）。 */
export function imageDataUrl(image: PendingImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}
