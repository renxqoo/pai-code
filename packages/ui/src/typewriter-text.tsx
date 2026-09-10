import * as React from 'react';

import { cn } from 'cn';

const TYPE_TICK_MS = 50;
/** 每拍推进字符数（约 100 字/秒的打字节奏，跟上流式吐字不拖沓） */
const CHARS_PER_TICK = 5;
/** 打字展示窗口：只渲染光标前的尾部片段，流式预览只关心最新内容 */
const TAIL_WINDOW_CHARS = 160;
/** 读屏替身文本的尾部上限 */
const SR_TAIL_CHARS = 240;

type TypewriterTextProps = {
  /** 流式文本原文（内部压平空白取单行） */
  text: string
  /** 流式激活：激活时打字输出 + 闪烁光标；静止退化为普通单行截断 */
  active: boolean
  className?: string
};

/** 光标前的展示片段：截到文本末尾，超出窗口只留尾部。 */
export function typewriterTail(flat: string, cursor: number, window: number): string {
  const at = Math.max(0, Math.min(cursor, flat.length));
  const start = Math.max(0, at - Math.max(1, window));
  return flat.slice(start, at);
}

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 流式打字机单行预览：收起态思考预览在内容仍在输出时，跟随流式尾部逐字吐出，
 * 新内容到达即继续打字；对读屏以稳定尾部文本播报，不随逐字帧抖动。
 * 静止态退化为普通单行截断。
 */
function TypewriterText({ text, active, className }: TypewriterTextProps) {
  const flat = flatten(text);
  const [cursor, setCursor] = React.useState(flat.length);
  const boxRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    setCursor((prev) => Math.min(prev, flat.length));
  }, [flat]);

  React.useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setCursor((prev) => (prev < flat.length ? Math.min(flat.length, prev + CHARS_PER_TICK) : prev));
    }, TYPE_TICK_MS);
    return () => clearInterval(timer);
  }, [active, flat]);

  // 贴尾：视窗钉在内容尾缘，打字推进时老字符从左侧滑出；内容不足一行时左对齐
  React.useEffect(() => {
    const el = boxRef.current;
    if (el !== null) el.scrollLeft = el.scrollWidth;
  });

  if (!active) {
    return (
      <span className={cn('block truncate', className)}>
        {flat}
      </span>
    );
  }
  const typed = typewriterTail(flat, cursor, TAIL_WINDOW_CHARS);
  const srTail = flat.length > SR_TAIL_CHARS ? `…${flat.slice(-SR_TAIL_CHARS)}` : flat;
  return (
    <span className={cn('block', className)}>
      <span ref={boxRef} aria-hidden="true" className="block overflow-hidden whitespace-nowrap">
        <span className="whitespace-pre">{typed}</span>
      </span>
      <span className="sr-only">{srTail}</span>
    </span>
  );
}

export { TypewriterText };
export type { TypewriterTextProps };
