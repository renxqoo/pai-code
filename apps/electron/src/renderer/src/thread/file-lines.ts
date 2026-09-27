/**
 * read 工具输出 → 展示行：read 返回的就是「行号 + 内容」文本（offset/limit 窗口），
 * 解析出行号列与内容列；无行号前缀的行按顺序兜底编号（工具换实现也不塌）。
 * 末尾的续读提示（offset hint）单独抽出，渲染为页脚而不是混在内容里。
 */

/** 展示行上限：read 最多 2000 行，UI 再截断一层以免长文件把 DOM 撑爆。 */
const MAX_LINES = 500;

/** `12→内容` / `12 | 内容` / `12\t内容` 三种行号形态都收。 */
const NUMBERED = /^(\d+)(?:→|\s*\|\s*|\t)(.*)$/;

/** 续读提示行（read 工具在输出末尾给的 offset hint）；无则 null。 */
const FOOTER = /^\s*[<[(]?\s*(?:offset|next|more|继续|续读)/i;

export type FileLine = {
  /** 行号（无行号前缀时按出现序兜底） */
  number: number
  text: string
}

/** 输出文本 → 展示行（去掉行号前缀，保留内容原文与缩进）。 */
export function fileLines(output: string): FileLine[] {
  const out: FileLine[] = [];
  let fallback = 0;
  for (const raw of output.split('\n')) {
    if (out.length >= MAX_LINES) break;
    if (raw.trim().length === 0) continue;
    const match = NUMBERED.exec(raw);
    if (match?.[1] !== undefined) {
      const number = Number(match[1]);
      out.push({ number: Number.isFinite(number) ? number : fallback + 1, text: match[2] ?? '' });
      continue;
    }
    fallback += 1;
    out.push({ number: fallback, text: raw });
  }
  return out;
}

/** 输出末尾的续读提示（read 工具的 offset hint）；无则 null。 */
export function readFooterHint(output: string): string | null {
  const lines = output.split('\n');
  for (let i = lines.length - 1; i >= 0 && i > lines.length - 6; i -= 1) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;
    return FOOTER.test(line) ? line.trim() : null;
  }
  return null;
}
