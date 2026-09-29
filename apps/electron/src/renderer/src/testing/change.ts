import * as React from 'react';

/**
 * 受控输入改值（平台坑：happy-dom 的 input/change 合成事件链不触发 React onChange，
 * 原生 setter + 事件四形态实测均不达）。直取节点上的 React props 调 onChange——
 * 走真实事件处理器与状态更新，仅绕过合成事件分发层。
 */
export function fireChange(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const props = propsOf(input);
  React.act(() => {
    props.onChange?.({ target: { value } });
  });
}

/** 同款白盒口：键盘事件合成链同样不通（React onKeyDown 不达）——直调 onKeyDown。 */
export function fireKeyDown(input: HTMLInputElement | HTMLTextAreaElement, key: string, isComposing = false): void {
  const props = propsOf(input);
  React.act(() => {
    props.onKeyDown?.({ key, nativeEvent: { isComposing }, preventDefault: () => undefined });
  });
}

type ElementProps = {
  onChange?: (event: { target: { value: string } }) => void
  onKeyDown?: (event: { key: string; nativeEvent: { isComposing: boolean }; preventDefault: () => void }) => void
};

function propsOf(element: HTMLInputElement | HTMLTextAreaElement): ElementProps {
  const key = Object.keys(element).find((name) => name.startsWith('__reactProps$'));
  return (element as unknown as Record<string, ElementProps | undefined>)[key ?? ''] ?? {};
}
