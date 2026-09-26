// 过程行通用按压反馈（T50 行族共用）：44pt 触控 + 按压降透明度。
export type RowPressStyle = {
  alignItems: 'center';
  flexDirection: 'row';
  minHeight: number;
  opacity: number;
};

export function rowPressStyle({ pressed }: { pressed: boolean }): RowPressStyle {
  return { alignItems: 'center', flexDirection: 'row', minHeight: 44, opacity: pressed ? 0.62 : 1 };
}
