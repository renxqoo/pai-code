/** 项目文件树节点：目录节点由文件路径聚合，叶子为文件。 */
export type ProjectFileNode = {
  name: string;
  /** 相对项目根的路径（'/' 分隔，目录节点以聚合路径标识）。 */
  path: string;
  kind: 'dir' | 'file';
  children: readonly ProjectFileNode[];
};

/**
 * 相对路径数组 → 文件树：目录节点按路径段聚合；同级排序目录在前、
 * 其后文件，均按名称字典序（不区分大小写、稳定）。空输入空数组。
 */
export function buildFileTree(relPaths: readonly string[]): readonly ProjectFileNode[] {
  const root: MutableNode = { name: '', path: '', kind: 'dir', children: new Map() };
  for (const rel of relPaths) {
    if (rel.length === 0) continue;
    const segments = rel.split('/');
    let node = root;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment === undefined || segment.length === 0) continue;
      const isLeaf = index === segments.length - 1;
      const path = segments.slice(0, index + 1).join('/');
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { name: segment, path, kind: isLeaf ? 'file' : 'dir', children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
  }
  return sortChildren(root);
}

type MutableNode = {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  children: Map<string, MutableNode>;
};

function sortChildren(node: MutableNode): ProjectFileNode[] {
  const entries = [...node.children.values()];
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
  });
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    children: entry.kind === 'dir' ? sortChildren(entry) : [],
  }));
}
