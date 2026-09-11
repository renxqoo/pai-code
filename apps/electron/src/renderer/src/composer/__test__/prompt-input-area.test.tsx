import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { PromptInputArea } from '../prompt-input-area';
import { render } from '@/testing/render';
import type { CommandView } from '@paiapp/contracts';

/**
 * 补全采纳后的光标定位（T33 初审中-10 承诺项）：acceptToken → pendingCaret →
 * effect 仅对对象 ref 调 setSelectionRange——回调 ref 会静默丢失定位（区域/装配
 * 必须传对象 ref 的约束钉子）。
 */

const SKILL: CommandView = { name: 'skill:writer', description: null, source: 'skill' };

/** 真受控宿主：草稿（props.value）驱动 + 采纳 onChange 回流同一状态——与真实链路同构
 * （happy-dom 的 input 合成事件链不通，见 T32 装置适配记录；渲染期同步让采纳与值回流
 * 同一次 commit，setSelectionRange 不被旧值长度钳制）。 */
function ControlledArea(props: { value: string; ref?: React.Ref<HTMLTextAreaElement> }): React.JSX.Element {
  const [current, setCurrent] = React.useState(props.value);
  const lastProp = React.useRef(props.value);
  if (lastProp.current !== props.value) {
    lastProp.current = props.value;
    setCurrent(props.value); // 渲染期受控同步（外部草稿变化即刻生效）
  }
  return (
    <PromptInputArea
      value={current}
      onChange={setCurrent}
      placeholder="输入消息"
      textareaRef={props.ref}
      commands={[SKILL]}
      slashAriaLabel="命令补全"
      fileAriaLabel="文件补全"
      onSearchFiles={() => Promise.resolve(null)}
      queueing={false}
    />
  );
}

describe('PromptInputArea 补全采纳光标定位', () => {
  test('对象 ref：草稿驱动 → 弹层采纳 → 值换完整命令串且光标定位采纳串末尾（不残留选区）', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    const view = render(<ControlledArea value="" ref={ref} />);
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement;
    // 草稿变化（外部回填路径）：回填 effect 置 caret 末尾 → / 补全弹层
    view.rerender(<ControlledArea value="/skill:wri" ref={ref} />);
    const option = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('skill:writer'));
    expect(option).toBeDefined();
    React.act(() => {
      option?.click();
    });
    expect(input.value).toBe('/skill:writer ');
    expect(ref.current?.selectionStart).toBe('/skill:writer '.length);
    expect(ref.current?.selectionEnd).toBe('/skill:writer '.length);
    view.unmount();
  });

  test('回调 ref：采纳仍换值不抛错（定位静默丢失即本约束要防的回归面）', () => {
    const view = render(<ControlledArea value="" ref={() => undefined} />);
    const input = view.container.querySelector('textarea') as HTMLTextAreaElement;
    view.rerender(<ControlledArea value="/skill:wri" ref={() => undefined} />);
    const option = [...view.container.querySelectorAll('button')].find((b) => b.textContent?.includes('skill:writer'));
    React.act(() => {
      option?.click();
    });
    expect(input.value).toBe('/skill:writer ');
    view.unmount();
  });
});
