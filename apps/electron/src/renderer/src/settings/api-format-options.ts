import { API_FORMAT_IDS, isApiFormat } from '@paiapp/contracts';

import { copy } from '@/strings';

export type ApiFormatOption = { id: string; label: string };

/**
 * 选择器选项：词表顺序即展示顺序；当前值不在词表（磁盘手写格式）时追加回退项，
 * 保证编辑旧配置不会因 UI 词表收窄而静默改写 api 值。
 */
export function apiFormatOptions(current: string): ApiFormatOption[] {
  const options: ApiFormatOption[] = API_FORMAT_IDS.map((id) => ({ id, label: copy.settings.apiFormatOptions[id] }));
  if (current.length > 0 && !isApiFormat(current)) options.push({ id: current, label: copy.settings.apiFormatUnknown(current) });
  return options;
}

/** 值 → 展示文案（词表外回退「自定义 · 原值」）。 */
export function apiFormatLabel(value: string): string {
  return isApiFormat(value) ? copy.settings.apiFormatOptions[value] : copy.settings.apiFormatUnknown(value);
}
