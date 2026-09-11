import type { PickerDialogGroup, PickerDialogItem } from '@paiapp/ui';

/**
 * 模型目录按 provider 前缀分桶：条目按首个 "/" 切分，前缀作组标题、去前缀的
 * modelId 作展示 label、完整原串作 id（回调语义不变）；无 "/" 的条目并入同一个
 * 无标题桶（heading 缺省）。桶序 = 桶首条目在输入中的首现序（Map 插入序）。
 * 空输入返回 []。
 */
export function groupModelOptions(options: readonly string[]): PickerDialogGroup[] {
  const buckets = new Map<string, PickerDialogItem[]>();
  for (const option of options) {
    const slash = option.indexOf('/');
    const prefix = slash === -1 ? '' : option.slice(0, slash);
    const item: PickerDialogItem = { id: option, label: slash === -1 ? option : option.slice(slash + 1) };
    const bucket = buckets.get(prefix);
    if (bucket === undefined) buckets.set(prefix, [item]);
    else bucket.push(item);
  }
  return [...buckets].map(([prefix, items]) => ({
    heading: prefix === '' ? undefined : prefix,
    items,
  }));
}
