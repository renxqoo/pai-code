/**
 * 补全弹层的分组视图（纯函数，composer 分组展示的唯一真相）：
 * 斜杠命令按 source 分箱——plugin/builtin 归命令组、skill 归技能组；
 * @ 文件引用为单组。空组整组丢弃，组序即键盘导航序（拍平后循环）。
 */

import type { CommandView } from '@paiapp/contracts';
import type { AutocompleteGroup, AutocompleteGroupItem } from '@paiapp/ui';

import { filterTokenItems } from '@/composer/token-trigger';

/** 斜杠命令分组：空查询过滤由调用方完成，这里只做 source 分箱与视图映射。 */
export function slashCommandGroups(
  commands: readonly CommandView[],
  titles: { readonly commandTitle: string; readonly skillTitle: string },
): readonly AutocompleteGroup[] {
  const toItems = (sources: readonly CommandView['source'][]): AutocompleteGroupItem[] =>
    commands
      .filter((command) => sources.includes(command.source))
      .map((command) => ({ id: `${command.source}:${command.name}`, label: command.name, description: command.description }));
  return [
    { id: 'commands', title: titles.commandTitle, items: toItems(['command']) },
    { id: 'skills', title: titles.skillTitle, items: toItems(['skill']) },
  ].filter((group) => group.items.length > 0);
}

/** @ 文件引用单组：paths 为搜索结果，query 做本地子串二次收窄（与命令同一过滤语义）。 */
export function fileGroup(paths: readonly string[], query: string, title: string): AutocompleteGroup {
  return {
    id: 'files',
    title,
    items: filterTokenItems(paths.map((path) => ({ name: path })), query).map((file) => ({
      id: `@:${file.name}`,
      label: file.name,
      description: null,
    })),
  };
}
