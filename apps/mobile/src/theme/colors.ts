export type ColorScheme = {
  background: string;
  settingsBackground: string;
  surface: string;
  surfaceRaised: string;
  surfaceSubtle: string;
  text: string;
  /** 次级正文：用户输入卡（比正文弱一档，但远高于过程行的灰——实测 textMuted
   *  过程灰做卡面文字会糊） */
  textSecondary: string;
  /** 过程行文字（工具/思考/状态行） */
  textMuted: string;
  /** 禁用与占位（比过程灰更弱） */
  textFaint: string;
  border: string;
  divider: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  destructive: string;
  success: string;
  /** diff 行对照色：新增/删除的前景与软底（红绿成对，两端同语义） */
  diffAdd: string;
  diffAddSoft: string;
  diffDel: string;
  diffDelSoft: string;
  overlay: string;
  code: string;
};

export const lightColors: ColorScheme = {
  background: '#FFFFFF',
  settingsBackground: '#F6F6F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSubtle: '#F6F6F7',
  text: '#101012',
  // 次级正文：与正文同族但弱一档（0.62 → 0.48 亮度区间）
  textSecondary: '#4A4A50',
  // 过程灰：比次级正文再弱一档，与正文拉开两档
  textMuted: '#8A8A92',
  // 占位/禁用：最弱
  textFaint: '#B4B4BC',
  border: '#ECECEF',
  divider: '#F2F2F4',
  primary: '#09090B',
  primaryText: '#FFFFFF',
  accent: '#09090B',
  accentSoft: '#F4F4F5',
  destructive: '#DC2626',
  success: '#16A34A',
  diffAdd: '#15803D',
  diffAddSoft: '#E7F6EC',
  diffDel: '#DC2626',
  diffDelSoft: '#FBEAEA',
  overlay: 'rgba(0, 0, 0, 0.45)',
  code: '#18181B',
};

export const darkColors: ColorScheme = {
  background: '#101012',
  settingsBackground: '#161619',
  surface: '#19191C',
  surfaceRaised: '#222226',
  surfaceSubtle: '#252529',
  text: '#FAFAFA',
  textSecondary: '#C4C4CC',
  textMuted: '#8E8E96',
  textFaint: '#63636B',
  border: '#27272A',
  divider: '#1F1F22',
  primary: '#FAFAFA',
  primaryText: '#09090B',
  accent: '#FAFAFA',
  accentSoft: '#1C1C1F',
  destructive: '#EF4444',
  success: '#22C55E',
  diffAdd: '#4ADE80',
  diffAddSoft: 'rgba(74, 222, 128, 0.12)',
  diffDel: '#F87171',
  diffDelSoft: 'rgba(248, 113, 113, 0.12)',
  overlay: 'rgba(0, 0, 0, 0.72)',
  code: '#09090B',
};
