export const spacing = {
  xs: 4,
  sm: 8,
  xs2: 12,
  xs3: 16,
  xs4: 20,
  xs5: 24,
  xs6: 32,
  xs7: 40,
  xs8: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const layout = {
  page: 16,
  minTouch: 44,
  controlHeight: 38,
  composerMinHeight: 112,
  maxContentWidth: 760,
} as const;

// 消息流单一间距节奏（T50）：块间距只挂 marginTop，值必须取自本表。
export const rhythm = {
  turnGap: 20,
  userToHead: 12,
  headToRow: 2,
  rowToRow: 0,
  processToBody: 8,
  blockGap: 10,
  listItemGap: 3,
  codeMargin: 10,
} as const;

// 字体层级（T51）：五级封闭，UI 铬层不得出现越级字号。
export const type = {
  display: { fontSize: 25, lineHeight: 32, fontWeight: '600' as const },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '400' as const },
  row: { fontSize: 13, lineHeight: 20, fontWeight: '500' as const },
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '400' as const },
} as const;
