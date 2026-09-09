import { cn } from '@/lib/utils';
import { splitHighlight, type HighlightRange } from '@/composer/command-highlight';

type ComposerHighlightLayerProps = {
  text: string
  ranges: readonly HighlightRange[]
  /** textarea 内部滚动偏移：内容整体平移跟随，超长输入滚动后保持对齐 */
  scrollTop: number
  /** 与被镜像 textarea 共用的排版度量类（同一份常量喂两处，度量单一真相） */
  metricsClassName: string
}

/**
 * 输入框高亮镜像层：命中命令 token 时由 Composer 挂载，textarea 自身文字转
 * 透明、由本层渲染可见文本与高亮段；aria-hidden 纯装饰层，可访问性输入仍由
 * 原生 textarea 承担。排版度量与 textarea 完全一致（共用 metricsClassName）。
 */
function ComposerHighlightLayer({ text, ranges, scrollTop, metricsClassName }: ComposerHighlightLayerProps) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', metricsClassName)}>
      <div className="whitespace-pre-wrap break-words" style={{ transform: `translateY(${-scrollTop}px)` }}>
        {splitHighlight(text, ranges).map((segment, index) =>
          segment.highlighted ? (
            <span key={index} className="font-medium text-dot-active">
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </div>
    </div>
  );
}

export { ComposerHighlightLayer };
