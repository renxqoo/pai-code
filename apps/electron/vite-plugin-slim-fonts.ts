import type { Plugin } from 'vite';

/**
 * 渲染层字体瘦身：在 vite 资产管线之前（enforce: 'pre'）裁剪 CSS 字体引用，
 * 被裁掉的 url 不再触发对应字体文件产出。两条规则：
 * - katex.min.css 的 @font-face src 三格式（woff2/woff/ttf）只留 woff2——
 *   运行面是 Electron 的 Chromium 内核，无需老格式降级，产物字体约 -800KB；
 * - UI 变量字体（@fontsource-variable/geist）只留 latin/latin-ext 子集——
 *   UI 文案为中英与代码文本，西里尔/越南语子集永远命中不了 unicode-range。
 */

const KATEX_CSS_SUFFIX = '/katex/dist/katex.min.css';
const UI_FONT_CSS_DIR = '/@fontsource-variable/geist/';

/** katex @font-face src 的 woff/ttf 降级段（woff2 段在前，保留） */
const KATEX_FALLBACK_SRCS =
  /,url\(fonts\/[^)]*\.woff\)\s*format\("woff"\),url\(fonts\/[^)]*\.ttf\)\s*format\("truetype"\)/g;

/** UI 字体子集 @font-face 块内的字体文件名：geist-<子集>-wght-normal.woff2 */
const UI_FONT_SUBSET_URL = /url\([^)]*\/geist-([a-z-]+)-wght-normal\.woff2\)/;

/** UI 字体保留子集：latin 覆盖 ASCII 与常用标点，latin-ext 覆盖扩展拉丁与拼音声调字形 */
const UI_FONT_KEPT_SUBSETS = new Set(['latin', 'latin-ext']);

/** 剔除 UI 字体未保留子集的整个 @font-face 块（@font-face 内无嵌套花括号） */
function slimUiFontFaces(css: string): string {
  return css.replace(/@font-face\s*\{[^{}]*\}/g, (face) => {
    const subset = face.match(UI_FONT_SUBSET_URL)?.[1];
    return subset !== undefined && !UI_FONT_KEPT_SUBSETS.has(subset) ? '' : face;
  });
}

/** 按 css 模块 id 裁剪字体引用；无关文件或无变化返回 null（rollup 语义：沿用原码） */
function slimCssForId(css: string, id: string): string | null {
  const file = id.split('?')[0] ?? id;
  let slimmed: string | null = null;
  if (file.endsWith(KATEX_CSS_SUFFIX)) {
    slimmed = css.replace(KATEX_FALLBACK_SRCS, '');
  } else if (file.includes(UI_FONT_CSS_DIR) && file.endsWith('.css')) {
    slimmed = slimUiFontFaces(css);
  }
  return slimmed !== null && slimmed !== css ? slimmed : null;
}

function slimFontsPlugin(): Plugin {
  return {
    name: 'pai:slim-fonts',
    enforce: 'pre',
    transform(code, id) {
      const slimmed = slimCssForId(code, id);
      return slimmed === null ? null : { code: slimmed, map: null };
    },
  };
}

export { slimCssForId, slimFontsPlugin };
