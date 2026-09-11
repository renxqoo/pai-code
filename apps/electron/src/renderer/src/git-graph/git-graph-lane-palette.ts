/**
 * 泳道调色板：按泳道序号循环取色（橙色领衔，蓝/绿/紫…依次循环）。
 * 类名必须写字面量供 Tailwind 扫描；浅色取 -600 贴近设计稿、深色取 -500 保证可读。
 */
type LaneHue = 'orange' | 'blue' | 'emerald' | 'violet' | 'amber' | 'pink' | 'cyan' | 'rose';

const LANE_HUES: readonly LaneHue[] = [
  'orange',
  'blue',
  'emerald',
  'violet',
  'amber',
  'pink',
  'cyan',
  'rose',
];

type LaneColor = {
  /** SVG 连边描边类 */
  stroke: string;
  /** SVG 节点填充类 */
  fill: string;
  /** 图标着色类（merge 标记等） */
  text: string;
};

function hueColor(hue: LaneHue): LaneColor {
  switch (hue) {
    case 'orange':
      return {
        stroke: 'stroke-orange-600 dark:stroke-orange-500',
        fill: 'fill-orange-600 dark:fill-orange-500',
        text: 'text-orange-600 dark:text-orange-500',
      };
    case 'blue':
      return {
        stroke: 'stroke-blue-600 dark:stroke-blue-500',
        fill: 'fill-blue-600 dark:fill-blue-500',
        text: 'text-blue-600 dark:text-blue-500',
      };
    case 'emerald':
      return {
        stroke: 'stroke-emerald-600 dark:stroke-emerald-500',
        fill: 'fill-emerald-600 dark:fill-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-500',
      };
    case 'violet':
      return {
        stroke: 'stroke-violet-600 dark:stroke-violet-500',
        fill: 'fill-violet-600 dark:fill-violet-500',
        text: 'text-violet-600 dark:text-violet-500',
      };
    case 'amber':
      return {
        stroke: 'stroke-amber-600 dark:stroke-amber-500',
        fill: 'fill-amber-600 dark:fill-amber-500',
        text: 'text-amber-600 dark:text-amber-500',
      };
    case 'pink':
      return {
        stroke: 'stroke-pink-600 dark:stroke-pink-500',
        fill: 'fill-pink-600 dark:fill-pink-500',
        text: 'text-pink-600 dark:text-pink-500',
      };
    case 'cyan':
      return {
        stroke: 'stroke-cyan-600 dark:stroke-cyan-500',
        fill: 'fill-cyan-600 dark:fill-cyan-500',
        text: 'text-cyan-600 dark:text-cyan-500',
      };
    case 'rose':
      return {
        stroke: 'stroke-rose-600 dark:stroke-rose-500',
        fill: 'fill-rose-600 dark:fill-rose-500',
        text: 'text-rose-600 dark:text-rose-500',
      };
  }
}

/** 泳道序号 → 颜色（负序号安全取模）。 */
export function laneColor(lane: number): LaneColor {
  const count = LANE_HUES.length;
  const index = ((lane % count) + count) % count;
  return hueColor(LANE_HUES.at(index) ?? 'orange');
}
