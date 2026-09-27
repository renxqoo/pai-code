// 过程行通用按压反馈（T50 行族共用）：32pt 行高 + 按压降透明度。
// 行盒贴内容（与状态信封行同高）：过程行是正文外的脚注，行高撑大会在相邻行
// 之间制造大片空白，且空白区同样可点——误触上下行的代价更大。
export type RowPressStyle = {
  alignItems: 'center';
  flexDirection: 'row';
  minHeight: number;
  opacity: number;
};

export function rowPressStyle({ pressed }: { pressed: boolean }): RowPressStyle {
  return { alignItems: 'center', flexDirection: 'row', minHeight: 32, opacity: pressed ? 0.62 : 1 };
}
