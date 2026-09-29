import * as React from 'react';

type FiberLike = { child?: FiberLike; sibling?: FiberLike; memoizedProps?: unknown };

type Seek = {
  group: readonly string[]
  avoid: readonly string[]
  name: string
};

/**
 * React 树 props 直调（测试专用白盒口）：Base UI Portal 壳在 happy-dom 挂不出内容，
 * 弹层内的按钮既点不到也造不出——这里从挂载根的 fiber 树深搜指定函数 prop 直接调用，
 * 只用于打通「Portal 壳内入口」到「真实挂载面（弹窗/chip/表单）」的第一跳；后续交互
 * 一律走真实 DOM（点击 / fireChange）。可点的 DOM 一律不许走本口。
 * 同名 prop 多处存在（onSelect/onCreate/onSubmit 遍布组件树）时用 group/avoid 定位宿主 props 袋。
 */
export function callProp(root: HTMLElement, name: string, ...args: unknown[]): boolean {
  return seek(root, { group: [], avoid: [], name }, args);
}

export function callPropIn(root: HTMLElement, groupKeys: readonly string[], name: string, ...args: unknown[]): boolean {
  return seek(root, { group: groupKeys, avoid: [], name }, args);
}

export function callPropAvoiding(root: HTMLElement, avoidKeys: readonly string[], groupKeys: readonly string[], name: string, ...args: unknown[]): boolean {
  return seek(root, { group: groupKeys, avoid: avoidKeys, name }, args);
}

function seek(root: HTMLElement, spec: Seek, args: readonly unknown[]): boolean {
  const containerKey = Object.keys(root).find((key) => key.startsWith('__reactContainer$'));
  const marker = containerKey === undefined ? undefined : (root as unknown as Record<string, unknown>)[containerKey];
  if (marker === undefined || marker === null || typeof marker !== 'object') throw new Error('fiber 根不可达');
  // 容器上的标记 fiber 是 root 的 alternate（child 恒空）——已提交树挂在 stateNode.current 上
  const holder = marker as { stateNode?: { current?: FiberLike }; alternate?: FiberLike; child?: FiberLike };
  const tree = holder.stateNode?.current ?? holder.alternate ?? holder;
  const hit = findProp(tree.child ?? holder.child, spec, new Set(), 0);
  if (hit === undefined) return false;
  React.act(() => {
    hit(...args);
  });
  return true;
}

function findProp(node: unknown, spec: Seek, seen: Set<object>, depth: number): ((...params: unknown[]) => void) | undefined {
  if (depth > 40 || node === null || typeof node !== 'object') return undefined;
  const fiber = node as FiberLike;
  const fromProps = scanProps(fiber.memoizedProps, spec, seen, depth);
  if (fromProps !== undefined) return fromProps;
  return findProp(fiber.child, spec, seen, depth + 1) ?? findProp(fiber.sibling, spec, seen, depth + 1);
}

function scanProps(props: unknown, spec: Seek, seen: Set<object>, depth: number): ((...params: unknown[]) => void) | undefined {
  if (depth > 12 || props === null || typeof props !== 'object') return undefined;
  if (seen.has(props as object)) return undefined;
  seen.add(props as object);
  const bag = props as Record<string, unknown>;
  if (typeof bag[spec.name] === 'function' && spec.group.every((key) => key in bag) && spec.avoid.every((key) => !(key in bag))) {
    return bag[spec.name] as (...params: unknown[]) => void;
  }
  for (const [key, value] of Object.entries(bag)) {
    if (key === spec.name && typeof value === 'function') continue;
    const nested = scanProps(value, spec, seen, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}
