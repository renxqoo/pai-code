import * as React from 'react';

import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@x3code/ui';

import { useCommandItems } from '@/screens/use-command-panel';
import { fileItems, type PaletteGroupKind, type PaletteItem } from './palette-items';

type CommandPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 文件组搜索（query ≥1 字符才触发；null = 失败/空目录按空组）。 */
  searchFiles: (query: string) => Promise<string[] | null>
  labels: {
    aria: string
    placeholder: string
    empty: string
    groups: Record<PaletteGroupKind, string>
  }
  /** 打开时的高亮项 id（须是某条 item 的 value，否则 cmdk 取不到选中项、回车无响应）。 */
  defaultItemValue: string | null
  onSelect: (id: string) => void
}

/** 文件搜索去抖窗口：键盘连续输入只发最后一次。 */
const FILE_SEARCH_DEBOUNCE_MS = 300;

/**
 * 全局面板（⌘K）：居中模态 + 顶部搜索 + 五组结果（cmdk 内建上下键/回车选择）。
 * 文件组按输入词去抖搜索（世代号丢弃晚到应答）。
 *
 * 选中一律「先关后派」：Base UI Dialog 在关闭提交后把焦点还给触发元素
 * （returnFocus），若同步派发，斜杠命令路径里 `insertIntoDraft` 末尾的
 * `focusComposer()` 会被覆盖——草稿填好了但光标不在输入框。宏任务必然晚于
 * 该次提交的所有副作用，故派发挪进 setTimeout。
 *
 * 面板常驻不卸载（Dialog 关闭后暂留 DOM 播退出动画），搜索词与文件组
 * 跨开关存活，重置发生在开沿：下次打开必为空词与空文件组，反复 toggle 无残留。
 */
function CommandPanel({ open, onOpenChange, searchFiles, labels, defaultItemValue, onSelect }: CommandPanelProps) {
  const items = useCommandItems(open);
  const [query, setQuery] = React.useState('');
  const [filePaths, setFilePaths] = React.useState<readonly string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    // 开沿重置（组件常驻，状态跨开关存活）：搜索词与文件组归零，
    // 反复 toggle 无残留
    setQuery('');
    setFilePaths([]);
  }, [open]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length === 0) {
      setFilePaths([]);
      return;
    }
    let generation = 0;
    const handle = window.setTimeout(() => {
      void searchFiles(trimmed).then((paths) => {
        if (generation === 0 && paths !== null) setFilePaths(paths);
      });
    }, FILE_SEARCH_DEBOUNCE_MS);
    return () => {
      generation += 1;
      window.clearTimeout(handle);
    };
  }, [query, open, searchFiles]);

  if (!open) return null;

  const pick = (id: string): void => {
    onOpenChange(false);
    window.setTimeout(() => onSelect(id), 0);
  };

  const groups: ReadonlyArray<{ kind: PaletteGroupKind; items: readonly PaletteItem[] }> = [
    { kind: 'actions', items: items.filter((item) => item.group === 'actions') },
    { kind: 'sessions', items: items.filter((item) => item.group === 'sessions') },
    { kind: 'files', items: fileItems(filePaths) },
    { kind: 'commands', items: items.filter((item) => item.group === 'commands') },
    { kind: 'settings', items: items.filter((item) => item.group === 'settings') },
  ];

  return (
    /* 会话行要并排标题 + 项目名 + 快捷键徽标，384px（生成物 sm:max-w-sm）放不下，放宽一档 */
    <CommandDialog open={open} onOpenChange={onOpenChange} title={labels.aria} description={labels.placeholder} className="sm:max-w-xl">
      <Command label={labels.aria} defaultValue={defaultItemValue ?? undefined}>
        <CommandInput placeholder={labels.placeholder} value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{labels.empty}</CommandEmpty>
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <CommandGroup key={group.kind} heading={labels.groups[group.kind]}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    /* value 必须唯一（id）：同名词条（如两个同名会话）共用 value 时
                       cmdk 的 aria-selected 命中文档序第一个，回车会选错条目；
                       搜索面经 keywords 覆盖 label/detail。 */
                    value={item.id}
                    keywords={[item.label, ...(item.detail !== undefined ? [item.detail] : [])]}
                    onSelect={() => pick(item.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.detail !== undefined ? (
                      <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{item.detail}</span>
                    ) : null}
                    {item.shortcut !== undefined ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

const CommandPanelMemo = React.memo(CommandPanel);
export { CommandPanelMemo as CommandPanel };