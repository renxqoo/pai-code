import * as React from 'react';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';

import { fileItems, type PaletteGroupKind, type PaletteItem } from './palette-items';

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  /** 静态组条目（动作/会话/命令/设置）。 */
  items: readonly PaletteItem[]
  /** 文件组搜索（query ≥1 字符才触发；null = 失败/空目录按空组）。 */
  searchFiles: (query: string) => Promise<string[] | null>
  labels: {
    aria: string
    placeholder: string
    empty: string
    groups: Record<PaletteGroupKind, string>
  }
  onSelect: (id: string) => void
}

/** 文件搜索去抖窗口：键盘连续输入只发最后一次。 */
const FILE_SEARCH_DEBOUNCE_MS = 300;

/**
 * 全局命令面板（⌘P）：底部居中上弹浮层——不遮对话顶部，输入框在下、
 * 结果列表向上生长。文件组按输入词去抖搜索（世代号丢弃晚到应答）；
 * 选中即回调并关闭；Esc/遮罩点击关闭（Esc 链由 esc-action 统一裁决）。
 */
function CommandPalette({ open, onClose, items, searchFiles, labels, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [filePaths, setFilePaths] = React.useState<readonly string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    // 关 = 卸载（重置搜索词与文件组；cmdk 高亮随重挂载回到首项）
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
  const groups: ReadonlyArray<{ kind: PaletteGroupKind; items: readonly PaletteItem[] }> = [
    { kind: 'actions', items: items.filter((item) => item.group === 'actions') },
    { kind: 'sessions', items: items.filter((item) => item.group === 'sessions') },
    { kind: 'files', items: fileItems(filePaths) },
    { kind: 'commands', items: items.filter((item) => item.group === 'commands') },
    { kind: 'settings', items: items.filter((item) => item.group === 'settings') },
  ];

  return (
    <div className="fixed inset-0 z-40" role="presentation" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.aria}
        className="absolute bottom-[28px] left-1/2 flex max-h-[420px] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Command label={labels.aria} className="p-2">
          <CommandInput placeholder={labels.placeholder} value={query} onValueChange={setQuery} autoFocus />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>{labels.empty}</CommandEmpty>
            {groups
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <CommandGroup key={group.kind} heading={labels.groups[group.kind]}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.detail ?? ''}`}
                      onSelect={() => {
                        onSelect(item.id);
                        onClose();
                      }}
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
      </div>
    </div>
  );
}

const CommandPaletteMemo = React.memo(CommandPalette);
export { CommandPaletteMemo as CommandPalette };
