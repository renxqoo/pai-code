import type { ProviderConfigView } from '@paiapp/contracts';

import { copy } from '@/strings';

/** 本地过滤：渠道名称 / baseUrl / 模型 id 包含匹配（大小写不敏感，空查询全通过）。 */
export function filterProviders(list: readonly ProviderConfigView[], query: string): ProviderConfigView[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...list];
  return list.filter(
    (provider) =>
      provider.name.toLowerCase().includes(q) ||
      provider.baseUrl.toLowerCase().includes(q) ||
      provider.models.some((model) => model.id.toLowerCase().includes(q)),
  );
}

/** 列表区空态文案：无渠道 / 有渠道但无匹配 / 有内容（null = 渲染渠道卡）。 */
export function providerListEmptyMessage(listCount: number, visibleCount: number): string | null {
  if (listCount === 0) return copy.settings.providersEmpty;
  if (visibleCount === 0) return copy.settings.searchNoResults;
  return null;
}
