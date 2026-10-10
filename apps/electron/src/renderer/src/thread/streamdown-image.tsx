import type { ComponentProps, ReactNode } from 'react';
import type { ExtraProps } from 'streamdown';

import { openViewer } from '@/image-viewer/image-viewer-store';

type StreamdownImageProps = ComponentProps<'img'> & ExtraProps;

/**
 * 正文图片来源判定（纯函数）：http(s) 外链、data:image/ 内联与 blob: 会话图放行
 * （与用户消息图片的 data: URL 形态一致），其余协议不渲染为图片（降级 alt 文本）。
 */
export function safeImageSrc(src: string | undefined): string | null {
  if (src === undefined) return null;
  const trimmed = src.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (/^blob:/i.test(trimmed)) return trimmed;
  return null;
}

/**
 * streamdown 图片覆写：外链懒加载且不外泄 referrer；不可信来源降级为 alt 文本，
 * 不产生任何网络请求。图片最大宽受正文列约束；点击开灯箱预览（单图，
 * src 已过白名单，灯箱不重复判定）。
 */
function StreamdownImage({ node: _node, src, alt, ...rest }: StreamdownImageProps): ReactNode {
  const url = safeImageSrc(src);
  if (url === null) {
    const label = typeof alt === 'string' && alt.length > 0 ? alt : '';
    return label.length > 0 ? <span className="break-all text-muted-foreground/70">[image: {label}]</span> : null;
  }
  const label = typeof alt === 'string' ? alt : '';
  return (
    <button
      type="button"
      onClick={() => openViewer([{ src: url, name: label }], 0)}
      className="cursor-zoom-in"
    >
      <img
        {...rest}
        src={url}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        draggable={false}
        className="max-w-full rounded-[10px] border border-border"
      />
    </button>
  );
}

export { StreamdownImage };
