import * as React from 'react';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronLeft, ChevronRight, Plus, X, ZoomOut } from 'lucide-react';
import { cn } from 'cn';

import { IconButton } from './icon-button';
import { clampPan, clampRatio, INITIAL_RATIO, INITIAL_ZOOM, MAX_RATIO, MIN_RATIO, settleZoom, stepRatio, zoomAt, type ZoomState } from './image-lightbox-zoom';

/** 灯箱图源：src 已由调用方完成来源安全判定（data:/blob:/http(s)），组件不再重复校验。 */
export type LightboxImage = { src: string; alt?: string };

/** 用户可见文案（调用方注入，组件零内置文案）；counter 产出「第 i 张 / 共 n 张」读法。 */
export type ImageLightboxLabels = {
  close: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
  prev: string;
  next: string;
  error: string;
  counter: (index: number, total: number) => string;
};

type ImageLightboxProps = {
  open: boolean
  /** 关闭请求（Esc / 遮罩 / × 均汇入此回调，收口权在调用方） */
  onClose: () => void
  images: ReadonlyArray<LightboxImage>
  /** 当前图索引（受控）；多图时 ‹ › 与 ←/→ 切换 */
  index: number
  onIndexChange: (index: number) => void
  labels: ImageLightboxLabels
};

/** 拖拽会话（高帧率路径，不经 React state，落地时才同步）。 */
type DragPan = { pointerId: number; origin: { x: number; y: number }; start: ZoomState } | null;

const TOOL_BUTTON = 'text-white/75 hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-35';

/** 双击放大目标比例（锚定点击处）；已在该比例以上则复位。 */
const DOUBLE_CLICK_RATIO = 1.5;

/**
 * 全屏图片灯箱（受控）：深色遮罩 + 居中图 + 缩放/平移/多图导航。
 * Dialog 原语只取焦点陷阱、滚动锁与 Esc/outside 关闭语义，视觉与布局全部自定义
 * （Popup 即全屏舞台，不用 DialogContent 的白卡片形态）。
 *
 * 变换模型：图片按 naturalWidth×ratio 显式定尺寸（ratio 初始 60%，即「原图的 60%」），
 * 外层容器只施加 `translate(tx, ty)`（原点 = 视口中心）——缩放改尺寸、平移改位移，
 * 互不干扰，锚点换算与平移钳制因此都与渲染管线解耦。
 * 拖拽/滚轮走 ref 高帧率路径直写 style，pointerup 落地 React state（拖拽期间无逐帧重渲）。
 */
