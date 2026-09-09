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
 * 输入框命令高亮底色层：镜像全文布局定位命中区间，文字全透明只占位，
 * 命中段画半透明色带垫在文字下面。不做「可见文字镜像」——Chromium 的
 * textarea 内部文本布局与普通 div 存在亚像素级字形位置差（红蓝叠加显影
 * 实测不可对齐），文字镜像永远无法像素级重合；而底色带的 1-2px 度量差
 * 视觉无感。textarea 文字保持原生不透明渲染：光标、选区、输入法组合
 * 全部原生正确（组合文本/选区高亮只在原生层可见）。
 */
function ComposerHighlightLayer({ text, ranges, scrollTop, metricsClassName }: ComposerHighlightLayerProps) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden text-transparent', metricsClassName)}>
      <div className="whitespace-pre-wrap break-words" style={{ transform: `translateY(${-scrollTop}px)` }}>
        {splitHighlight(text, ranges).map((segment, index) =>
          segment.highlighted ? (
            <span key={index} className="box-decoration-clone rounded-[5px] bg-dot-active/15">
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
