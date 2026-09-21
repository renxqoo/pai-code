import * as React from 'react';
import { RotateCw } from 'lucide-react';

import type { ApiData, ApiError, ApiOutcome } from '@paiapp/contracts';
import { IconButton, SegmentedControl } from '@paiapp/ui';

import { copy } from '@/strings';
import { MarkdownText } from '@/thread/markdown-text';
import { highlightFileHtml } from '@/thread/shiki-core';

type FilePaneProps = {
  cwd: string
  path: string
  readProjectFile: (cwd: string, path: string) => Promise<ApiOutcome<'file/read'>>
}

type FilePhase =
  | { kind: 'loading' }
  | { kind: 'error'; error: ApiError }
  | { kind: 'content'; result: ApiData<'file/read'> };

/** Markdown 文件（预览/源码切换的数据面）。 */
export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

/** 文件扩展名 → 高亮语言标注（复用 code-languages 别名表：ts/py/md/yaml…）。 */
export function fileLanguageOf(path: string): string {
  const extension = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : '';
  return extension.toLowerCase();
}

/** file/read 失败文案表（kind 分派；同 kind 内保留原 token 细分的两条）。 */
export interface FilePaneErrorTexts {
  invalidParams: string;
  notFound: string;
  binary: string;
  pathForbidden: string;
  cwdForbidden: string;
  cwdNotFound: string;
  readFailed: string;
}

/** file/read 失败 error → 用户文案（kind 分派；invalid_params/io_failed 内按原
 *  token 细分，未知 kind 走通用读取失败）。 */
export function filePaneErrorText(error: ApiError, texts: FilePaneErrorTexts): string {
  switch (error.kind) {
    case 'invalid_params':
      return error.message === 'binary_file' ? texts.binary : texts.invalidParams;
    case 'io_failed':
      return error.message === 'not_found' ? texts.notFound : texts.readFailed;
    case 'path_forbidden':
      return texts.pathForbidden;
    case 'cwd_forbidden':
      return texts.cwdForbidden;
    case 'cwd_not_found':
      return texts.cwdNotFound;
    default:
      return texts.readFailed;
  }
}

/**
 * 文件查看 pane：打开时读取一次 + 手动刷新；Markdown 文件默认预览（streamdown
 * 管线渲染）可切源码；其余文件 Shiki 高亮（未就绪/无 grammar 降级纯文本）。
 * 快速切 tab 的晚到应答按世代号丢弃。
 */
function FilePane({ cwd, path, readProjectFile }: FilePaneProps) {
  const [phase, setPhase] = React.useState<FilePhase>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = React.useState(0);
  const markdown = isMarkdownPath(path);
  const [mode, setMode] = React.useState<'preview' | 'source'>(markdown ? 'preview' : 'source');
  const [highlightHtml, setHighlightHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPhase({ kind: 'loading' });
    let disposed = false;
    void readProjectFile(cwd, path).then((outcome) => {
      if (disposed) return;
      setPhase(outcome.ok ? { kind: 'content', result: outcome.data } : { kind: 'error', error: outcome.error });
    });
    return () => {
      disposed = true;
    };
  }, [cwd, path, reloadToken, readProjectFile]);

  React.useEffect(() => {
    if (phase.kind !== 'content') return;
    let disposed = false;
    setHighlightHtml(null);
    if (markdown && mode === 'preview') return;
    void highlightFileHtml(phase.result.content, fileLanguageOf(path)).then((html) => {
      if (!disposed) setHighlightHtml(html);
    });
    return () => {
      disposed = true;
    };
  }, [phase, markdown, mode, path]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[32px] shrink-0 items-center gap-[8px] border-b border-border px-[14px]">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-none text-muted-foreground" title={path}>
          {path}
        </span>
        {markdown ? (
          <SegmentedControl
            aria-label={copy.panel.file.modeAria}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'preview', label: copy.panel.file.preview },
              { value: 'source', label: copy.panel.file.source },
            ]}
          />
        ) : null}
        <IconButton label={copy.panel.file.refresh} size="sm" onClick={() => setReloadToken((token) => token + 1)}>
          <RotateCw strokeWidth={1.75} />
        </IconButton>
      </div>
      {phase.kind === 'error' ? (
        <div className="flex flex-1 items-center justify-center px-[14px] pb-[10px]">
          <p className="text-[12px] leading-[19px] text-muted-foreground/80">{filePaneErrorText(phase.error, copy.panel.file.errors)}</p>
        </div>
      ) : phase.kind === 'loading' ? (
        <div className="flex flex-1 items-center justify-center px-[14px] pb-[10px]">
          <p className="text-[12px] leading-[19px] text-muted-foreground/80">{copy.panel.file.loading}</p>
        </div>
      ) : (
        <>
          {phase.result.truncated ? (
            <p className="shrink-0 px-[14px] pt-[8px] text-[11px] leading-[16px] text-amber-600 dark:text-amber-400">
              {copy.panel.file.truncated}
            </p>
          ) : null}
          {markdown && mode === 'preview' ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-[14px] py-[10px]">
              <MarkdownText text={phase.result.content} className="text-[13px] leading-[22px]" />
            </div>
          ) : (
            <div className="file-code min-h-0 flex-1 overflow-auto px-[10px] py-[8px]">
              {highlightHtml === null ? (
                <pre className="font-mono text-[11.5px] leading-[19px] whitespace-pre text-foreground">{phase.result.content}</pre>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: highlightHtml }} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const FilePaneMemo = React.memo(FilePane);
export { FilePaneMemo as FilePane };
