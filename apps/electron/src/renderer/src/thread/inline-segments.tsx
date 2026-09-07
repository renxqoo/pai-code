import { Fragment, type ReactNode } from 'react';

import { InlineCode } from '@paiapp/ui';

import type { InlineSegment } from './parse-markdown';

/** 链接出口统一走系统浏览器：Electron 经桥打开，浏览器直开时降级新标签 */
function openExternalLink(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault();
  if (window.pai) {
    void window.pai.window.openExternal(href);
    return;
  }
  window.open(href, '_blank', 'noopener');
}

type InlineSegmentsProps = {
  id: string
  segments: readonly InlineSegment[]
}

/** 行内标记渲染：代码胶囊 / 粗体 / 斜体 / http(s) 链接，其余纯文本。 */
function InlineSegments({ id, segments }: InlineSegmentsProps): ReactNode {
  return (
    <>
      {segments.map((segment, index) => {
        const key = `${id}-${index}`;
        switch (segment.kind) {
          case 'code':
            return <InlineCode key={key}>{segment.value}</InlineCode>;
          case 'strong':
            return (
              <strong key={key} className="font-semibold">
                {segment.value}
              </strong>
            );
          case 'emphasis':
            return <em key={key}>{segment.value}</em>;
          case 'link':
            return (
              <a
                key={key}
                href={segment.href}
                onClick={(event) => openExternalLink(event, segment.href)}
                className="break-all text-link underline decoration-link/40 underline-offset-2 hover:decoration-link"
              >
                {segment.value}
              </a>
            );
          default:
            return <Fragment key={key}>{segment.value}</Fragment>;
        }
      })}
    </>
  );
}

export { InlineSegments };