function ImageLightbox({ open, onClose, images, index, onIndexChange, labels }: ImageLightboxProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = React.useState<ZoomState>(INITIAL_ZOOM);
  const zoomRef = React.useRef<ZoomState>(INITIAL_ZOOM);
  const dragRef = React.useRef<DragPan>(null);
  const [natural, setNatural] = React.useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 });

  const total = images.length;
  const current = total > 0 ? images[Math.min(index, total - 1)] : undefined;

  const viewportSpan = (): { width: number; height: number } => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect === undefined ? { width: 0, height: 0 } : { width: rect.width, height: rect.height };
  };

  /** 视口尺寸订阅：ref 回调（Portal 内容挂载后才拿到元素，effect 会早一步拿到 null 而永久错过）。
   * 尺寸参与渲染（光标形态与平移可用性判定），故入 state；初始值 0 = 未测量，
   * 此时一律判定为不可拖（宁可少一次拖拽，也不要在错误尺寸上放手势）。 */
  const observerRef = React.useRef<ResizeObserver | null>(null);
  const attachViewport = React.useCallback((el: HTMLDivElement | null): void => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    viewportRef.current = el;
    if (el === null) return;
    const measure = (): void => {
      const rect = el.getBoundingClientRect();
      setViewport((prev) => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  /** 高帧率路径统一出口：直写 DOM（尺寸 + 位移），绕开 React 渲染。
   * 返回实际落地的尺寸与位移，供调用方作为后续手势的起点（单一真相：DOM 即当前比例）。 */
  const paint = React.useCallback((state: ZoomState, naturalSize: { width: number; height: number } | null): ZoomState => {
    const frame = frameRef.current;
    if (frame === null || naturalSize === null) return state;
    frame.style.width = `${naturalSize.width * state.ratio}px`;
    frame.style.height = `${naturalSize.height * state.ratio}px`;
    frame.style.transform = `translate(${state.tx}px, ${state.ty}px)`;
    return state;
  }, []);

  /** ref/state 双写：变换态落 ref（下一手势的起点）+ state（声明式渲染与可用性判定）。 */
  const applyZoom = React.useCallback(
    (next: ZoomState, naturalSize: { width: number; height: number } | null): void => {
      const settled = naturalSize === null ? next : settleZoom(next, naturalSize, viewportSpan());
      zoomRef.current = settled;
      paint(settled, naturalSize);
      setZoom(settled);
    },
    [paint],
  );

  /** 切图/开合即复位：比例回初始档、平移归零、错误态与自然尺寸清空。 */
  React.useEffect(() => {
    zoomRef.current = INITIAL_ZOOM;
    setZoom(INITIAL_ZOOM);
    setNatural(null);
    setImageFailed(false);
    // 清掉上一张的尺寸/位移：natural 未就绪时 paint 是空操作，不清会残留上一张的盒子
    const frame = frameRef.current;
    if (frame !== null) {
      frame.style.width = '0px';
      frame.style.height = '0px';
      frame.style.transform = 'translate(0px, 0px)';
    }
  }, [index, open, current?.src]);

  /** 锚点缩放入口（双击/按钮/键盘共用）：算目标态后经 settle 钳制落地。 */
  const zoomBy = React.useCallback(
    (factor: number, anchor?: { x: number; y: number }): void => {
      const state = zoomRef.current;
      applyZoom(zoomAt(state, clampRatio(state.ratio * factor), anchor), natural);
    },
    [applyZoom, natural],
  );

  /** 档位步进入口（滚轮/±按钮）：等比递增且吸附 1:1——百分比能停在 100% 而非跨过。 */
  const stepZoom = React.useCallback(
    (dir: 1 | -1, anchor?: { x: number; y: number }): void => {
      const state = zoomRef.current;
      const next = stepRatio(state.ratio, dir);
      if (next === state.ratio) return;
      applyZoom(zoomAt(state, clampRatio(next), anchor), natural);
    },
    [applyZoom, natural],
  );

  const resetZoom = React.useCallback((): void => applyZoom(INITIAL_ZOOM, natural), [applyZoom, natural]);

  /** 滚轮：以光标为锚点按档缩放；preventDefault 防页面连带滚动。 */
  const onWheel = (event: React.WheelEvent): void => {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    stepZoom(event.deltaY < 0 ? 1 : -1, anchor);
  };

  /** 当前比例下图像是否溢出视口（决定拖拽手势是否接管、光标是否变 grab）。 */
  const hasPanRoom = (): boolean => {
    const span = viewportSpan();
    const state = zoomRef.current;
    if (natural === null) return false;
    return natural.width * state.ratio > span.width || natural.height * state.ratio > span.height;
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    if (imageFailed || !hasPanRoom()) return;
    // 合成/自动化事件的 pointerId 无活动指针，capture 会抛 NotFoundError——失败不阻断拖拽
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 无活动指针（合成事件）：忽略
    }
    dragRef.current = { pointerId: event.pointerId, origin: { x: event.clientX, y: event.clientY }, start: zoomRef.current };
    (event.currentTarget as HTMLElement).dataset.dragging = 'true';
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const next: ZoomState = {
      ratio: drag.start.ratio,
      tx: drag.start.tx + (event.clientX - drag.origin.x),
      ty: drag.start.ty + (event.clientY - drag.origin.y),
    };
    const settled = natural === null ? next : clampPan(next, natural, viewportSpan());
    zoomRef.current = settled;
    paint(settled, natural);
  };

  const endPointerDrag = (event: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    delete (event.currentTarget as HTMLElement).dataset.dragging;
    // 落地 state：使可用性判定（光标、缩放按钮）与绘制对齐
    const settled = natural === null ? zoomRef.current : settleZoom(zoomRef.current, natural, viewportSpan());
    zoomRef.current = settled;
    paint(settled, natural);
    setZoom(settled);
  };

  /** 双击：未达目标比例则锚定点击处放大到 1.5×，否则复位。 */
  const onDoubleClick = (event: React.MouseEvent): void => {
    if (imageFailed) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const anchor =
      rect === undefined
        ? undefined
        : { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    if (zoomRef.current.ratio < DOUBLE_CLICK_RATIO) {
      zoomBy(DOUBLE_CLICK_RATIO / zoomRef.current.ratio, anchor);
    } else {
      resetZoom();
    }
  };

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    const size = naturalWidth > 0 && naturalHeight > 0 ? { width: naturalWidth, height: naturalHeight } : null;
    setNatural(size);
    setImageFailed(false);
    // 加载完成后再落地一次：此时自然尺寸已知，首帧即为初始比例且平移已钳制
    applyZoom(zoomRef.current, size);
  };

  const goPrev = (): void => onIndexChange((index - 1 + total) % total);
  const goNext = (): void => onIndexChange((index + 1) % total);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowLeft' && total > 1) {
      event.preventDefault();
      goPrev();
    } else if (event.key === 'ArrowRight' && total > 1) {
      event.preventDefault();
      goNext();
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      stepZoom(1);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      stepZoom(-1);
    } else if (event.key === '0') {
      event.preventDefault();
      resetZoom();
    }
  };

  if (!open || total === 0) return null;
  const percent = Math.round(zoom.ratio * 100);
  /** 初始比例即复位目标：低于它视作「已缩小」，重置按钮亮起、缩出到头禁用。 */
  const belowInitial = zoom.ratio < INITIAL_RATIO - 0.001;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/80 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          onClick={onClose}
        />
        <DialogPrimitive.Popup
          initialFocus={false}
          className="fixed inset-0 z-50 flex cursor-default outline-none"
          aria-label={current?.alt ?? labels.counter(index + 1, total)}
          onKeyDown={onKeyDown}
        >
          <div
            ref={attachViewport}
            className={cn(
              'relative flex-1 self-stretch overflow-hidden',
              // 图像溢出视口才可拖：光标提示可平移，拖拽中转 grabbing
              natural !== null && !imageFailed && (natural.width * zoom.ratio > viewport.width || natural.height * zoom.ratio > viewport.height)
                ? 'cursor-grab data-[dragging]:cursor-grabbing'
                : 'cursor-default',
            )}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointerDrag}
            onPointerCancel={endPointerDrag}
            onDoubleClick={onDoubleClick}
          >
            {imageFailed ? (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-white/70">
                <span className="text-sm">{labels.error}</span>
                {current?.alt !== undefined && current.alt.length > 0 ? (
                  <span className="max-w-[80%] truncate text-xs text-white/45">{current.alt}</span>
                ) : null}
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* 尺寸/位移全由 paint 直写（React 不持 style，避免陈旧重渲覆盖高帧率路径）；
                    size-0 + overflow-hidden：图像加载完成前不按原始尺寸闪现，paint 后由内联 px 接管 */}
                <div ref={frameRef} className="size-0 overflow-hidden will-change-transform">
                  <img
                    key={current?.src}
                    src={current?.src}
                    alt={current?.alt ?? ''}
                    draggable={false}
                    className="size-full select-none object-contain"
                    onLoad={onImageLoad}
                    onError={() => setImageFailed(true)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 顶部右侧工具条：关闭独立于缩放工具（关闭语义优先级最高，永不禁用） */}
          <div className="absolute top-4 right-4 flex items-center gap-1">
            <IconButton label={labels.close} size="lg" variant="ghost" className={TOOL_BUTTON} onClick={onClose}>
              <X className="size-5" strokeWidth={1.75} />
            </IconButton>
          </div>

          {/* 底部中央工具条：多图导航 + 缩放 + 复位 + 百分比（百分比即当前比例，可点即复位） */}
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-2 py-1 backdrop-blur-sm">
            {total > 1 ? (
              <>
                <IconButton label={labels.prev} size="md" variant="ghost" className={TOOL_BUTTON} onClick={goPrev}>
                  <ChevronLeft className="size-4" strokeWidth={1.75} />
                </IconButton>
                <span className="min-w-14 text-center text-xs text-white/75 tabular-nums" aria-live="polite">
                  {labels.counter(index + 1, total)}
                </span>
                <IconButton label={labels.next} size="md" variant="ghost" className={TOOL_BUTTON} onClick={goNext}>
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                </IconButton>
                <span className="mx-1 h-4 w-px bg-white/20" />
              </>
            ) : null}
            <IconButton
              label={labels.zoomOut}
              size="md"
              variant="ghost"
              className={TOOL_BUTTON}
              onClick={() => stepZoom(-1)}
              disabled={zoom.ratio <= MIN_RATIO}
            >
              <ZoomOut className="size-4" strokeWidth={1.75} />
            </IconButton>
            <button
              type="button"
              aria-label={labels.reset}
              title={labels.reset}
              onClick={resetZoom}
              disabled={!belowInitial && zoom.ratio <= INITIAL_RATIO}
              // 复位按钮不用 disabled:opacity 灰态：它与 ± 按钮同排，灰成同色会被读成
              // 「缩小/放大不可用」。改为仅降低文字亮度，保持与相邻按钮同一视觉权重。
              className="min-w-12 cursor-pointer rounded-md px-1 py-0.5 text-center text-xs text-white/75 tabular-nums transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:text-white/35"
            >
              {percent}%
            </button>
            <IconButton
              label={labels.zoomIn}
              size="md"
              variant="ghost"
              className={TOOL_BUTTON}
              onClick={() => stepZoom(1)}
              disabled={zoom.ratio >= MAX_RATIO}
            >
              <Plus className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>

          {total > 1 ? (
            <>
              <button
                type="button"
                aria-label={labels.prev}
                onClick={goPrev}
                className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ChevronLeft className="size-6" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                aria-label={labels.next}
                onClick={goNext}
                className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ChevronRight className="size-6" strokeWidth={1.75} />
              </button>
            </>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { ImageLightbox };
export type { ImageLightboxProps };