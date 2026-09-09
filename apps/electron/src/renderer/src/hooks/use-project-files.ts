import * as React from 'react';

import { buildFileTree, type ProjectFileNode } from '@/sidebar/build-file-tree';

export type ProjectFilesTarget = { name: string; path: string };

type ListProjectFiles = (cwd: string) => Promise<string[] | null>;

/**
 * 项目文件面板编排（T18）：目标项目、文件树、加载态。
 * 请求按代次防竞态（迟到的旧项目响应不得覆盖新目标）；关闭即复位。
 */
export function useProjectFiles(listProjectFiles: ListProjectFiles): {
  target: ProjectFilesTarget | null;
  tree: readonly ProjectFileNode[];
  loading: boolean;
  open: (cwd: string, displayName: string) => void;
  close: () => void;
} {
  const [target, setTarget] = React.useState<ProjectFilesTarget | null>(null);
  const [tree, setTree] = React.useState<readonly ProjectFileNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const epoch = React.useRef(0);

  const open = React.useCallback(
    (cwd: string, displayName: string) => {
      setTarget({ name: displayName, path: cwd });
      setTree([]);
      setLoading(true);
      epoch.current += 1;
      const current = epoch.current;
      void listProjectFiles(cwd).then((paths) => {
        if (epoch.current !== current) return;
        setTree(buildFileTree(paths ?? []));
        setLoading(false);
      });
    },
    [listProjectFiles],
  );

  const close = React.useCallback(() => setTarget(null), []);

  return { target, tree, loading, open, close };
}
