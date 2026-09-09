import * as React from 'react';
import { ArrowLeft, File, FileCode, FileCog, FileImage, FileText, Search } from 'lucide-react';

import { ChevronToggle } from '@paiapp/ui';

import { filterFileTree } from '@/project-files/filter-file-tree';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import type { ProjectFileNode } from '@/sidebar/build-file-tree';

type ProjectFilesPanelProps = {
  /** 显示名（项目目录 basename）。 */
  projectName: string
  /** 项目绝对路径（顶行展示）。 */
  projectPath: string
  /** 项目文件树（目录在前文件在后，已由 buildFileTree 排序）。 */
  tree: readonly ProjectFileNode[]
  loading: boolean
  /** 返回任务列表由本按钮与全局 Esc 链触发；面板不自带键盘监听。 */
  onClose: () => void
};

type FileIconCategory = 'code' | 'text' | 'image' | 'config' | 'other';

const fileIconCategoryByExtension: Readonly<Record<string, FileIconCategory | undefined>> = {
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  css: 'code',
  scss: 'code',
  html: 'code',
  htm: 'code',
  vue: 'code',
  svelte: 'code',
  py: 'code',
  rs: 'code',
  go: 'code',
  java: 'code',
  kt: 'code',
  swift: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  hpp: 'code',
  cs: 'code',
  rb: 'code',
  php: 'code',
  sh: 'code',
  bash: 'code',
  zsh: 'code',
  sql: 'code',
  md: 'text',
  mdx: 'text',
  txt: 'text',
  log: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  avif: 'image',
  bmp: 'image',
  ico: 'image',
  json: 'config',
  jsonc: 'config',
  yaml: 'config',
  yml: 'config',
  toml: 'config',
  ini: 'config',
  cfg: 'config',
  conf: 'config',
  xml: 'config',
  properties: 'config',
  lock: 'config',
  lockb: 'config',
  env: 'config',
};

const fileIconComponentByCategory: Readonly<Record<FileIconCategory, typeof File>> = {
  code: FileCode,
  text: FileText,
  image: FileImage,
  config: FileCog,
  other: File,
};

const fileIconClassByCategory: Readonly<Record<FileIconCategory, string>> = {
  code: 'text-sky-600',
  text: 'text-blue-500',
  image: 'text-violet-500',
  config: 'text-amber-500',
  other: 'text-muted-foreground',
};

/** 文件名 → 图标类别：按扩展名分常见几类；无扩展名点文件（.env/.gitignore 等）按配置处理。 */
function fileIconCategory(name: string): FileIconCategory {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const byExtension = dot > 0 ? fileIconCategoryByExtension[lower.slice(dot + 1)] : undefined;
  return byExtension ?? (lower.startsWith('.') ? 'config' : 'other');
}

type FlatFileRow = { node: ProjectFileNode; depth: number };

/** 展开态约束下的可见行（深度优先，保持数据既有的目录在前排序）。 */
function collectVisibleRows(
  nodes: readonly ProjectFileNode[],
  depth: number,
  expandedDirs: ReadonlySet<string>,
  rows: FlatFileRow[],
): void {
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.kind === 'dir' && expandedDirs.has(node.path)) {
      collectVisibleRows(node.children, depth + 1, expandedDirs, rows);
    }
  }
}

/** 默认展开层级：第一层目录。 */
function firstLevelDirPaths(nodes: readonly ProjectFileNode[]): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.kind === 'dir' && node.children.length > 0) paths.add(node.path);
  }
  return paths;
}

const ROW_BASE_INDENT_PX = 8;
const ROW_INDENT_STEP_PX = 14;
const EMPTY_STATE_CLASS = 'px-2 pt-6 text-center text-[11.5px] leading-[16px] text-muted-foreground/80';

/** 项目文件面板（侧栏内嵌）：返回行 + 搜索框 + 可折叠文件树；侧栏同宽，不影响右侧主区。 */
function ProjectFilesPanel({ projectName, projectPath, tree, loading, onClose }: ProjectFilesPanelProps) {
  const [query, setQuery] = React.useState('');
  const [expandedDirs, setExpandedDirs] = React.useState<ReadonlySet<string>>(() => firstLevelDirPaths(tree));
  const [expandedFor, setExpandedFor] = React.useState(projectPath);
  if (expandedFor !== projectPath) {
    // 切换项目时在 render 阶段重置展开态与搜索词（React 受控 state 调整模式）
    setExpandedFor(projectPath);
    setExpandedDirs(firstLevelDirPaths(tree));
    setQuery('');
  }

  const toggleDir = (path: string): void => {
    setExpandedDirs((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const visibleTree = loading ? [] : filterFileTree(tree, query);
  const rows: FlatFileRow[] = [];
  collectVisibleRows(visibleTree, 0, expandedDirs, rows);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-[6px] pt-[2px]">
        <button
          type="button"
          aria-label={copy.sidebar.closeProjectFiles}
          title={copy.sidebar.closeProjectFiles}
          onClick={onClose}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-[15px]" strokeWidth={1.75} />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] leading-[17px] font-medium text-foreground">{projectName}</p>
          <p title={projectPath} className="truncate font-mono text-[10.5px] leading-[14px] text-muted-foreground">
            {projectPath}
          </p>
        </div>
      </div>
      <label className="mt-[10px] flex h-[28px] shrink-0 cursor-text items-center gap-[7px] rounded-[8px] border border-border bg-background px-[8px] focus-within:border-foreground/25">
        <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.sidebar.search}
          className="h-full min-w-0 flex-1 bg-transparent text-[12px] leading-none text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto pt-2 pb-2">
        {loading ? (
          <p className={EMPTY_STATE_CLASS}>{copy.sidebar.projectFilesLoading}</p>
        ) : rows.length === 0 ? (
          <p className={EMPTY_STATE_CLASS}>{copy.sidebar.projectFilesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-[1px]">
            {rows.map(({ node, depth }) => {
              const expanded = node.kind === 'dir' && expandedDirs.has(node.path);
              const category = node.kind === 'file' ? fileIconCategory(node.name) : null;
              const FileIcon = category === null ? null : fileIconComponentByCategory[category];
              const indentStyle: React.CSSProperties = {
                paddingLeft: ROW_BASE_INDENT_PX + depth * ROW_INDENT_STEP_PX,
              };
              return (
                <li key={node.path}>
                  {node.kind === 'dir' ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleDir(node.path)}
                      style={indentStyle}
                      className="flex h-[26px] w-full cursor-pointer items-center gap-[7px] rounded-[7px] pr-[8px] text-left outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="flex size-[14px] shrink-0 items-center justify-center">
                        <ChevronToggle open={expanded} variant="disclose" />
                      </span>
                      <span className="min-w-0 truncate text-[12px] leading-none font-medium text-foreground/90">
                        {node.name}
                      </span>
                    </button>
                  ) : (
                    <div style={indentStyle} className="flex h-[26px] items-center gap-[7px] pr-[8px]">
                      <span className="flex size-[14px] shrink-0 items-center justify-center">
                        {category === null || FileIcon === null ? null : (
                          <FileIcon
                            className={cn('size-[14px]', fileIconClassByCategory[category])}
                            strokeWidth={1.75}
                          />
                        )}
                      </span>
                      <span className="min-w-0 truncate text-[12px] leading-none text-foreground/85">{node.name}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const ProjectFilesPanelMemo = React.memo(ProjectFilesPanel);
export { ProjectFilesPanelMemo as ProjectFilesPanel };
export type { ProjectFilesPanelProps };
