import * as React from 'react';

/** React 元素的 props 袋（元素树遍历的通用形状）。 */
export type ElementProps = Record<string, unknown>;

/**
 * SSR 冒烟测试拿不到 DOM，也点不了事件；本模块把组件返回的元素树摊平成 props 列表，
 * 让测试能直接触发 onClick / onChange 等回调，验证「事件 → 回调」接线本身。
 * 前提：被测组件自身不调用 hooks（含 useState 的组件不能在测试里直接调用）。
 */
export function collectElementProps(node: React.ReactNode, out: ElementProps[] = []): ElementProps[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElementProps(child, out);
    return out;
  }
  if (typeof node !== 'object' || node === null || !('props' in node)) return out;
  const { props } = node as unknown as { props: ElementProps };
  out.push(props);
  collectElementProps(props['children'] as React.ReactNode, out);
  return out;
}

/** 按条件找元素 props；找不到即抛错（不静默跳过接线断言）。 */
export function findElementProps(tree: React.ReactNode, match: (props: ElementProps) => boolean): ElementProps {
  const target = collectElementProps(tree).find(match);
  if (target === undefined) throw new Error('未找到目标元素');
  return target;
}

/** 按可访问名（aria-label）定位并触发 onClick。 */
export function clickByLabel(tree: React.ReactNode, label: string): void {
  const target = findElementProps(tree, (props) => props['aria-label'] === label);
  (target['onClick'] as () => void)();
}

/** 按文案子节点定位并触发 onClick（图标按钮等无文本节点时用 aria-label 版）。 */
export function clickByText(tree: React.ReactNode, text: string): void {
  const target = findElementProps(
    tree,
    (props) => Array.isArray(props['children']) && (props['children'] as unknown[]).includes(text),
  );
  (target['onClick'] as () => void)();
}
