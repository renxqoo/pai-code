import * as React from 'react';
import type { ReactNode } from 'react';

type RenderGuardProps = { readonly fallback: ReactNode; readonly children: ReactNode };
type RenderGuardState = { readonly failed: boolean };

/** 渲染错误边界（class 是 React 错误边界的唯一形态，无函数式 API）：
 * 子树渲染抛错（垃圾输入闯进解析器等）一律降级 fallback，不炸整屏（T56 §2 不变量 3）。 */
export class RenderGuard extends React.Component<RenderGuardProps, RenderGuardState> {
  constructor(props: RenderGuardProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): RenderGuardState {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
