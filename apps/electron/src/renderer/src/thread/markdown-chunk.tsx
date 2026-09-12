import * as React from 'react';
import { Streamdown, type PluginConfig, type StreamdownProps } from 'streamdown';

import { StreamdownImage } from './streamdown-image';
import { StreamdownLink } from './streamdown-link';
import { streamdownTranslations } from './streamdown-translations';

/**
 * 单个 markdown 块片段（冻结块或实时尾区，T37 块冻结渲染）：与单实例形态共享
 * 同一组稳定 props（模块常量，引用恒定——memo 比较只随 text 变化）；内容不变
 * 即零重渲。`md-chunk` 标记类供首尾边距守卫（styles.css）与分裂形态样式定位。
 */

const CHUNK_COMPONENTS = { a: StreamdownLink, img: StreamdownImage } as const;
const CHUNK_CONTROLS = { code: { download: false } } as const;
const CHUNK_LINK_SAFETY = { enabled: false } as const;

type MarkdownChunkProps = {
  text: string
  className: string
  plugins: PluginConfig
};

function MarkdownChunk({ text, className, plugins }: MarkdownChunkProps): React.JSX.Element {
  return (
    <Streamdown
      className={className}
      plugins={plugins}
      components={CHUNK_COMPONENTS as StreamdownProps['components']}
      translations={streamdownTranslations()}
      controls={CHUNK_CONTROLS as StreamdownProps['controls']}
      tableMaxHeight={800}
      linkSafety={CHUNK_LINK_SAFETY as StreamdownProps['linkSafety']}
      lineNumbers={false}
    >
      {text}
    </Streamdown>
  );
}

const MarkdownChunkMemo = React.memo(MarkdownChunk);
export { MarkdownChunkMemo as MarkdownChunk };
