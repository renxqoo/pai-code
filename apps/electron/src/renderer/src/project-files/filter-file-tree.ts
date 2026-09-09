import type { ProjectFileNode } from '@/sidebar/build-file-tree';

/**
 * 项目文件树按查询过滤：文件名/路径子串命中（大小写不敏感）保留，
 * 其祖先目录链保留；目录本身命中则整棵子树保留。空查询原样返回。
 */
export function filterFileTree(tree: readonly ProjectFileNode[], query: string): readonly ProjectFileNode[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return tree;

  const filterNodes = (nodes: readonly ProjectFileNode[]): ProjectFileNode[] => {
    const kept: ProjectFileNode[] = [];
    for (const node of nodes) {
      if (node.kind === 'file') {
        if (node.path.toLowerCase().includes(needle)) kept.push(node);
        continue;
      }
      if (node.path.toLowerCase().includes(needle)) {
        kept.push(node);
        continue;
      }
      const children = filterNodes(node.children);
      if (children.length > 0) kept.push({ ...node, children });
    }
    return kept;
  };

  return filterNodes(tree);
}
